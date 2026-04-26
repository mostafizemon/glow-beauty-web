package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"time"

	"glow-beauty-goals/internal/middleware"
	"glow-beauty-goals/internal/models"

	"github.com/golang-jwt/jwt/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

// AuthHandler handles customer authentication endpoints.
type AuthHandler struct {
	pool      *pgxpool.Pool
	jwtSecret string
}

// NewAuthHandler creates a new AuthHandler.
func NewAuthHandler(pool *pgxpool.Pool, jwtSecret string) *AuthHandler {
	return &AuthHandler{
		pool:      pool,
		jwtSecret: jwtSecret,
	}
}

// Register handles POST /api/auth/register
func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	var req models.RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, models.APIResponse{
			Success: false, Error: "Invalid request body",
		})
		return
	}

	if req.Phone == "" || req.Name == "" || req.Password == "" {
		writeJSON(w, http.StatusBadRequest, models.APIResponse{
			Success: false, Error: "Phone, name, and password are required",
		})
		return
	}

	if len(req.Password) < 6 {
		writeJSON(w, http.StatusBadRequest, models.APIResponse{
			Success: false, Error: "Password must be at least 6 characters",
		})
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, models.APIResponse{
			Success: false, Error: "Failed to process password",
		})
		return
	}

	var customer models.Customer

	// Check if a guest customer with this phone exists
	err = h.pool.QueryRow(r.Context(),
		`SELECT id, phone, name, is_registered FROM customers WHERE phone = $1`, req.Phone,
	).Scan(&customer.ID, &customer.Phone, &customer.Name, &customer.IsRegistered)

	if err == nil {
		// Customer exists
		if customer.IsRegistered {
			writeJSON(w, http.StatusConflict, models.APIResponse{
				Success: false, Error: "Phone number already registered",
			})
			return
		}
		// Guest user upgrading to registered — update their record
		err = h.pool.QueryRow(r.Context(),
			`UPDATE customers SET name = $1, password_hash = $2, is_registered = true
			 WHERE id = $3
			 RETURNING id, phone, name, email, is_registered, created_at`,
			req.Name, string(hash), customer.ID,
		).Scan(&customer.ID, &customer.Phone, &customer.Name, &customer.Email, &customer.IsRegistered, &customer.CreatedAt)
		if err != nil {
			log.Printf("ERROR: upgrade guest to registered: %v", err)
			writeJSON(w, http.StatusInternalServerError, models.APIResponse{
				Success: false, Error: "Registration failed",
			})
			return
		}
	} else if err == pgx.ErrNoRows {
		// New customer
		err = h.pool.QueryRow(r.Context(),
			`INSERT INTO customers (phone, name, password_hash, is_registered)
			 VALUES ($1, $2, $3, true)
			 RETURNING id, phone, name, email, is_registered, created_at`,
			req.Phone, req.Name, string(hash),
		).Scan(&customer.ID, &customer.Phone, &customer.Name, &customer.Email, &customer.IsRegistered, &customer.CreatedAt)
		if err != nil {
			log.Printf("ERROR: create customer: %v", err)
			writeJSON(w, http.StatusConflict, models.APIResponse{
				Success: false, Error: "Registration failed — phone may already be in use",
			})
			return
		}
	} else {
		log.Printf("ERROR: check existing customer: %v", err)
		writeJSON(w, http.StatusInternalServerError, models.APIResponse{
			Success: false, Error: "Registration failed",
		})
		return
	}

	// Generate JWT
	tokenStr, err := h.generateToken(customer.ID.String(), customer.Phone, false)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, models.APIResponse{
			Success: false, Error: "Failed to generate token",
		})
		return
	}

	h.setAuthCookie(w, r, tokenStr)

	writeJSON(w, http.StatusCreated, models.APIResponse{
		Success: true,
		Message: "Registration successful",
		Data:    customer,
	})
}

// Login handles POST /api/auth/login
func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req models.LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, models.APIResponse{
			Success: false, Error: "Invalid request body",
		})
		return
	}

	if req.Phone == "" || req.Password == "" {
		writeJSON(w, http.StatusBadRequest, models.APIResponse{
			Success: false, Error: "Phone and password are required",
		})
		return
	}

	var customer models.Customer
	err := h.pool.QueryRow(r.Context(),
		`SELECT id, phone, name, email, password_hash, is_registered, created_at
		 FROM customers WHERE phone = $1`, req.Phone,
	).Scan(&customer.ID, &customer.Phone, &customer.Name, &customer.Email,
		&customer.PasswordHash, &customer.IsRegistered, &customer.CreatedAt)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, models.APIResponse{
			Success: false, Error: "Invalid phone or password",
		})
		return
	}

	if !customer.IsRegistered || customer.PasswordHash == "" {
		writeJSON(w, http.StatusUnauthorized, models.APIResponse{
			Success: false, Error: "Account not registered. Please register first.",
		})
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(customer.PasswordHash), []byte(req.Password)); err != nil {
		writeJSON(w, http.StatusUnauthorized, models.APIResponse{
			Success: false, Error: "Invalid phone or password",
		})
		return
	}

	tokenStr, err := h.generateToken(customer.ID.String(), customer.Phone, false)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, models.APIResponse{
			Success: false, Error: "Failed to generate token",
		})
		return
	}

	h.setAuthCookie(w, r, tokenStr)

	writeJSON(w, http.StatusOK, models.APIResponse{
		Success: true,
		Message: "Login successful",
		Data:    customer,
	})
}

// Guest handles POST /api/auth/guest — creates or retrieves guest user for checkout.
func (h *AuthHandler) Guest(w http.ResponseWriter, r *http.Request) {
	var req models.GuestRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, models.APIResponse{
			Success: false, Error: "Invalid request body",
		})
		return
	}

	if req.Phone == "" || req.Name == "" {
		writeJSON(w, http.StatusBadRequest, models.APIResponse{
			Success: false, Error: "Phone and name are required",
		})
		return
	}

	var customer models.Customer

	// Check if customer already exists with this phone
	err := h.pool.QueryRow(r.Context(),
		`SELECT id, phone, name, email, is_registered, created_at
		 FROM customers WHERE phone = $1`, req.Phone,
	).Scan(&customer.ID, &customer.Phone, &customer.Name, &customer.Email, &customer.IsRegistered, &customer.CreatedAt)

	if err == pgx.ErrNoRows {
		// Create new guest customer (no password)
		err = h.pool.QueryRow(r.Context(),
			`INSERT INTO customers (phone, name, is_registered)
			 VALUES ($1, $2, false)
			 RETURNING id, phone, name, email, is_registered, created_at`,
			req.Phone, req.Name,
		).Scan(&customer.ID, &customer.Phone, &customer.Name, &customer.Email, &customer.IsRegistered, &customer.CreatedAt)
		if err != nil {
			log.Printf("ERROR: create guest customer: %v", err)
			writeJSON(w, http.StatusInternalServerError, models.APIResponse{
				Success: false, Error: "Failed to create guest account",
			})
			return
		}
	} else if err != nil {
		log.Printf("ERROR: check existing customer: %v", err)
		writeJSON(w, http.StatusInternalServerError, models.APIResponse{
			Success: false, Error: "Failed to process guest login",
		})
		return
	}
	// If customer exists (registered or guest), just issue a token

	tokenStr, err := h.generateToken(customer.ID.String(), customer.Phone, !customer.IsRegistered)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, models.APIResponse{
			Success: false, Error: "Failed to generate token",
		})
		return
	}

	h.setAuthCookie(w, r, tokenStr)

	writeJSON(w, http.StatusOK, models.APIResponse{
		Success: true,
		Message: "Guest login successful",
		Data:    customer,
	})
}

// Logout handles POST /api/auth/logout
func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name:     "customer_token",
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   r.TLS != nil,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1,
	})

	writeJSON(w, http.StatusOK, models.APIResponse{
		Success: true,
		Message: "Logged out successfully",
	})
}

// Me handles GET /api/auth/me
func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	customerID := middleware.GetCustomerID(r.Context())
	if customerID.String() == "00000000-0000-0000-0000-000000000000" {
		writeJSON(w, http.StatusUnauthorized, models.APIResponse{
			Success: false, Error: "Not authenticated",
		})
		return
	}

	var customer models.Customer
	err := h.pool.QueryRow(r.Context(),
		`SELECT id, phone, name, email, is_registered, created_at
		 FROM customers WHERE id = $1`, customerID,
	).Scan(&customer.ID, &customer.Phone, &customer.Name, &customer.Email, &customer.IsRegistered, &customer.CreatedAt)
	if err != nil {
		writeJSON(w, http.StatusNotFound, models.APIResponse{
			Success: false, Error: "Customer not found",
		})
		return
	}

	writeJSON(w, http.StatusOK, models.APIResponse{
		Success: true,
		Data:    customer,
	})
}

func (h *AuthHandler) generateToken(customerID, phone string, isGuest bool) (string, error) {
	claims := &middleware.CustomerClaims{
		CustomerID: customerID,
		Phone:      phone,
		IsGuest:    isGuest,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(30 * 24 * time.Hour)), // 30 days
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    "glow-beauty",
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(h.jwtSecret))
}

func (h *AuthHandler) setAuthCookie(w http.ResponseWriter, r *http.Request, tokenStr string) {
	http.SetCookie(w, &http.Cookie{
		Name:     "customer_token",
		Value:    tokenStr,
		Path:     "/",
		HttpOnly: true,
		Secure:   r.TLS != nil,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   30 * 24 * 60 * 60, // 30 days
	})
}
