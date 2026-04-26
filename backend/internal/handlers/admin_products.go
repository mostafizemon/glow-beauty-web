package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net/http"
	"strconv"

	"glow-beauty-goals/internal/models"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// AdminProductsHandler handles admin product CRUD endpoints.
type AdminProductsHandler struct {
	pool *pgxpool.Pool
}

// NewAdminProductsHandler creates a new AdminProductsHandler.
func NewAdminProductsHandler(pool *pgxpool.Pool) *AdminProductsHandler {
	return &AdminProductsHandler{pool: pool}
}

// List handles GET /api/admin/products
func (h *AdminProductsHandler) List(w http.ResponseWriter, r *http.Request) {
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	search := r.URL.Query().Get("search")

	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 100 {
		limit = 20
	}
	offset := (page - 1) * limit

	// Build query (admin sees all products, including inactive)
	baseWhere := "WHERE 1=1"
	args := []interface{}{}
	argIdx := 1

	if search != "" {
		baseWhere += fmt.Sprintf(" AND (p.name ILIKE $%d OR p.sku ILIKE $%d)", argIdx, argIdx)
		args = append(args, "%"+search+"%")
		argIdx++
	}

	// Count
	var total int
	countQuery := fmt.Sprintf(`SELECT COUNT(*) FROM products p %s`, baseWhere)
	_ = h.pool.QueryRow(r.Context(), countQuery, args...).Scan(&total)

	// Fetch
	dataQuery := fmt.Sprintf(`
		SELECT p.id, p.category_id, p.name, p.slug, p.description,
		       p.price, p.compare_price, p.stock, p.sku,
		       p.is_active, p.is_featured, p.sort_order,
		       p.created_at, p.updated_at
		FROM products p %s
		ORDER BY p.created_at DESC
		LIMIT $%d OFFSET $%d`, baseWhere, argIdx, argIdx+1)

	args = append(args, limit, offset)
	rows, err := h.pool.Query(r.Context(), dataQuery, args...)
	if err != nil {
		log.Printf("ERROR: admin list products: %v", err)
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

	// Load primary images
	if len(products) > 0 {
		productIDs := make([]interface{}, len(products))
		placeholders := ""
		for i, p := range products {
			productIDs[i] = p.ID
			if i > 0 {
				placeholders += ","
			}
			placeholders += fmt.Sprintf("$%d", i+1)
		}
		imgQuery := fmt.Sprintf(`
			SELECT id, product_id, cloudinary_id, url, is_primary, sort_order
			FROM product_images WHERE product_id IN (%s) AND is_primary = true`, placeholders)
		imgRows, err := h.pool.Query(r.Context(), imgQuery, productIDs...)
		if err == nil {
			defer imgRows.Close()
			imgMap := make(map[string]models.ProductImage)
			for imgRows.Next() {
				var img models.ProductImage
				if err := imgRows.Scan(&img.ID, &img.ProductID, &img.CloudinaryID, &img.URL, &img.IsPrimary, &img.SortOrder); err == nil {
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
	}

	totalPages := int(math.Ceil(float64(total) / float64(limit)))
	writeJSON(w, http.StatusOK, models.PaginatedResponse{
		Data:       products,
		Page:       page,
		Limit:      limit,
		Total:      total,
		TotalPages: totalPages,
	})
}

// Get handles GET /api/admin/products/:id
func (h *AdminProductsHandler) Get(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, models.APIResponse{
			Success: false, Error: "Invalid product ID",
		})
		return
	}

	var p models.Product
	err = h.pool.QueryRow(r.Context(),
		`SELECT id, category_id, name, slug, description,
		        price, compare_price, stock, sku,
		        is_active, is_featured, sort_order,
		        created_at, updated_at
		 FROM products WHERE id = $1`, id,
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

	writeJSON(w, http.StatusOK, models.APIResponse{
		Success: true,
		Data:    p,
	})
}

// Create handles POST /api/admin/products
func (h *AdminProductsHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req models.CreateProductRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, models.APIResponse{
			Success: false, Error: "Invalid request body",
		})
		return
	}

	if req.Name == "" || req.Slug == "" {
		writeJSON(w, http.StatusBadRequest, models.APIResponse{
			Success: false, Error: "Name and slug are required",
		})
		return
	}

	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}
	isFeatured := false
	if req.IsFeatured != nil {
		isFeatured = *req.IsFeatured
	}

	var p models.Product
	err := h.pool.QueryRow(r.Context(),
		`INSERT INTO products (category_id, name, slug, description, price, compare_price, stock, sku, is_active, is_featured, sort_order)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
		 RETURNING id, category_id, name, slug, description, price, compare_price, stock, sku, is_active, is_featured, sort_order, created_at, updated_at`,
		req.CategoryID, req.Name, req.Slug, req.Description, req.Price,
		req.ComparePrice, req.Stock, req.SKU, isActive, isFeatured, req.SortOrder,
	).Scan(
		&p.ID, &p.CategoryID, &p.Name, &p.Slug, &p.Description,
		&p.Price, &p.ComparePrice, &p.Stock, &p.SKU,
		&p.IsActive, &p.IsFeatured, &p.SortOrder,
		&p.CreatedAt, &p.UpdatedAt,
	)
	if err != nil {
		log.Printf("ERROR: create product: %v", err)
		writeJSON(w, http.StatusConflict, models.APIResponse{
			Success: false, Error: "Slug already exists or creation failed",
		})
		return
	}

	p.Images = []models.ProductImage{}
	p.Variants = []models.ProductVariant{}

	writeJSON(w, http.StatusCreated, models.APIResponse{
		Success: true,
		Message: "Product created",
		Data:    p,
	})
}

// Update handles PUT /api/admin/products/:id
func (h *AdminProductsHandler) Update(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, models.APIResponse{
			Success: false, Error: "Invalid product ID",
		})
		return
	}

	var req models.UpdateProductRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, models.APIResponse{
			Success: false, Error: "Invalid request body",
		})
		return
	}

	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}
	isFeatured := false
	if req.IsFeatured != nil {
		isFeatured = *req.IsFeatured
	}

	var p models.Product
	err = h.pool.QueryRow(r.Context(),
		`UPDATE products SET
			category_id = $1, name = $2, slug = $3, description = $4,
			price = $5, compare_price = $6, stock = $7, sku = $8,
			is_active = $9, is_featured = $10, sort_order = $11
		 WHERE id = $12
		 RETURNING id, category_id, name, slug, description, price, compare_price, stock, sku, is_active, is_featured, sort_order, created_at, updated_at`,
		req.CategoryID, req.Name, req.Slug, req.Description,
		req.Price, req.ComparePrice, req.Stock, req.SKU,
		isActive, isFeatured, req.SortOrder, id,
	).Scan(
		&p.ID, &p.CategoryID, &p.Name, &p.Slug, &p.Description,
		&p.Price, &p.ComparePrice, &p.Stock, &p.SKU,
		&p.IsActive, &p.IsFeatured, &p.SortOrder,
		&p.CreatedAt, &p.UpdatedAt,
	)
	if err != nil {
		log.Printf("ERROR: update product: %v", err)
		writeJSON(w, http.StatusNotFound, models.APIResponse{
			Success: false, Error: "Product not found or slug conflict",
		})
		return
	}

	writeJSON(w, http.StatusOK, models.APIResponse{
		Success: true,
		Message: "Product updated",
		Data:    p,
	})
}

// Delete handles DELETE /api/admin/products/:id
func (h *AdminProductsHandler) Delete(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, models.APIResponse{
			Success: false, Error: "Invalid product ID",
		})
		return
	}

	tag, err := h.pool.Exec(r.Context(),
		`DELETE FROM products WHERE id = $1`, id,
	)
	if err != nil || tag.RowsAffected() == 0 {
		writeJSON(w, http.StatusNotFound, models.APIResponse{
			Success: false, Error: "Product not found",
		})
		return
	}

	writeJSON(w, http.StatusOK, models.APIResponse{
		Success: true,
		Message: "Product deleted",
	})
}

// AddImage handles POST /api/admin/products/:id/images
func (h *AdminProductsHandler) AddImage(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	productID, err := uuid.Parse(idStr)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, models.APIResponse{
			Success: false, Error: "Invalid product ID",
		})
		return
	}

	var req models.AddImageRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, models.APIResponse{
			Success: false, Error: "Invalid request body",
		})
		return
	}

	if req.CloudinaryID == "" || req.URL == "" {
		writeJSON(w, http.StatusBadRequest, models.APIResponse{
			Success: false, Error: "cloudinary_id and url are required",
		})
		return
	}

	// If this is marked as primary, unset other primaries first
	if req.IsPrimary {
		_, _ = h.pool.Exec(r.Context(),
			`UPDATE product_images SET is_primary = false WHERE product_id = $1`, productID,
		)
	}

	var img models.ProductImage
	err = h.pool.QueryRow(r.Context(),
		`INSERT INTO product_images (product_id, cloudinary_id, url, is_primary, sort_order)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING id, product_id, cloudinary_id, url, is_primary, sort_order`,
		productID, req.CloudinaryID, req.URL, req.IsPrimary, req.SortOrder,
	).Scan(&img.ID, &img.ProductID, &img.CloudinaryID, &img.URL, &img.IsPrimary, &img.SortOrder)
	if err != nil {
		log.Printf("ERROR: add product image: %v", err)
		writeJSON(w, http.StatusInternalServerError, models.APIResponse{
			Success: false, Error: "Failed to add image",
		})
		return
	}

	writeJSON(w, http.StatusCreated, models.APIResponse{
		Success: true,
		Message: "Image added",
		Data:    img,
	})
}

// DeleteImage handles DELETE /api/admin/products/:id/images/:image_id
func (h *AdminProductsHandler) DeleteImage(w http.ResponseWriter, r *http.Request) {
	imageIDStr := r.PathValue("image_id")
	imageID, err := uuid.Parse(imageIDStr)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, models.APIResponse{
			Success: false, Error: "Invalid image ID",
		})
		return
	}

	// Get cloudinary_id before deleting (for Cloudinary cleanup)
	var cloudinaryID string
	err = h.pool.QueryRow(r.Context(),
		`SELECT cloudinary_id FROM product_images WHERE id = $1`, imageID,
	).Scan(&cloudinaryID)
	if err != nil {
		writeJSON(w, http.StatusNotFound, models.APIResponse{
			Success: false, Error: "Image not found",
		})
		return
	}

	tag, err := h.pool.Exec(r.Context(),
		`DELETE FROM product_images WHERE id = $1`, imageID,
	)
	if err != nil || tag.RowsAffected() == 0 {
		writeJSON(w, http.StatusNotFound, models.APIResponse{
			Success: false, Error: "Image not found",
		})
		return
	}

	// TODO: Delete from Cloudinary using cloudinary.Delete(cloudinaryID)

	writeJSON(w, http.StatusOK, models.APIResponse{
		Success: true,
		Message: "Image deleted",
		Data:    map[string]string{"cloudinary_id": cloudinaryID},
	})
}
