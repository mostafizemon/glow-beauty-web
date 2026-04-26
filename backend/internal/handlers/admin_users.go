package handlers

import (
	"encoding/json"
	"log"
	"net/http"

	"glow-beauty-goals/internal/middleware"
	"glow-beauty-goals/internal/models"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

// AdminUsersHandler handles admin user management endpoints.
type AdminUsersHandler struct {
	pool *pgxpool.Pool
}

// NewAdminUsersHandler creates a new AdminUsersHandler.
func NewAdminUsersHandler(pool *pgxpool.Pool) *AdminUsersHandler {
	return &AdminUsersHandler{pool: pool}
}

// List handles GET /api/admin/users
func (h *AdminUsersHandler) List(w http.ResponseWriter, r *http.Request) {
	rows, err := h.pool.Query(r.Context(),
		`SELECT id, name, email, phone, role, is_active, created_at, last_login
		 FROM admin_users ORDER BY created_at DESC`,
	)
	if err != nil {
		log.Printf("ERROR: list admin users: %v", err)
		writeJSON(w, http.StatusInternalServerError, models.APIResponse{
			Success: false, Error: "Failed to fetch admin users",
		})
		return
	}
	defer rows.Close()

	var users []models.AdminUser
	for rows.Next() {
		var u models.AdminUser
		if err := rows.Scan(&u.ID, &u.Name, &u.Email, &u.Phone, &u.Role, &u.IsActive, &u.CreatedAt, &u.LastLogin); err != nil {
			log.Printf("ERROR: scan admin user: %v", err)
			continue
		}
		users = append(users, u)
	}

	if users == nil {
		users = []models.AdminUser{}
	}

	writeJSON(w, http.StatusOK, models.APIResponse{
		Success: true,
		Data:    users,
	})
}

// Create handles POST /api/admin/users (superadmin only)
func (h *AdminUsersHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req models.CreateAdminRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, models.APIResponse{
			Success: false, Error: "Invalid request body",
		})
		return
	}

	if req.Name == "" || req.Email == "" || req.Password == "" {
		writeJSON(w, http.StatusBadRequest, models.APIResponse{
			Success: false, Error: "Name, email, and password are required",
		})
		return
	}

	if req.Role == "" {
		req.Role = "admin"
	}
	if req.Role != "admin" && req.Role != "superadmin" {
		writeJSON(w, http.StatusBadRequest, models.APIResponse{
			Success: false, Error: "Role must be 'admin' or 'superadmin'",
		})
		return
	}

	// Hash password
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		log.Printf("ERROR: hash password: %v", err)
		writeJSON(w, http.StatusInternalServerError, models.APIResponse{
			Success: false, Error: "Failed to process password",
		})
		return
	}

	var admin models.AdminUser
	err = h.pool.QueryRow(r.Context(),
		`INSERT INTO admin_users (name, email, phone, password_hash, role)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING id, name, email, phone, role, is_active, created_at`,
		req.Name, req.Email, req.Phone, string(hash), req.Role,
	).Scan(&admin.ID, &admin.Name, &admin.Email, &admin.Phone, &admin.Role, &admin.IsActive, &admin.CreatedAt)
	if err != nil {
		log.Printf("ERROR: create admin user: %v", err)
		writeJSON(w, http.StatusConflict, models.APIResponse{
			Success: false, Error: "Email already exists or creation failed",
		})
		return
	}

	writeJSON(w, http.StatusCreated, models.APIResponse{
		Success: true,
		Message: "Admin user created",
		Data:    admin,
	})
}

// Update handles PUT /api/admin/users/:id
func (h *AdminUsersHandler) Update(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, models.APIResponse{
			Success: false, Error: "Invalid user ID",
		})
		return
	}

	var req models.UpdateAdminRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, models.APIResponse{
			Success: false, Error: "Invalid request body",
		})
		return
	}

	// Prevent non-superadmins from changing roles
	callerRole := middleware.GetAdminRole(r.Context())
	if callerRole != "superadmin" && req.Role != "" {
		writeJSON(w, http.StatusForbidden, models.APIResponse{
			Success: false, Error: "Only superadmins can change roles",
		})
		return
	}

	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}

	role := req.Role
	if role == "" {
		role = "admin"
	}

	var admin models.AdminUser
	err = h.pool.QueryRow(r.Context(),
		`UPDATE admin_users SET name = $1, email = $2, phone = $3, role = $4, is_active = $5
		 WHERE id = $6
		 RETURNING id, name, email, phone, role, is_active, created_at, last_login`,
		req.Name, req.Email, req.Phone, role, isActive, id,
	).Scan(&admin.ID, &admin.Name, &admin.Email, &admin.Phone, &admin.Role, &admin.IsActive, &admin.CreatedAt, &admin.LastLogin)
	if err != nil {
		log.Printf("ERROR: update admin user: %v", err)
		writeJSON(w, http.StatusNotFound, models.APIResponse{
			Success: false, Error: "Admin user not found or update failed",
		})
		return
	}

	writeJSON(w, http.StatusOK, models.APIResponse{
		Success: true,
		Message: "Admin user updated",
		Data:    admin,
	})
}

// ChangePassword handles PATCH /api/admin/users/:id/password
func (h *AdminUsersHandler) ChangePassword(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, models.APIResponse{
			Success: false, Error: "Invalid user ID",
		})
		return
	}

	// Allow self-password change or superadmin
	callerID := middleware.GetAdminID(r.Context())
	callerRole := middleware.GetAdminRole(r.Context())
	if callerID != id && callerRole != "superadmin" {
		writeJSON(w, http.StatusForbidden, models.APIResponse{
			Success: false, Error: "You can only change your own password",
		})
		return
	}

	var req models.ChangePasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, models.APIResponse{
			Success: false, Error: "Invalid request body",
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

	tag, err := h.pool.Exec(r.Context(),
		`UPDATE admin_users SET password_hash = $1 WHERE id = $2`, string(hash), id,
	)
	if err != nil || tag.RowsAffected() == 0 {
		writeJSON(w, http.StatusNotFound, models.APIResponse{
			Success: false, Error: "Admin user not found",
		})
		return
	}

	writeJSON(w, http.StatusOK, models.APIResponse{
		Success: true,
		Message: "Password changed successfully",
	})
}

// Delete handles DELETE /api/admin/users/:id (superadmin only)
func (h *AdminUsersHandler) Delete(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, models.APIResponse{
			Success: false, Error: "Invalid user ID",
		})
		return
	}

	// Prevent self-deletion
	callerID := middleware.GetAdminID(r.Context())
	if callerID == id {
		writeJSON(w, http.StatusBadRequest, models.APIResponse{
			Success: false, Error: "Cannot delete your own account",
		})
		return
	}

	tag, err := h.pool.Exec(r.Context(),
		`DELETE FROM admin_users WHERE id = $1`, id,
	)
	if err != nil || tag.RowsAffected() == 0 {
		writeJSON(w, http.StatusNotFound, models.APIResponse{
			Success: false, Error: "Admin user not found",
		})
		return
	}

	writeJSON(w, http.StatusOK, models.APIResponse{
		Success: true,
		Message: "Admin user deleted",
	})
}
