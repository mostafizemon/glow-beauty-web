package models

import (
	"time"

	"github.com/google/uuid"
)

// ============================================================
// Admin Users
// ============================================================

type AdminUser struct {
	ID           uuid.UUID  `json:"id"`
	Name         string     `json:"name"`
	Email        string     `json:"email"`
	Phone        string     `json:"phone"`
	PasswordHash string     `json:"-"`    // never expose in JSON
	Role         string     `json:"role"` // "superadmin" | "admin"
	IsActive     bool       `json:"is_active"`
	CreatedAt    time.Time  `json:"created_at"`
	LastLogin    *time.Time `json:"last_login,omitempty"`
}

type AdminLoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type CreateAdminRequest struct {
	Name     string `json:"name"`
	Email    string `json:"email"`
	Phone    string `json:"phone"`
	Password string `json:"password"`
	Role     string `json:"role"`
}

type UpdateAdminRequest struct {
	Name     string `json:"name"`
	Email    string `json:"email"`
	Phone    string `json:"phone"`
	Role     string `json:"role"`
	IsActive *bool  `json:"is_active,omitempty"`
}

type ChangePasswordRequest struct {
	Password string `json:"password"`
}

// ============================================================
// Customers
// ============================================================

type Customer struct {
	ID           uuid.UUID `json:"id"`
	Phone        string    `json:"phone"`
	Name         string    `json:"name"`
	Email        *string   `json:"email,omitempty"`
	PasswordHash string    `json:"-"`
	IsRegistered bool      `json:"is_registered"`
	CreatedAt    time.Time `json:"created_at"`
}

type RegisterRequest struct {
	Phone    string `json:"phone"`
	Name     string `json:"name"`
	Password string `json:"password"`
}

type LoginRequest struct {
	Phone    string `json:"phone"`
	Password string `json:"password"`
}

type GuestRequest struct {
	Phone string `json:"phone"`
	Name  string `json:"name"`
}

// ============================================================
// Categories
// ============================================================

type Category struct {
	ID        uuid.UUID `json:"id"`
	Name      string    `json:"name"`
	Slug      string    `json:"slug"`
	ImageURL  string    `json:"image_url,omitempty"`
	IsActive  bool      `json:"is_active"`
	SortOrder int       `json:"sort_order"`
	CreatedAt time.Time `json:"created_at"`
}

type CreateCategoryRequest struct {
	Name      string `json:"name"`
	Slug      string `json:"slug"`
	ImageURL  string `json:"image_url"`
	IsActive  *bool  `json:"is_active,omitempty"`
	SortOrder int    `json:"sort_order"`
}

type UpdateCategoryRequest struct {
	Name      string `json:"name"`
	Slug      string `json:"slug"`
	ImageURL  string `json:"image_url"`
	IsActive  *bool  `json:"is_active,omitempty"`
	SortOrder int    `json:"sort_order"`
}

// ============================================================
// Products
// ============================================================

type Product struct {
	ID           uuid.UUID  `json:"id"`
	CategoryID   *uuid.UUID `json:"category_id,omitempty"`
	Name         string     `json:"name"`
	Slug         string     `json:"slug"`
	Description  string     `json:"description"`
	Price        float64    `json:"price"`
	ComparePrice *float64   `json:"compare_price,omitempty"`
	Stock        int        `json:"stock"`
	SKU          string     `json:"sku,omitempty"`
	IsActive     bool       `json:"is_active"`
	IsFeatured   bool       `json:"is_featured"`
	SortOrder    int        `json:"sort_order"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`

	// Joined data (not stored in products table)
	Images   []ProductImage   `json:"images,omitempty"`
	Variants []ProductVariant `json:"variants,omitempty"`
	Category *Category        `json:"category,omitempty"`
}

type CreateProductRequest struct {
	CategoryID   *uuid.UUID `json:"category_id,omitempty"`
	Name         string     `json:"name"`
	Slug         string     `json:"slug"`
	Description  string     `json:"description"`
	Price        float64    `json:"price"`
	ComparePrice *float64   `json:"compare_price,omitempty"`
	Stock        int        `json:"stock"`
	SKU          string     `json:"sku"`
	IsActive     *bool      `json:"is_active,omitempty"`
	IsFeatured   *bool      `json:"is_featured,omitempty"`
	SortOrder    int        `json:"sort_order"`
}

type UpdateProductRequest struct {
	CategoryID   *uuid.UUID `json:"category_id,omitempty"`
	Name         string     `json:"name"`
	Slug         string     `json:"slug"`
	Description  string     `json:"description"`
	Price        float64    `json:"price"`
	ComparePrice *float64   `json:"compare_price,omitempty"`
	Stock        int        `json:"stock"`
	SKU          string     `json:"sku"`
	IsActive     *bool      `json:"is_active,omitempty"`
	IsFeatured   *bool      `json:"is_featured,omitempty"`
	SortOrder    int        `json:"sort_order"`
}

// ============================================================
// Product Images
// ============================================================

type ProductImage struct {
	ID           uuid.UUID `json:"id"`
	ProductID    uuid.UUID `json:"product_id"`
	CloudinaryID string    `json:"cloudinary_id"`
	URL          string    `json:"url"`
	IsPrimary    bool      `json:"is_primary"`
	SortOrder    int       `json:"sort_order"`
}

type AddImageRequest struct {
	CloudinaryID string `json:"cloudinary_id"`
	URL          string `json:"url"`
	IsPrimary    bool   `json:"is_primary"`
	SortOrder    int    `json:"sort_order"`
}

// ============================================================
// Product Variants
// ============================================================

type ProductVariant struct {
	ID         uuid.UUID `json:"id"`
	ProductID  uuid.UUID `json:"product_id"`
	Name       string    `json:"name"`  // e.g. "Shade"
	Value      string    `json:"value"` // e.g. "Nude Pink"
	PriceDelta float64   `json:"price_delta"`
	Stock      int       `json:"stock"`
	SortOrder  int       `json:"sort_order"`
}

// ============================================================
// Cart
// ============================================================

type CartSession struct {
	ID           uuid.UUID  `json:"id"`
	SessionToken string     `json:"session_token"`
	CustomerID   *uuid.UUID `json:"customer_id,omitempty"`
	ExpiresAt    time.Time  `json:"expires_at"`
	CreatedAt    time.Time  `json:"created_at"`
}

type CartItem struct {
	ID        uuid.UUID  `json:"id"`
	CartID    uuid.UUID  `json:"cart_id"`
	ProductID uuid.UUID  `json:"product_id"`
	VariantID *uuid.UUID `json:"variant_id,omitempty"`
	Quantity  int        `json:"quantity"`

	// Joined data for display
	Product *Product        `json:"product,omitempty"`
	Variant *ProductVariant `json:"variant,omitempty"`
}

type AddToCartRequest struct {
	ProductID uuid.UUID  `json:"product_id"`
	VariantID *uuid.UUID `json:"variant_id,omitempty"`
	Quantity  int        `json:"quantity"`
}

type UpdateCartItemRequest struct {
	Quantity int `json:"quantity"`
}

type CartResponse struct {
	Items     []CartItem `json:"items"`
	ItemCount int        `json:"item_count"`
	Subtotal  float64    `json:"subtotal"`
}

// ============================================================
// Orders
// ============================================================

type Order struct {
	ID              uuid.UUID  `json:"id"`
	OrderNumber     string     `json:"order_number"`
	CustomerID      *uuid.UUID `json:"customer_id,omitempty"`
	CustomerName    string     `json:"customer_name"`
	CustomerPhone   string     `json:"customer_phone"`
	CustomerEmail   *string    `json:"customer_email,omitempty"`
	DeliveryAddress string     `json:"delivery_address"`
	DeliveryArea    *string    `json:"delivery_area,omitempty"`
	ClientIP        *string    `json:"client_ip,omitempty"`
	UserAgent       *string    `json:"user_agent,omitempty"`
	DeliveryCharge  float64    `json:"delivery_charge"`
	Subtotal        float64    `json:"subtotal"`
	DiscountAmount  float64    `json:"discount_amount"`
	Total           float64    `json:"total"`
	Status          string     `json:"status"`
	PixelStatus     *string    `json:"pixel_status,omitempty"`
	PixelFiredAt    *time.Time `json:"pixel_fired_at,omitempty"`
	EventID         *uuid.UUID `json:"event_id,omitempty"`
	AdminNote       *string    `json:"admin_note,omitempty"`
	ConfirmedBy     *uuid.UUID `json:"confirmed_by,omitempty"`
	ConfirmedAt     *time.Time `json:"confirmed_at,omitempty"`
	CancelledBy     *uuid.UUID `json:"cancelled_by,omitempty"`
	CancelledAt     *time.Time `json:"cancelled_at,omitempty"`
	CancelReason    *string    `json:"cancel_reason,omitempty"`
	CreatedAt       time.Time  `json:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at"`

	// Joined data
	Items []OrderItem `json:"items,omitempty"`
}

type OrderItem struct {
	ID          uuid.UUID  `json:"id"`
	OrderID     uuid.UUID  `json:"order_id"`
	ProductID   *uuid.UUID `json:"product_id,omitempty"`
	VariantID   *uuid.UUID `json:"variant_id,omitempty"`
	ProductName string     `json:"product_name"`
	VariantName string     `json:"variant_name,omitempty"`
	UnitPrice   float64    `json:"unit_price"`
	Quantity    int        `json:"quantity"`
	Subtotal    float64    `json:"subtotal"`
	ImageURL    string     `json:"image_url,omitempty"`
}

type PlaceOrderRequest struct {
	CustomerName    string     `json:"customer_name"`
	CustomerPhone   string     `json:"customer_phone"`
	CustomerEmail   string     `json:"customer_email"` // kept for backwards compatibility but optional
	DeliveryAddress string     `json:"delivery_address"`
	DeliveryArea    string     `json:"delivery_area"`
	EventID         string     `json:"event_id,omitempty"`
	FBP             string     `json:"fbp,omitempty"`
	FBC             string     `json:"fbc,omitempty"`
	CheckoutMode    string     `json:"checkout_mode,omitempty"`
	BuyNowProductID *uuid.UUID `json:"buy_now_product_id,omitempty"`
	BuyNowVariantID *uuid.UUID `json:"buy_now_variant_id,omitempty"`
	BuyNowQuantity  int        `json:"buy_now_quantity,omitempty"`
}

type UpdateOrderStatusRequest struct {
	Status string `json:"status"`
}

type AddOrderNoteRequest struct {
	Note string `json:"note"`
}

type CancelOrderRequest struct {
	Reason string `json:"reason"`
}

// ============================================================
// Tracking
// ============================================================

type TrackingLog struct {
	ID        uuid.UUID  `json:"id"`
	EventID   *uuid.UUID `json:"event_id,omitempty"`
	EventName string     `json:"event_name"`
	Platform  string     `json:"platform"` // "tiktok" | "meta"
	OrderID   *uuid.UUID `json:"order_id,omitempty"`
	Payload   string     `json:"payload"` // JSONB stored as string
	Status    string     `json:"status"`  // "success" | "error"
	ErrorMsg  string     `json:"error_msg,omitempty"`
	FiredAt   time.Time  `json:"fired_at"`
}

type TrackEventRequest struct {
	EventName string                 `json:"event_name"`
	EventID   string                 `json:"event_id"`
	PageURL   string                 `json:"page_url"`
	Referrer  string                 `json:"referrer,omitempty"`
	ClientIP  string                 `json:"client_ip,omitempty"`
	UserAgent string                 `json:"user_agent,omitempty"`
	UserData  map[string]interface{} `json:"user_data"`
	Contents  []TrackContent         `json:"contents"`
	Value     float64                `json:"value"`
	Currency  string                 `json:"currency"`
}

type TrackContent struct {
	ContentID   string  `json:"content_id"`
	ContentName string  `json:"content_name"`
	ContentType string  `json:"content_type"`
	Price       float64 `json:"price"`
	Quantity    int     `json:"quantity"`
}

// ============================================================
// Dashboard
// ============================================================

type DashboardStats struct {
	TotalOrders    int     `json:"total_orders"`
	PendingOrders  int     `json:"pending_orders"`
	TotalRevenue   float64 `json:"total_revenue"`
	TotalProducts  int     `json:"total_products"`
	TotalCustomers int     `json:"total_customers"`
	TodayOrders    int     `json:"today_orders"`
	TodayRevenue   float64 `json:"today_revenue"`
}

// ============================================================
// Pagination
// ============================================================

type PaginatedResponse struct {
	Data       interface{} `json:"data"`
	Page       int         `json:"page"`
	Limit      int         `json:"limit"`
	Total      int         `json:"total"`
	TotalPages int         `json:"total_pages"`
}

// ============================================================
// Common API response
// ============================================================

type APIResponse struct {
	Success bool        `json:"success"`
	Message string      `json:"message,omitempty"`
	Data    interface{} `json:"data,omitempty"`
	Error   string      `json:"error,omitempty"`
}
