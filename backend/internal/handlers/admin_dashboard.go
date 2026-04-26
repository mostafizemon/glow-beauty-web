package handlers

import (
	"log"
	"net/http"

	"glow-beauty-goals/internal/models"

	"github.com/jackc/pgx/v5/pgxpool"
)

// AdminDashboardHandler handles admin dashboard stats.
type AdminDashboardHandler struct {
	pool *pgxpool.Pool
}

// NewAdminDashboardHandler creates a new AdminDashboardHandler.
func NewAdminDashboardHandler(pool *pgxpool.Pool) *AdminDashboardHandler {
	return &AdminDashboardHandler{pool: pool}
}

// Stats handles GET /api/admin/dashboard/stats
func (h *AdminDashboardHandler) Stats(w http.ResponseWriter, r *http.Request) {
	var stats models.DashboardStats

	// Total orders
	_ = h.pool.QueryRow(r.Context(),
		`SELECT COUNT(*) FROM orders`,
	).Scan(&stats.TotalOrders)

	// Pending orders
	_ = h.pool.QueryRow(r.Context(),
		`SELECT COUNT(*) FROM orders WHERE status = 'pending'`,
	).Scan(&stats.PendingOrders)

	// Total revenue (from confirmed/delivered/shipped orders)
	err := h.pool.QueryRow(r.Context(),
		`SELECT COALESCE(SUM(total), 0) FROM orders WHERE status IN ('confirmed', 'processing', 'shipped', 'delivered')`,
	).Scan(&stats.TotalRevenue)
	if err != nil {
		log.Printf("ERROR: total revenue query: %v", err)
	}

	// Total products
	_ = h.pool.QueryRow(r.Context(),
		`SELECT COUNT(*) FROM products`,
	).Scan(&stats.TotalProducts)

	// Total customers
	_ = h.pool.QueryRow(r.Context(),
		`SELECT COUNT(*) FROM customers`,
	).Scan(&stats.TotalCustomers)

	// Today's orders
	_ = h.pool.QueryRow(r.Context(),
		`SELECT COUNT(*) FROM orders WHERE DATE(created_at) = CURRENT_DATE`,
	).Scan(&stats.TodayOrders)

	// Today's revenue
	_ = h.pool.QueryRow(r.Context(),
		`SELECT COALESCE(SUM(total), 0) FROM orders
		 WHERE DATE(created_at) = CURRENT_DATE
		   AND status IN ('confirmed', 'processing', 'shipped', 'delivered')`,
	).Scan(&stats.TodayRevenue)

	writeJSON(w, http.StatusOK, models.APIResponse{
		Success: true,
		Data:    stats,
	})
}
