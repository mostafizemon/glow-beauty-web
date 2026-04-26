package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"time"

	"glow-beauty-goals/internal/middleware"
	"glow-beauty-goals/internal/models"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// CartHandler handles cart endpoints.
type CartHandler struct {
	pool *pgxpool.Pool
}

// NewCartHandler creates a new CartHandler.
func NewCartHandler(pool *pgxpool.Pool) *CartHandler {
	return &CartHandler{pool: pool}
}

// GetCart handles GET /api/cart
func (h *CartHandler) GetCart(w http.ResponseWriter, r *http.Request) {
	cart, err := h.getOrCreateCart(w, r)
	if err != nil {
		log.Printf("ERROR: get/create cart: %v", err)
		writeJSON(w, http.StatusInternalServerError, models.APIResponse{
			Success: false, Error: "Failed to load cart",
		})
		return
	}

	items, err := h.getCartItems(r, cart.ID)
	if err != nil {
		log.Printf("ERROR: get cart items: %v", err)
		writeJSON(w, http.StatusInternalServerError, models.APIResponse{
			Success: false, Error: "Failed to load cart items",
		})
		return
	}

	subtotal := 0.0
	for _, item := range items {
		price := item.Product.Price
		if item.Variant != nil {
			price += item.Variant.PriceDelta
		}
		subtotal += price * float64(item.Quantity)
	}

	writeJSON(w, http.StatusOK, models.APIResponse{
		Success: true,
		Data: models.CartResponse{
			Items:     items,
			ItemCount: len(items),
			Subtotal:  subtotal,
		},
	})
}

// AddItem handles POST /api/cart/items
func (h *CartHandler) AddItem(w http.ResponseWriter, r *http.Request) {
	var req models.AddToCartRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, models.APIResponse{
			Success: false, Error: "Invalid request body",
		})
		return
	}

	if req.Quantity < 1 {
		req.Quantity = 1
	}

	// Verify product exists and is active
	var exists bool
	err := h.pool.QueryRow(r.Context(),
		`SELECT EXISTS(SELECT 1 FROM products WHERE id = $1 AND is_active = true)`, req.ProductID,
	).Scan(&exists)
	if err != nil || !exists {
		writeJSON(w, http.StatusNotFound, models.APIResponse{
			Success: false, Error: "Product not found or inactive",
		})
		return
	}

	cart, err := h.getOrCreateCart(w, r)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, models.APIResponse{
			Success: false, Error: "Failed to access cart",
		})
		return
	}

	// Upsert cart item (increment quantity if already exists)
	_, err = h.pool.Exec(r.Context(),
		`INSERT INTO cart_items (cart_id, product_id, variant_id, quantity)
		 VALUES ($1, $2, $3, $4)
		 ON CONFLICT (cart_id, product_id, variant_id)
		 DO UPDATE SET quantity = cart_items.quantity + $4`,
		cart.ID, req.ProductID, req.VariantID, req.Quantity,
	)
	if err != nil {
		log.Printf("ERROR: add cart item: %v", err)
		writeJSON(w, http.StatusInternalServerError, models.APIResponse{
			Success: false, Error: "Failed to add item to cart",
		})
		return
	}

	writeJSON(w, http.StatusOK, models.APIResponse{
		Success: true,
		Message: "Item added to cart",
	})
}

// UpdateItem handles PATCH /api/cart/items/:id
func (h *CartHandler) UpdateItem(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	itemID, err := uuid.Parse(idStr)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, models.APIResponse{
			Success: false, Error: "Invalid item ID",
		})
		return
	}

	var req models.UpdateCartItemRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, models.APIResponse{
			Success: false, Error: "Invalid request body",
		})
		return
	}

	if req.Quantity < 1 {
		writeJSON(w, http.StatusBadRequest, models.APIResponse{
			Success: false, Error: "Quantity must be at least 1",
		})
		return
	}

	cart, err := h.getOrCreateCart(w, r)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, models.APIResponse{
			Success: false, Error: "Failed to access cart",
		})
		return
	}

	tag, err := h.pool.Exec(r.Context(),
		`UPDATE cart_items SET quantity = $1 WHERE id = $2 AND cart_id = $3`,
		req.Quantity, itemID, cart.ID,
	)
	if err != nil || tag.RowsAffected() == 0 {
		writeJSON(w, http.StatusNotFound, models.APIResponse{
			Success: false, Error: "Cart item not found",
		})
		return
	}

	writeJSON(w, http.StatusOK, models.APIResponse{
		Success: true,
		Message: "Cart item updated",
	})
}

// RemoveItem handles DELETE /api/cart/items/:id
func (h *CartHandler) RemoveItem(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	itemID, err := uuid.Parse(idStr)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, models.APIResponse{
			Success: false, Error: "Invalid item ID",
		})
		return
	}

	cart, err := h.getOrCreateCart(w, r)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, models.APIResponse{
			Success: false, Error: "Failed to access cart",
		})
		return
	}

	tag, err := h.pool.Exec(r.Context(),
		`DELETE FROM cart_items WHERE id = $1 AND cart_id = $2`, itemID, cart.ID,
	)
	if err != nil || tag.RowsAffected() == 0 {
		writeJSON(w, http.StatusNotFound, models.APIResponse{
			Success: false, Error: "Cart item not found",
		})
		return
	}

	writeJSON(w, http.StatusOK, models.APIResponse{
		Success: true,
		Message: "Item removed from cart",
	})
}

// Merge handles POST /api/cart/merge — merges guest cart into authenticated user's cart.
func (h *CartHandler) Merge(w http.ResponseWriter, r *http.Request) {
	customerID := middleware.GetCustomerID(r.Context())
	if customerID == uuid.Nil {
		writeJSON(w, http.StatusUnauthorized, models.APIResponse{
			Success: false, Error: "Authentication required for cart merge",
		})
		return
	}

	// Get guest cart from session cookie
	sessionToken := h.getSessionToken(r)
	if sessionToken == "" {
		writeJSON(w, http.StatusOK, models.APIResponse{
			Success: true, Message: "No guest cart to merge",
		})
		return
	}

	var guestCartID uuid.UUID
	err := h.pool.QueryRow(r.Context(),
		`SELECT id FROM cart_sessions WHERE session_token = $1 AND customer_id IS NULL AND expires_at > NOW()`,
		sessionToken,
	).Scan(&guestCartID)
	if err != nil {
		writeJSON(w, http.StatusOK, models.APIResponse{
			Success: true, Message: "No guest cart to merge",
		})
		return
	}

	// Get or create authenticated user's cart
	var userCartID uuid.UUID
	err = h.pool.QueryRow(r.Context(),
		`SELECT id FROM cart_sessions WHERE customer_id = $1 AND expires_at > NOW()`,
		customerID,
	).Scan(&userCartID)
	if err == pgx.ErrNoRows {
		newToken := uuid.New().String()
		err = h.pool.QueryRow(r.Context(),
			`INSERT INTO cart_sessions (session_token, customer_id) VALUES ($1, $2) RETURNING id`,
			newToken, customerID,
		).Scan(&userCartID)
		if err != nil {
			log.Printf("ERROR: create user cart for merge: %v", err)
			writeJSON(w, http.StatusInternalServerError, models.APIResponse{
				Success: false, Error: "Failed to merge cart",
			})
			return
		}
	}

	// Move items from guest cart to user cart (upsert to handle duplicates)
	rows, err := h.pool.Query(r.Context(),
		`SELECT product_id, variant_id, quantity FROM cart_items WHERE cart_id = $1`, guestCartID,
	)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var productID uuid.UUID
			var variantID *uuid.UUID
			var quantity int
			if err := rows.Scan(&productID, &variantID, &quantity); err != nil {
				continue
			}
			_, _ = h.pool.Exec(r.Context(),
				`INSERT INTO cart_items (cart_id, product_id, variant_id, quantity)
				 VALUES ($1, $2, $3, $4)
				 ON CONFLICT (cart_id, product_id, variant_id)
				 DO UPDATE SET quantity = cart_items.quantity + $4`,
				userCartID, productID, variantID, quantity,
			)
		}
	}

	// Delete guest cart
	_, _ = h.pool.Exec(r.Context(), `DELETE FROM cart_sessions WHERE id = $1`, guestCartID)

	// Update session cookie to point to user cart
	// The session_token for the user cart will be picked up on next request

	writeJSON(w, http.StatusOK, models.APIResponse{
		Success: true,
		Message: "Cart merged successfully",
	})
}

// getOrCreateCart returns the current cart session, creating one if needed.
func (h *CartHandler) getOrCreateCart(w http.ResponseWriter, r *http.Request) (*models.CartSession, error) {
	customerID := middleware.GetCustomerID(r.Context())

	// If authenticated, look for customer cart first
	if customerID != uuid.Nil {
		var cart models.CartSession
		err := h.pool.QueryRow(r.Context(),
			`SELECT id, session_token, customer_id, expires_at, created_at
			 FROM cart_sessions WHERE customer_id = $1 AND expires_at > NOW()`, customerID,
		).Scan(&cart.ID, &cart.SessionToken, &cart.CustomerID, &cart.ExpiresAt, &cart.CreatedAt)
		if err == nil {
			SetCartCookie(w, r, cart.SessionToken)
			return &cart, nil
		}
	}

	// Try session cookie
	sessionToken := h.getSessionToken(r)
	if sessionToken != "" {
		var cart models.CartSession
		err := h.pool.QueryRow(r.Context(),
			`SELECT id, session_token, customer_id, expires_at, created_at
			 FROM cart_sessions WHERE session_token = $1 AND expires_at > NOW()`, sessionToken,
		).Scan(&cart.ID, &cart.SessionToken, &cart.CustomerID, &cart.ExpiresAt, &cart.CreatedAt)
		if err == nil {
			// If we're now authenticated but cart isn't linked, link it
			if customerID != uuid.Nil && cart.CustomerID == nil {
				_, _ = h.pool.Exec(r.Context(),
					`UPDATE cart_sessions SET customer_id = $1 WHERE id = $2`, customerID, cart.ID,
				)
				cart.CustomerID = &customerID
			}
			SetCartCookie(w, r, cart.SessionToken)
			return &cart, nil
		}
	}

	// Create new cart
	newToken := uuid.New().String()
	var cidPtr *uuid.UUID
	if customerID != uuid.Nil {
		cidPtr = &customerID
	}

	var cart models.CartSession
	err := h.pool.QueryRow(r.Context(),
		`INSERT INTO cart_sessions (session_token, customer_id)
		 VALUES ($1, $2)
		 RETURNING id, session_token, customer_id, expires_at, created_at`,
		newToken, cidPtr,
	).Scan(&cart.ID, &cart.SessionToken, &cart.CustomerID, &cart.ExpiresAt, &cart.CreatedAt)
	if err != nil {
		return nil, err
	}

	// Set session cookie
	SetCartCookie(w, r, cart.SessionToken)
	return &cart, nil
}

// getCartItems loads cart items with product and variant details.
func (h *CartHandler) getCartItems(r *http.Request, cartID uuid.UUID) ([]models.CartItem, error) {
	rows, err := h.pool.Query(r.Context(),
		`SELECT ci.id, ci.cart_id, ci.product_id, ci.variant_id, ci.quantity,
		        p.name, p.price, p.slug,
		        COALESCE(pi.url, '') as image_url
		 FROM cart_items ci
		 JOIN products p ON ci.product_id = p.id
		 LEFT JOIN product_images pi ON pi.product_id = p.id AND pi.is_primary = true
		 WHERE ci.cart_id = $1
		 ORDER BY ci.id`, cartID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []models.CartItem
	for rows.Next() {
		var item models.CartItem
		var productName string
		var productPrice float64
		var productSlug string
		var imageURL string

		if err := rows.Scan(
			&item.ID, &item.CartID, &item.ProductID, &item.VariantID, &item.Quantity,
			&productName, &productPrice, &productSlug, &imageURL,
		); err != nil {
			log.Printf("ERROR: scan cart item: %v", err)
			continue
		}

		item.Product = &models.Product{
			ID:    item.ProductID,
			Name:  productName,
			Price: productPrice,
			Slug:  productSlug,
			Images: []models.ProductImage{
				{URL: imageURL},
			},
		}

		// Load variant if present
		if item.VariantID != nil {
			var v models.ProductVariant
			err := h.pool.QueryRow(r.Context(),
				`SELECT id, product_id, name, value, price_delta, stock, sort_order
				 FROM product_variants WHERE id = $1`, *item.VariantID,
			).Scan(&v.ID, &v.ProductID, &v.Name, &v.Value, &v.PriceDelta, &v.Stock, &v.SortOrder)
			if err == nil {
				item.Variant = &v
			}
		}

		items = append(items, item)
	}

	if items == nil {
		items = []models.CartItem{}
	}
	return items, nil
}

func (h *CartHandler) getSessionToken(r *http.Request) string {
	cookie, err := r.Cookie("cart_session")
	if err != nil {
		return ""
	}
	return cookie.Value
}

// SetCartCookie sets the cart session cookie on the response.
// Should be called after getOrCreateCart if a new cart was created.
func SetCartCookie(w http.ResponseWriter, r *http.Request, token string) {
	http.SetCookie(w, &http.Cookie{
		Name:     "cart_session",
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		Secure:   r.TLS != nil,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   30 * 24 * 60 * 60, // 30 days
		Expires:  time.Now().Add(30 * 24 * time.Hour),
	})
}
