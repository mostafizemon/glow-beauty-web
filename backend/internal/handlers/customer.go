package handlers

import (
	"net/http"

	"glow-beauty-goals/internal/middleware"
	"glow-beauty-goals/internal/models"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// CustomerHandler handles customer profile endpoints.
type CustomerHandler struct {
	pool *pgxpool.Pool
}

// NewCustomerHandler creates a new CustomerHandler.
func NewCustomerHandler(pool *pgxpool.Pool) *CustomerHandler {
	return &CustomerHandler{pool: pool}
}

// OrderHistory handles GET /api/orders/history — alias for MyOrders
// (kept as a separate handler for potential expansion).
func (h *CustomerHandler) OrderHistory(w http.ResponseWriter, r *http.Request) {
	customerID := middleware.GetCustomerID(r.Context())
	if customerID == uuid.Nil {
		writeJSON(w, http.StatusUnauthorized, models.APIResponse{
			Success: false, Error: "Authentication required",
		})
		return
	}

	// Reuses the same query pattern as OrdersHandler.MyOrders
	ordersHandler := &OrdersHandler{pool: h.pool}
	ordersHandler.MyOrders(w, r)
}
