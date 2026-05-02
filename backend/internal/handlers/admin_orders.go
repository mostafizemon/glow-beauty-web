package handlers

import (
	"encoding/json"
	"log"
	"math"
	"net/http"
	"strconv"
	"time"

	"glow-beauty-goals/internal/middleware"
	"glow-beauty-goals/internal/models"
	"glow-beauty-goals/internal/tracking"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// AdminOrdersHandler handles admin order management endpoints.
type AdminOrdersHandler struct {
	pool    *pgxpool.Pool
	tracker *tracking.Tracker
}

// NewAdminOrdersHandler creates a new AdminOrdersHandler.
func NewAdminOrdersHandler(pool *pgxpool.Pool, tracker *tracking.Tracker) *AdminOrdersHandler {
	return &AdminOrdersHandler{pool: pool, tracker: tracker}
}

// List handles GET /api/admin/orders
func (h *AdminOrdersHandler) List(w http.ResponseWriter, r *http.Request) {
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	status := r.URL.Query().Get("status")

	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 100 {
		limit = 20
	}
	offset := (page - 1) * limit

	args := []interface{}{}
	where := "WHERE 1=1"
	argIdx := 1

	if status != "" {
		where += " AND status = $" + strconv.Itoa(argIdx)
		args = append(args, status)
		argIdx++
	}

	// Count
	var total int
	countQ := "SELECT COUNT(*) FROM orders " + where
	_ = h.pool.QueryRow(r.Context(), countQ, args...).Scan(&total)

	// Fetch
	query := `SELECT id, order_number, customer_id, customer_name, customer_phone, customer_email,
	                 delivery_address, delivery_area, delivery_charge,
	                 subtotal, discount_amount, total, status,
	                 pixel_status, admin_note,
	                 confirmed_at, cancelled_at, cancel_reason,
	                 created_at, updated_at
	          FROM orders ` + where + `
	          ORDER BY CASE WHEN status = 'pending' THEN 0 ELSE 1 END, created_at DESC
	          LIMIT $` + strconv.Itoa(argIdx) + ` OFFSET $` + strconv.Itoa(argIdx+1)

	args = append(args, limit, offset)
	rows, err := h.pool.Query(r.Context(), query, args...)
	if err != nil {
		log.Printf("ERROR: admin list orders: %v", err)
		writeJSON(w, http.StatusInternalServerError, models.APIResponse{
			Success: false, Error: "Failed to fetch orders",
		})
		return
	}
	defer rows.Close()

	var orders []models.Order
	for rows.Next() {
		var o models.Order
		if err := rows.Scan(
			&o.ID, &o.OrderNumber, &o.CustomerID, &o.CustomerName, &o.CustomerPhone, &o.CustomerEmail,
			&o.DeliveryAddress, &o.DeliveryArea, &o.DeliveryCharge,
			&o.Subtotal, &o.DiscountAmount, &o.Total, &o.Status,
			&o.PixelStatus, &o.AdminNote,
			&o.ConfirmedAt, &o.CancelledAt, &o.CancelReason,
			&o.CreatedAt, &o.UpdatedAt,
		); err != nil {
			log.Printf("ERROR: scan order: %v", err)
			continue
		}
		orders = append(orders, o)
	}
	if orders == nil {
		orders = []models.Order{}
	}

	totalPages := int(math.Ceil(float64(total) / float64(limit)))
	writeJSON(w, http.StatusOK, models.PaginatedResponse{
		Data:       orders,
		Page:       page,
		Limit:      limit,
		Total:      total,
		TotalPages: totalPages,
	})
}

// GetOrder handles GET /api/admin/orders/:id
func (h *AdminOrdersHandler) GetOrder(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	orderID, err := uuid.Parse(idStr)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, models.APIResponse{
			Success: false, Error: "Invalid order ID",
		})
		return
	}

	var order models.Order
	err = h.pool.QueryRow(r.Context(),
		`SELECT id, order_number, customer_id, customer_name, customer_phone, customer_email,
		        delivery_address, delivery_area, delivery_charge,
		        subtotal, discount_amount, total, status,
		        pixel_status, pixel_fired_at, event_id, admin_note,
		        confirmed_by, confirmed_at, cancelled_by, cancelled_at, cancel_reason,
		        created_at, updated_at
		 FROM orders WHERE id = $1`, orderID,
	).Scan(
		&order.ID, &order.OrderNumber, &order.CustomerID,
		&order.CustomerName, &order.CustomerPhone, &order.CustomerEmail,
		&order.DeliveryAddress, &order.DeliveryArea, &order.DeliveryCharge,
		&order.Subtotal, &order.DiscountAmount, &order.Total, &order.Status,
		&order.PixelStatus, &order.PixelFiredAt, &order.EventID, &order.AdminNote,
		&order.ConfirmedBy, &order.ConfirmedAt, &order.CancelledBy, &order.CancelledAt, &order.CancelReason,
		&order.CreatedAt, &order.UpdatedAt,
	)
	if err != nil {
		writeJSON(w, http.StatusNotFound, models.APIResponse{
			Success: false, Error: "Order not found",
		})
		return
	}

	// Load order items
	itemRows, err := h.pool.Query(r.Context(),
		`SELECT id, order_id, product_id, variant_id, product_name, variant_name,
		        unit_price, quantity, subtotal, image_url
		 FROM order_items WHERE order_id = $1`, order.ID,
	)
	if err == nil {
		defer itemRows.Close()
		for itemRows.Next() {
			var item models.OrderItem
			if err := itemRows.Scan(
				&item.ID, &item.OrderID, &item.ProductID, &item.VariantID,
				&item.ProductName, &item.VariantName, &item.UnitPrice,
				&item.Quantity, &item.Subtotal, &item.ImageURL,
			); err == nil {
				order.Items = append(order.Items, item)
			}
		}
	}
	if order.Items == nil {
		order.Items = []models.OrderItem{}
	}

	writeJSON(w, http.StatusOK, models.APIResponse{
		Success: true,
		Data:    order,
	})
}

// ConfirmOrder handles PATCH /api/admin/orders/:id/confirm
// This is where the Purchase pixel fires!
func (h *AdminOrdersHandler) ConfirmOrder(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	orderID, err := uuid.Parse(idStr)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, models.APIResponse{
			Success: false, Error: "Invalid order ID",
		})
		return
	}

	adminID := middleware.GetAdminID(r.Context())

	// Check current status
	var currentStatus string
	err = h.pool.QueryRow(r.Context(),
		`SELECT status FROM orders WHERE id = $1`, orderID,
	).Scan(&currentStatus)
	if err != nil {
		writeJSON(w, http.StatusNotFound, models.APIResponse{
			Success: false, Error: "Order not found",
		})
		return
	}

	if currentStatus != "pending" {
		writeJSON(w, http.StatusBadRequest, models.APIResponse{
			Success: false, Error: "Only pending orders can be confirmed",
		})
		return
	}

	now := time.Now()
	_, err = h.pool.Exec(r.Context(),
		`UPDATE orders SET status = 'confirmed', confirmed_by = $1, confirmed_at = $2
		 WHERE id = $3`, adminID, now, orderID,
	)
	if err != nil {
		log.Printf("ERROR: confirm order: %v", err)
		writeJSON(w, http.StatusInternalServerError, models.APIResponse{
			Success: false, Error: "Failed to confirm order",
		})
		return
	}

	writeJSON(w, http.StatusOK, models.APIResponse{
		Success: true,
		Message: "Order confirmed",
		Data:    map[string]interface{}{"status": "confirmed"},
	})
}

// CancelOrder handles PATCH /api/admin/orders/:id/cancel
func (h *AdminOrdersHandler) CancelOrder(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	orderID, err := uuid.Parse(idStr)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, models.APIResponse{
			Success: false, Error: "Invalid order ID",
		})
		return
	}

	adminID := middleware.GetAdminID(r.Context())

	var req models.CancelOrderRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		req.Reason = ""
	}

	// Load order to check pixel status
	var order models.Order
	err = h.pool.QueryRow(r.Context(),
		`SELECT id, order_number, customer_id, customer_name, customer_phone, customer_email,
		        client_ip, user_agent, total, status, pixel_status
		 FROM orders WHERE id = $1`, orderID,
	).Scan(&order.ID, &order.OrderNumber, &order.CustomerID,
		&order.CustomerName, &order.CustomerPhone, &order.CustomerEmail,
		&order.ClientIP, &order.UserAgent, &order.Total, &order.Status, &order.PixelStatus,
	)
	if err != nil {
		writeJSON(w, http.StatusNotFound, models.APIResponse{
			Success: false, Error: "Order not found",
		})
		return
	}

	if order.Status == "cancelled" {
		writeJSON(w, http.StatusBadRequest, models.APIResponse{
			Success: false, Error: "Order is already cancelled",
		})
		return
	}

	if order.Status == "delivered" {
		writeJSON(w, http.StatusBadRequest, models.APIResponse{
			Success: false, Error: "Cannot cancel a delivered order",
		})
		return
	}

	now := time.Now()
	_, err = h.pool.Exec(r.Context(),
		`UPDATE orders SET status = 'cancelled', cancelled_by = $1, cancelled_at = $2, cancel_reason = $3
		 WHERE id = $4`, adminID, now, req.Reason, orderID,
	)
	if err != nil {
		log.Printf("ERROR: cancel order: %v", err)
		writeJSON(w, http.StatusInternalServerError, models.APIResponse{
			Success: false, Error: "Failed to cancel order",
		})
		return
	}

	// Fire Cancel pixel only if Purchase was previously fired
	if order.PixelStatus != nil && *order.PixelStatus == "purchase" {
		go h.tracker.FireCancel(r.Context(), &order)
	}

	writeJSON(w, http.StatusOK, models.APIResponse{
		Success: true,
		Message: "Order cancelled",
		Data:    map[string]interface{}{"order_number": order.OrderNumber, "status": "cancelled"},
	})
}

// UpdateStatus handles PATCH /api/admin/orders/:id/status
func (h *AdminOrdersHandler) UpdateStatus(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	orderID, err := uuid.Parse(idStr)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, models.APIResponse{
			Success: false, Error: "Invalid order ID",
		})
		return
	}

	var req models.UpdateOrderStatusRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, models.APIResponse{
			Success: false, Error: "Invalid request body",
		})
		return
	}

	validStatuses := map[string]bool{
		"pending": true, "confirmed": true, "processing": true,
		"shipped": true, "delivered": true, "cancelled": true,
	}
	if !validStatuses[req.Status] {
		writeJSON(w, http.StatusBadRequest, models.APIResponse{
			Success: false, Error: "Invalid status value",
		})
		return
	}

	tag, err := h.pool.Exec(r.Context(),
		`UPDATE orders SET status = $1 WHERE id = $2`, req.Status, orderID,
	)
	if err != nil || tag.RowsAffected() == 0 {
		writeJSON(w, http.StatusNotFound, models.APIResponse{
			Success: false, Error: "Order not found",
		})
		return
	}

	writeJSON(w, http.StatusOK, models.APIResponse{
		Success: true,
		Message: "Order status updated",
	})
}

// AddNote handles POST /api/admin/orders/:id/note
func (h *AdminOrdersHandler) AddNote(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	orderID, err := uuid.Parse(idStr)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, models.APIResponse{
			Success: false, Error: "Invalid order ID",
		})
		return
	}

	var req models.AddOrderNoteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, models.APIResponse{
			Success: false, Error: "Invalid request body",
		})
		return
	}

	tag, err := h.pool.Exec(r.Context(),
		`UPDATE orders SET admin_note = $1 WHERE id = $2`, req.Note, orderID,
	)
	if err != nil || tag.RowsAffected() == 0 {
		writeJSON(w, http.StatusNotFound, models.APIResponse{
			Success: false, Error: "Order not found",
		})
		return
	}

	writeJSON(w, http.StatusOK, models.APIResponse{
		Success: true,
		Message: "Admin note updated",
	})
}

// DeleteOrder handles DELETE /api/admin/orders/:id
func (h *AdminOrdersHandler) DeleteOrder(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	orderID, err := uuid.Parse(idStr)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, models.APIResponse{
			Success: false, Error: "Invalid order ID",
		})
		return
	}

	// Use a transaction to delete order items first, then the order
	tx, err := h.pool.Begin(r.Context())
	if err != nil {
		log.Printf("ERROR: begin tx for delete order: %v", err)
		writeJSON(w, http.StatusInternalServerError, models.APIResponse{
			Success: false, Error: "Failed to delete order",
		})
		return
	}
	defer tx.Rollback(r.Context())

	// Delete order items
	_, err = tx.Exec(r.Context(), `DELETE FROM order_items WHERE order_id = $1`, orderID)
	if err != nil {
		log.Printf("ERROR: delete order items: %v", err)
		writeJSON(w, http.StatusInternalServerError, models.APIResponse{
			Success: false, Error: "Failed to delete order items",
		})
		return
	}

	// Delete the order
	tag, err := tx.Exec(r.Context(), `DELETE FROM orders WHERE id = $1`, orderID)
	if err != nil {
		log.Printf("ERROR: delete order: %v", err)
		writeJSON(w, http.StatusInternalServerError, models.APIResponse{
			Success: false, Error: "Failed to delete order",
		})
		return
	}

	if tag.RowsAffected() == 0 {
		writeJSON(w, http.StatusNotFound, models.APIResponse{
			Success: false, Error: "Order not found",
		})
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		log.Printf("ERROR: commit delete order tx: %v", err)
		writeJSON(w, http.StatusInternalServerError, models.APIResponse{
			Success: false, Error: "Failed to delete order",
		})
		return
	}

	log.Printf("INFO: Order %s deleted by admin", orderID)
	writeJSON(w, http.StatusOK, models.APIResponse{
		Success: true,
		Message: "Order deleted permanently",
	})
}
