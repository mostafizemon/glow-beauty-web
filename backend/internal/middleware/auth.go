package middleware

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

// contextKey is a private type for context keys in this package.
type contextKey string

const (
	// CustomerIDKey is the context key for the authenticated customer's UUID.
	CustomerIDKey contextKey = "customer_id"
	// CustomerPhoneKey is the context key for the authenticated customer's phone.
	CustomerPhoneKey contextKey = "customer_phone"
)

// CustomerClaims represents the JWT claims for a customer token.
type CustomerClaims struct {
	CustomerID string `json:"customer_id"`
	Phone      string `json:"phone"`
	IsGuest    bool   `json:"is_guest"`
	jwt.RegisteredClaims
}

// Auth returns middleware that verifies a customer JWT from cookies or Authorization header.
func Auth(jwtSecret string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			tokenStr := extractToken(r, "customer_token")
			if tokenStr == "" {
				writeUnauthorized(w, "Authentication required")
				return
			}

			claims := &CustomerClaims{}
			token, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (interface{}, error) {
				return []byte(jwtSecret), nil
			})
			if err != nil || !token.Valid {
				writeUnauthorized(w, "Invalid or expired token")
				return
			}

			customerID, err := uuid.Parse(claims.CustomerID)
			if err != nil {
				writeUnauthorized(w, "Invalid token claims")
				return
			}

			// Add customer info to context
			ctx := context.WithValue(r.Context(), CustomerIDKey, customerID)
			ctx = context.WithValue(ctx, CustomerPhoneKey, claims.Phone)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// OptionalAuth is like Auth but doesn't reject unauthenticated requests.
// If a valid token is present, it adds customer info to context.
// If not, the request continues without customer context.
func OptionalAuth(jwtSecret string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			tokenStr := extractToken(r, "customer_token")
			if tokenStr != "" {
				claims := &CustomerClaims{}
				token, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (interface{}, error) {
					return []byte(jwtSecret), nil
				})
				if err == nil && token.Valid {
					if customerID, err := uuid.Parse(claims.CustomerID); err == nil {
						ctx := context.WithValue(r.Context(), CustomerIDKey, customerID)
						ctx = context.WithValue(ctx, CustomerPhoneKey, claims.Phone)
						r = r.WithContext(ctx)
					}
				}
			}
			next.ServeHTTP(w, r)
		})
	}
}

// GetCustomerID extracts the customer UUID from request context.
// Returns uuid.Nil if not authenticated.
func GetCustomerID(ctx context.Context) uuid.UUID {
	id, ok := ctx.Value(CustomerIDKey).(uuid.UUID)
	if !ok {
		return uuid.Nil
	}
	return id
}

// GetCustomerPhone extracts the customer phone from request context.
func GetCustomerPhone(ctx context.Context) string {
	phone, _ := ctx.Value(CustomerPhoneKey).(string)
	return phone
}

// extractToken gets the JWT from cookie first, then Authorization header.
func extractToken(r *http.Request, cookieName string) string {
	// Try cookie first
	if cookie, err := r.Cookie(cookieName); err == nil && cookie.Value != "" {
		return cookie.Value
	}

	// Fallback to Authorization header
	authHeader := r.Header.Get("Authorization")
	if strings.HasPrefix(authHeader, "Bearer ") {
		return strings.TrimPrefix(authHeader, "Bearer ")
	}

	return ""
}

func writeUnauthorized(w http.ResponseWriter, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusUnauthorized)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": false,
		"error":   msg,
	})
}
