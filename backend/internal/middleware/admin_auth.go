package middleware

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

const (
	// AdminIDKey is the context key for the authenticated admin's UUID.
	AdminIDKey contextKey = "admin_id"
	// AdminRoleKey is the context key for the authenticated admin's role.
	AdminRoleKey contextKey = "admin_role"
	// AdminEmailKey is the context key for the authenticated admin's email.
	AdminEmailKey contextKey = "admin_email"
)

// AdminClaims represents the JWT claims for an admin token.
type AdminClaims struct {
	AdminID string `json:"admin_id"`
	Email   string `json:"email"`
	Role    string `json:"role"`
	jwt.RegisteredClaims
}

// AdminAuth returns middleware that verifies an admin JWT.
// Uses a separate secret from customer JWT.
func AdminAuth(adminJWTSecret string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			tokenStr := extractToken(r, "admin_token")
			if tokenStr == "" {
				writeAdminUnauthorized(w, "Admin authentication required")
				return
			}

			claims := &AdminClaims{}
			token, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (interface{}, error) {
				return []byte(adminJWTSecret), nil
			})
			if err != nil || !token.Valid {
				writeAdminUnauthorized(w, "Invalid or expired admin token")
				return
			}

			adminID, err := uuid.Parse(claims.AdminID)
			if err != nil {
				writeAdminUnauthorized(w, "Invalid admin token claims")
				return
			}

			// Add admin info to context
			ctx := context.WithValue(r.Context(), AdminIDKey, adminID)
			ctx = context.WithValue(ctx, AdminRoleKey, claims.Role)
			ctx = context.WithValue(ctx, AdminEmailKey, claims.Email)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// SuperAdminOnly returns middleware that requires the admin to have "superadmin" role.
// Must be used AFTER AdminAuth middleware.
func SuperAdminOnly() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			role := GetAdminRole(r.Context())
			if role != "superadmin" {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusForbidden)
				json.NewEncoder(w).Encode(map[string]interface{}{
					"success": false,
					"error":   "Superadmin access required",
				})
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// GetAdminID extracts the admin UUID from request context.
func GetAdminID(ctx context.Context) uuid.UUID {
	id, ok := ctx.Value(AdminIDKey).(uuid.UUID)
	if !ok {
		return uuid.Nil
	}
	return id
}

// GetAdminRole extracts the admin role from request context.
func GetAdminRole(ctx context.Context) string {
	role, _ := ctx.Value(AdminRoleKey).(string)
	return role
}

// GetAdminEmail extracts the admin email from request context.
func GetAdminEmail(ctx context.Context) string {
	email, _ := ctx.Value(AdminEmailKey).(string)
	return email
}

func writeAdminUnauthorized(w http.ResponseWriter, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusUnauthorized)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": false,
		"error":   msg,
	})
}
