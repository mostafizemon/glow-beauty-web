package handlers

import (
	"encoding/json"
	"log"
	"net"
	"net/http"
	"net/netip"
	"strconv"
	"strings"

	"glow-beauty-goals/internal/config"
	"glow-beauty-goals/internal/middleware"
	"glow-beauty-goals/internal/models"
	"glow-beauty-goals/internal/tracking"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// OrdersHandler handles customer-facing order endpoints.
type OrdersHandler struct {
	pool     *pgxpool.Pool
	settings *config.SiteSettings
	tracker  *tracking.Tracker
}

// NewOrdersHandler creates a new OrdersHandler.
func NewOrdersHandler(pool *pgxpool.Pool, settings *config.SiteSettings, tracker *tracking.Tracker) *OrdersHandler {
	return &OrdersHandler{pool: pool, settings: settings, tracker: tracker}
}

// PlaceOrder handles POST /api/orders
func (h *OrdersHandler) PlaceOrder(w http.ResponseWriter, r *http.Request) {
	customerID := middleware.GetCustomerID(r.Context())
	if customerID == uuid.Nil {
		writeJSON(w, http.StatusUnauthorized, models.APIResponse{
			Success: false, Error: "Authentication required to place order",
		})
		return
	}

	var req models.PlaceOrderRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, models.APIResponse{
			Success: false, Error: "Invalid request body",
		})
		return
	}

	if req.CustomerName == "" || req.CustomerPhone == "" || req.DeliveryAddress == "" {
		writeJSON(w, http.StatusBadRequest, models.APIResponse{
			Success: false, Error: "Name, phone, and delivery address are required",
		})
		return
	}

	clientIP := extractClientIP(r)
	userAgent := strings.TrimSpace(r.UserAgent())
	purchaseEventID := uuid.New()
	if req.EventID != "" {
		if parsedEventID, err := uuid.Parse(req.EventID); err == nil {
			purchaseEventID = parsedEventID
		}
	}

	var orderItems []models.OrderItem
	var subtotal float64
	var cartID *uuid.UUID

	// Check if customer has an active cart (we need this for both buy_now item removal and cart checkout)
	var fetchedCartID uuid.UUID
	err := h.pool.QueryRow(r.Context(),
		`SELECT id FROM cart_sessions WHERE customer_id = $1 AND expires_at > NOW()`,
		customerID,
	).Scan(&fetchedCartID)
	if err == nil {
		cartID = &fetchedCartID
	}

	if req.CheckoutMode == "buy_now" && req.BuyNowProductID != nil {
		if req.BuyNowQuantity < 1 {
			req.BuyNowQuantity = 1
		}
		var item models.OrderItem
		var productPrice float64
		var variantName, variantValue *string
		var priceDelta *float64
		var imgURL *string

		err := h.pool.QueryRow(r.Context(),
			`SELECT p.name, p.price,
			        pv.name, pv.value, pv.price_delta,
			        pi.url
			 FROM products p
			 LEFT JOIN product_variants pv ON pv.id = $2
			 LEFT JOIN product_images pi ON pi.product_id = p.id AND pi.is_primary = true
			 WHERE p.id = $1`, req.BuyNowProductID, req.BuyNowVariantID,
		).Scan(&item.ProductName, &productPrice, &variantName, &variantValue, &priceDelta, &imgURL)
		
		if err != nil {
			writeJSON(w, http.StatusBadRequest, models.APIResponse{
				Success: false, Error: "Buy now product not found",
			})
			return
		}

		item.ProductID = req.BuyNowProductID
		item.VariantID = req.BuyNowVariantID
		item.Quantity = req.BuyNowQuantity

		pd := 0.0
		if priceDelta != nil {
			pd = *priceDelta
		}
		item.UnitPrice = productPrice + pd
		item.Subtotal = item.UnitPrice * float64(item.Quantity)

		if variantName != nil && variantValue != nil {
			item.VariantName = *variantName + ": " + *variantValue
		}
		if imgURL != nil {
			item.ImageURL = *imgURL
		}

		subtotal += item.Subtotal
		orderItems = append(orderItems, item)
	} else {
		if cartID == nil {
			writeJSON(w, http.StatusBadRequest, models.APIResponse{
				Success: false, Error: "No active cart found",
			})
			return
		}

		rows, err := h.pool.Query(r.Context(),
			`SELECT ci.product_id, ci.variant_id, ci.quantity,
			        p.name, p.price,
			        COALESCE(pv.name, ''), COALESCE(pv.value, ''), COALESCE(pv.price_delta, 0),
			        COALESCE(pi.url, '')
			 FROM cart_items ci
			 JOIN products p ON ci.product_id = p.id
			 LEFT JOIN product_variants pv ON ci.variant_id = pv.id
			 LEFT JOIN product_images pi ON pi.product_id = p.id AND pi.is_primary = true
			 WHERE ci.cart_id = $1`, *cartID,
		)
		if err != nil {
			log.Printf("ERROR: load cart items for order: %v", err)
			writeJSON(w, http.StatusInternalServerError, models.APIResponse{
				Success: false, Error: "Failed to process order",
			})
			return
		}
		defer rows.Close()

		for rows.Next() {
			var item models.OrderItem
			var productPrice float64
			var vName, vValue string
			var pDelta float64

			if err := rows.Scan(
				&item.ProductID, &item.VariantID, &item.Quantity,
				&item.ProductName, &productPrice,
				&vName, &vValue, &pDelta,
				&item.ImageURL,
			); err != nil {
				continue
			}

			item.UnitPrice = productPrice + pDelta
			item.Subtotal = item.UnitPrice * float64(item.Quantity)
			if vName != "" {
				item.VariantName = vName + ": " + vValue
			}

			subtotal += item.Subtotal
			orderItems = append(orderItems, item)
		}

		if len(orderItems) == 0 {
			writeJSON(w, http.StatusBadRequest, models.APIResponse{
				Success: false, Error: "Cart is empty",
			})
			return
		}
	}

	// Calculate delivery charge from settings (never trust frontend)
	deliveryCharge := 0.0
	deliveryEnabled := h.settings.Get("delivery_enabled")
	if deliveryEnabled == "true" {
		charge, _ := strconv.ParseFloat(h.settings.Get("delivery_charge"), 64)
		freeAbove, _ := strconv.ParseFloat(h.settings.Get("delivery_free_above"), 64)

		if freeAbove > 0 && subtotal >= freeAbove {
			deliveryCharge = 0
		} else {
			deliveryCharge = charge
		}
	}

	total := subtotal + deliveryCharge

	// Create order in transaction
	tx, err := h.pool.Begin(r.Context())
	if err != nil {
		log.Printf("ERROR: begin order tx: %v", err)
		writeJSON(w, http.StatusInternalServerError, models.APIResponse{
			Success: false, Error: "Failed to create order",
		})
		return
	}
	defer tx.Rollback(r.Context())

	var order models.Order
	err = tx.QueryRow(r.Context(),
		`INSERT INTO orders (customer_id, customer_name, customer_phone, customer_email,
		                     delivery_address, delivery_area, client_ip, user_agent,
		                     delivery_charge, subtotal, discount_amount, total, status, event_id)
		 VALUES ($1, $2, $3, $4, $5, $6, NULLIF($7, ''), NULLIF($8, ''),
		         $9, $10, 0, $11, 'pending', $12)
		 RETURNING id, order_number, customer_id, customer_name, customer_phone, customer_email,
		           delivery_address, delivery_area, client_ip, user_agent, delivery_charge,
		           subtotal, discount_amount, total, status, event_id, created_at, updated_at`,
		customerID, req.CustomerName, req.CustomerPhone, req.CustomerEmail,
		req.DeliveryAddress, req.DeliveryArea, clientIP, userAgent, deliveryCharge,
		subtotal, total, purchaseEventID,
	).Scan(
		&order.ID, &order.OrderNumber, &order.CustomerID,
		&order.CustomerName, &order.CustomerPhone, &order.CustomerEmail,
		&order.DeliveryAddress, &order.DeliveryArea, &order.ClientIP, &order.UserAgent, &order.DeliveryCharge,
		&order.Subtotal, &order.DiscountAmount, &order.Total,
		&order.Status, &order.EventID, &order.CreatedAt, &order.UpdatedAt,
	)
	if err != nil {
		log.Printf("ERROR: insert order: %v", err)
		writeJSON(w, http.StatusInternalServerError, models.APIResponse{
			Success: false, Error: "Failed to create order",
		})
		return
	}

	// Insert order items
	for _, item := range orderItems {
		_, err := tx.Exec(r.Context(),
			`INSERT INTO order_items (order_id, product_id, variant_id, product_name, variant_name, unit_price, quantity, subtotal, image_url)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
			order.ID, item.ProductID, item.VariantID, item.ProductName,
			item.VariantName, item.UnitPrice, item.Quantity, item.Subtotal, item.ImageURL,
		)
		if err != nil {
			log.Printf("ERROR: insert order item: %v", err)
			writeJSON(w, http.StatusInternalServerError, models.APIResponse{
				Success: false, Error: "Failed to create order items",
			})
			return
		}
	}

	// Clear cart after order
	if req.CheckoutMode == "buy_now" && req.BuyNowProductID != nil {
		if cartID != nil {
			if req.BuyNowVariantID != nil {
				_, _ = tx.Exec(r.Context(), `DELETE FROM cart_items WHERE cart_id = $1 AND product_id = $2 AND variant_id = $3`, *cartID, req.BuyNowProductID, req.BuyNowVariantID)
			} else {
				_, _ = tx.Exec(r.Context(), `DELETE FROM cart_items WHERE cart_id = $1 AND product_id = $2 AND variant_id IS NULL`, *cartID, req.BuyNowProductID)
			}
		}
	} else {
		if cartID != nil {
			_, _ = tx.Exec(r.Context(), `DELETE FROM cart_items WHERE cart_id = $1`, *cartID)
		}
	}

	if err := tx.Commit(r.Context()); err != nil {
		log.Printf("ERROR: commit order tx: %v", err)
		writeJSON(w, http.StatusInternalServerError, models.APIResponse{
			Success: false, Error: "Failed to finalize order",
		})
		return
	}

	order.Items = orderItems

	// Fire Purchase immediately after a successful order placement.
	go h.tracker.FirePurchase(r.Context(), &order)

	writeJSON(w, http.StatusCreated, models.APIResponse{
		Success: true,
		Message: "Order placed successfully — Purchase pixel fired",
		Data:    order,
	})
}

func extractClientIP(r *http.Request) string {
	if forwarded := strings.TrimSpace(r.Header.Get("X-Forwarded-For")); forwarded != "" {
		parts := strings.Split(forwarded, ",")
		if len(parts) > 0 {
			candidate := strings.TrimSpace(parts[0])
			if _, err := netip.ParseAddr(candidate); err == nil {
				return candidate
			}
		}
	}

	if realIP := strings.TrimSpace(r.Header.Get("X-Real-IP")); realIP != "" {
		if _, err := netip.ParseAddr(realIP); err == nil {
			return realIP
		}
	}

	host := r.RemoteAddr
	if strings.Contains(host, ":") {
		if parsedHost, _, err := net.SplitHostPort(host); err == nil {
			host = parsedHost
		}
	}
	host = strings.TrimSpace(host)
	if _, err := netip.ParseAddr(host); err == nil {
		return host
	}

	return ""
}

// MyOrders handles GET /api/orders/my
func (h *OrdersHandler) MyOrders(w http.ResponseWriter, r *http.Request) {
	customerID := middleware.GetCustomerID(r.Context())
	if customerID == uuid.Nil {
		writeJSON(w, http.StatusUnauthorized, models.APIResponse{
			Success: false, Error: "Authentication required",
		})
		return
	}

	rows, err := h.pool.Query(r.Context(),
		`SELECT id, order_number, customer_name, customer_phone,
		        delivery_address, delivery_charge, subtotal, discount_amount, total,
		        status, created_at
		 FROM orders WHERE customer_id = $1
		 ORDER BY created_at DESC`, customerID,
	)
	if err != nil {
		log.Printf("ERROR: list customer orders: %v", err)
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
			&o.ID, &o.OrderNumber, &o.CustomerName, &o.CustomerPhone,
			&o.DeliveryAddress, &o.DeliveryCharge, &o.Subtotal, &o.DiscountAmount, &o.Total,
			&o.Status, &o.CreatedAt,
		); err != nil {
			log.Printf("ERROR: scan order: %v", err)
			continue
		}
		orders = append(orders, o)
	}
	if orders == nil {
		orders = []models.Order{}
	}

	writeJSON(w, http.StatusOK, models.APIResponse{
		Success: true,
		Data:    orders,
	})
}

// GetOrder handles GET /api/orders/:id
func (h *OrdersHandler) GetOrder(w http.ResponseWriter, r *http.Request) {
	customerID := middleware.GetCustomerID(r.Context())
	if customerID == uuid.Nil {
		writeJSON(w, http.StatusUnauthorized, models.APIResponse{
			Success: false, Error: "Authentication required",
		})
		return
	}

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
		        created_at, updated_at
		 FROM orders WHERE id = $1 AND customer_id = $2`, orderID, customerID,
	).Scan(
		&order.ID, &order.OrderNumber, &order.CustomerID,
		&order.CustomerName, &order.CustomerPhone, &order.CustomerEmail,
		&order.DeliveryAddress, &order.DeliveryArea, &order.DeliveryCharge,
		&order.Subtotal, &order.DiscountAmount, &order.Total, &order.Status,
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
