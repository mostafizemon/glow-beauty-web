package handlers

import (
	"fmt"
	"log"
	"math"
	"net/http"
	"strconv"

	"glow-beauty-goals/internal/models"

	"github.com/jackc/pgx/v5/pgxpool"
)

// ProductsHandler handles public product endpoints.
type ProductsHandler struct {
	pool *pgxpool.Pool
}

// NewProductsHandler creates a new ProductsHandler.
func NewProductsHandler(pool *pgxpool.Pool) *ProductsHandler {
	return &ProductsHandler{pool: pool}
}

// List handles GET /api/products?page&limit&category&search&featured
func (h *ProductsHandler) List(w http.ResponseWriter, r *http.Request) {
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	category := r.URL.Query().Get("category")
	search := r.URL.Query().Get("search")
	featured := r.URL.Query().Get("featured")

	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 100 {
		limit = 20
	}
	offset := (page - 1) * limit

	// Build dynamic query
	baseWhere := "WHERE p.is_active = true"
	args := []interface{}{}
	argIdx := 1

	if category != "" {
		baseWhere += fmt.Sprintf(" AND c.slug = $%d", argIdx)
		args = append(args, category)
		argIdx++
	}
	if search != "" {
		baseWhere += fmt.Sprintf(" AND (p.name ILIKE $%d OR p.description ILIKE $%d)", argIdx, argIdx)
		args = append(args, "%"+search+"%")
		argIdx++
	}
	if featured == "true" {
		baseWhere += " AND p.is_featured = true"
	}

	// Count total
	countQuery := fmt.Sprintf(`SELECT COUNT(*) FROM products p
		LEFT JOIN categories c ON p.category_id = c.id %s`, baseWhere)
	var total int
	err := h.pool.QueryRow(r.Context(), countQuery, args...).Scan(&total)
	if err != nil {
		log.Printf("ERROR: count products: %v", err)
		writeJSON(w, http.StatusInternalServerError, models.APIResponse{
			Success: false, Error: "Failed to fetch products",
		})
		return
	}

	// Fetch products
	dataQuery := fmt.Sprintf(`
		SELECT p.id, p.category_id, p.name, p.slug, p.description,
		       p.price, p.compare_price, p.stock, p.sku,
		       p.is_active, p.is_featured, p.sort_order,
		       p.created_at, p.updated_at
		FROM products p
		LEFT JOIN categories c ON p.category_id = c.id
		%s
		ORDER BY p.sort_order ASC, p.created_at DESC
		LIMIT $%d OFFSET $%d`,
		baseWhere, argIdx, argIdx+1)

	args = append(args, limit, offset)

	rows, err := h.pool.Query(r.Context(), dataQuery, args...)
	if err != nil {
		log.Printf("ERROR: list products: %v", err)
		writeJSON(w, http.StatusInternalServerError, models.APIResponse{
			Success: false, Error: "Failed to fetch products",
		})
		return
	}
	defer rows.Close()

	var products []models.Product
	for rows.Next() {
		var p models.Product
		if err := rows.Scan(
			&p.ID, &p.CategoryID, &p.Name, &p.Slug, &p.Description,
			&p.Price, &p.ComparePrice, &p.Stock, &p.SKU,
			&p.IsActive, &p.IsFeatured, &p.SortOrder,
			&p.CreatedAt, &p.UpdatedAt,
		); err != nil {
			log.Printf("ERROR: scan product: %v", err)
			continue
		}
		products = append(products, p)
	}

	if products == nil {
		products = []models.Product{}
	}

	// Batch load primary images for all products
	h.loadPrimaryImages(r, products)

	totalPages := int(math.Ceil(float64(total) / float64(limit)))

	writeJSON(w, http.StatusOK, models.PaginatedResponse{
		Data:       products,
		Page:       page,
		Limit:      limit,
		Total:      total,
		TotalPages: totalPages,
	})
}

// GetBySlug handles GET /api/products/:slug
func (h *ProductsHandler) GetBySlug(w http.ResponseWriter, r *http.Request) {
	slug := r.PathValue("slug")
	if slug == "" {
		writeJSON(w, http.StatusBadRequest, models.APIResponse{
			Success: false, Error: "Product slug is required",
		})
		return
	}

	var p models.Product
	err := h.pool.QueryRow(r.Context(),
		`SELECT id, category_id, name, slug, description,
		        price, compare_price, stock, sku,
		        is_active, is_featured, sort_order,
		        created_at, updated_at
		 FROM products WHERE slug = $1 AND is_active = true`, slug,
	).Scan(
		&p.ID, &p.CategoryID, &p.Name, &p.Slug, &p.Description,
		&p.Price, &p.ComparePrice, &p.Stock, &p.SKU,
		&p.IsActive, &p.IsFeatured, &p.SortOrder,
		&p.CreatedAt, &p.UpdatedAt,
	)
	if err != nil {
		writeJSON(w, http.StatusNotFound, models.APIResponse{
			Success: false, Error: "Product not found",
		})
		return
	}

	// Load images
	imgRows, err := h.pool.Query(r.Context(),
		`SELECT id, product_id, cloudinary_id, url, is_primary, sort_order
		 FROM product_images WHERE product_id = $1 ORDER BY sort_order ASC`, p.ID,
	)
	if err == nil {
		defer imgRows.Close()
		for imgRows.Next() {
			var img models.ProductImage
			if err := imgRows.Scan(&img.ID, &img.ProductID, &img.CloudinaryID, &img.URL, &img.IsPrimary, &img.SortOrder); err == nil {
				p.Images = append(p.Images, img)
			}
		}
	}
	if p.Images == nil {
		p.Images = []models.ProductImage{}
	}

	// Load variants
	varRows, err := h.pool.Query(r.Context(),
		`SELECT id, product_id, name, value, price_delta, stock, sort_order
		 FROM product_variants WHERE product_id = $1 ORDER BY sort_order ASC`, p.ID,
	)
	if err == nil {
		defer varRows.Close()
		for varRows.Next() {
			var v models.ProductVariant
			if err := varRows.Scan(&v.ID, &v.ProductID, &v.Name, &v.Value, &v.PriceDelta, &v.Stock, &v.SortOrder); err == nil {
				p.Variants = append(p.Variants, v)
			}
		}
	}
	if p.Variants == nil {
		p.Variants = []models.ProductVariant{}
	}

	// Load category
	if p.CategoryID != nil {
		var cat models.Category
		err := h.pool.QueryRow(r.Context(),
			`SELECT id, name, slug, image_url, is_active, sort_order, created_at
			 FROM categories WHERE id = $1`, *p.CategoryID,
		).Scan(&cat.ID, &cat.Name, &cat.Slug, &cat.ImageURL, &cat.IsActive, &cat.SortOrder, &cat.CreatedAt)
		if err == nil {
			p.Category = &cat
		}
	}

	writeJSON(w, http.StatusOK, models.APIResponse{
		Success: true,
		Data:    p,
	})
}

// loadPrimaryImages bulk-loads primary images for a slice of products.
func (h *ProductsHandler) loadPrimaryImages(r *http.Request, products []models.Product) {
	if len(products) == 0 {
		return
	}

	productIDs := make([]interface{}, len(products))
	placeholders := ""
	for i, p := range products {
		productIDs[i] = p.ID
		if i > 0 {
			placeholders += ","
		}
		placeholders += fmt.Sprintf("$%d", i+1)
	}

	query := fmt.Sprintf(`
		SELECT id, product_id, cloudinary_id, url, is_primary, sort_order
		FROM product_images
		WHERE product_id IN (%s) AND is_primary = true`, placeholders)

	rows, err := h.pool.Query(r.Context(), query, productIDs...)
	if err != nil {
		log.Printf("ERROR: load primary images: %v", err)
		return
	}
	defer rows.Close()

	imgMap := make(map[string]models.ProductImage)
	for rows.Next() {
		var img models.ProductImage
		if err := rows.Scan(&img.ID, &img.ProductID, &img.CloudinaryID, &img.URL, &img.IsPrimary, &img.SortOrder); err == nil {
			imgMap[img.ProductID.String()] = img
		}
	}

	for i := range products {
		if img, ok := imgMap[products[i].ID.String()]; ok {
			products[i].Images = []models.ProductImage{img}
		} else {
			products[i].Images = []models.ProductImage{}
		}
	}
}
