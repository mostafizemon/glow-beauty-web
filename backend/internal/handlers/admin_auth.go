package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"time"

	"glow-beauty-goals/internal/middleware"
	"glow-beauty-goals/internal/models"

	"github.com/golang-jwt/jwt/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

// AdminAuthHandler handles admin authentication endpoints.
type AdminAuthHandler struct {
	pool           *pgxpool.Pool
	adminJWTSecret string
}

// NewAdminAuthHandler creates a new AdminAuthHandler.
func NewAdminAuthHandler(pool *pgxpool.Pool, adminJWTSecret string) *AdminAuthHandler {
	return &AdminAuthHandler{
		pool:           pool,
		adminJWTSecret: adminJWTSecret,
	}
}

// Login handles POST /api/admin/auth/login
func (h *AdminAuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req models.AdminLoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, models.APIResponse{
			Success: false, Error: "Invalid request body",
		})
		return
	}

	if req.Email == "" || req.Password == "" {
		writeJSON(w, http.StatusBadRequest, models.APIResponse{
			Success: false, Error: "Email and password are required",
		})
		return
	}

	// Find admin by email
	var admin models.AdminUser
	err := h.pool.QueryRow(r.Context(),
		`SELECT id, name, email, phone, password_hash, role, is_active, created_at, last_login
		 FROM admin_users WHERE email = $1`, req.Email,
	).Scan(
		&admin.ID, &admin.Name, &admin.Email, &admin.Phone,
		&admin.PasswordHash, &admin.Role, &admin.IsActive,
		&admin.CreatedAt, &admin.LastLogin,
	)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, models.APIResponse{
			Success: false, Error: "Invalid email or password",
		})
		return
	}

	if !admin.IsActive {
		writeJSON(w, http.StatusForbidden, models.APIResponse{
			Success: false, Error: "Account is deactivated",
		})
		return
	}

	// Verify password
	if err := bcrypt.CompareHashAndPassword([]byte(admin.PasswordHash), []byte(req.Password)); err != nil {
		writeJSON(w, http.StatusUnauthorized, models.APIResponse{
			Success: false, Error: "Invalid email or password",
		})
		return
	}

	// Generate JWT (8 hour expiry)
	claims := &middleware.AdminClaims{
		AdminID: admin.ID.String(),
		Email:   admin.Email,
		Role:    admin.Role,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(8 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    "glow-beauty-admin",
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenStr, err := token.SignedString([]byte(h.adminJWTSecret))
	if err != nil {
		log.Printf("ERROR: sign admin JWT: %v", err)
		writeJSON(w, http.StatusInternalServerError, models.APIResponse{
			Success: false, Error: "Failed to generate token",
		})
		return
	}

	// Update last_login
	_, _ = h.pool.Exec(r.Context(),
		`UPDATE admin_users SET last_login = NOW() WHERE id = $1`, admin.ID,
	)

	// Set httpOnly cookie
	http.SetCookie(w, &http.Cookie{
		Name:     "admin_token",
		Value:    tokenStr,
		Path:     "/",
		HttpOnly: true,
		Secure:   r.TLS != nil,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   8 * 60 * 60, // 8 hours
	})

	writeJSON(w, http.StatusOK, models.APIResponse{
		Success: true,
		Message: "Login successful",
		Data:    admin,
	})
}

// Logout handles POST /api/admin/auth/logout
func (h *AdminAuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name:     "admin_token",
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   r.TLS != nil,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1, // delete cookie
	})

	writeJSON(w, http.StatusOK, models.APIResponse{
		Success: true,
		Message: "Logged out successfully",
	})
}

// Me handles GET /api/admin/auth/me
func (h *AdminAuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	adminID := middleware.GetAdminID(r.Context())
	if adminID.String() == "00000000-0000-0000-0000-000000000000" {
		writeJSON(w, http.StatusUnauthorized, models.APIResponse{
			Success: false, Error: "Not authenticated",
		})
		return
	}

	var admin models.AdminUser
	err := h.pool.QueryRow(r.Context(),
		`SELECT id, name, email, phone, role, is_active, created_at, last_login
		 FROM admin_users WHERE id = $1`, adminID,
	).Scan(
		&admin.ID, &admin.Name, &admin.Email, &admin.Phone,
		&admin.Role, &admin.IsActive, &admin.CreatedAt, &admin.LastLogin,
	)
	if err != nil {
		writeJSON(w, http.StatusNotFound, models.APIResponse{
			Success: false, Error: "Admin user not found",
		})
		return
	}

	writeJSON(w, http.StatusOK, models.APIResponse{
		Success: true,
		Data:    admin,
	})
}

// writeJSON is a helper shared across handlers.
func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(data); err != nil {
		log.Printf("ERROR: encode JSON response: %v", err)
	}
}
