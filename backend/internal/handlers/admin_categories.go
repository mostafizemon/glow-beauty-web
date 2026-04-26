package handlers

import (
	"encoding/json"
	"log"
	"net/http"

	"glow-beauty-goals/internal/models"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// AdminCategoriesHandler handles category management endpoints.
type AdminCategoriesHandler struct {
	pool *pgxpool.Pool
}

// NewAdminCategoriesHandler creates a new AdminCategoriesHandler.
func NewAdminCategoriesHandler(pool *pgxpool.Pool) *AdminCategoriesHandler {
	return &AdminCategoriesHandler{pool: pool}
}

// List handles GET /api/categories (public) and GET /api/admin/categories.
func (h *AdminCategoriesHandler) List(w http.ResponseWriter, r *http.Request) {
	// Public requests only see active categories
	activeOnly := r.URL.Query().Get("active_only") == "true"

	query := `SELECT id, name, slug, image_url, is_active, sort_order, created_at
	          FROM categories`
	if activeOnly {
		query += ` WHERE is_active = true`
	}
	query += ` ORDER BY sort_order ASC, name ASC`

	rows, err := h.pool.Query(r.Context(), query)
	if err != nil {
		log.Printf("ERROR: list categories: %v", err)
		writeJSON(w, http.StatusInternalServerError, models.APIResponse{
			Success: false, Error: "Failed to fetch categories",
		})
		return
	}
	defer rows.Close()

	var categories []models.Category
	for rows.Next() {
		var c models.Category
		if err := rows.Scan(&c.ID, &c.Name, &c.Slug, &c.ImageURL, &c.IsActive, &c.SortOrder, &c.CreatedAt); err != nil {
			log.Printf("ERROR: scan category: %v", err)
			continue
		}
		categories = append(categories, c)
	}

	if categories == nil {
		categories = []models.Category{}
	}

	writeJSON(w, http.StatusOK, models.APIResponse{
		Success: true,
		Data:    categories,
	})
}

// PublicList handles GET /api/categories — returns only active categories.
func (h *AdminCategoriesHandler) PublicList(w http.ResponseWriter, r *http.Request) {
	rows, err := h.pool.Query(r.Context(),
		`SELECT id, name, slug, image_url, is_active, sort_order, created_at
		 FROM categories WHERE is_active = true ORDER BY sort_order ASC, name ASC`,
	)
	if err != nil {
		log.Printf("ERROR: list public categories: %v", err)
		writeJSON(w, http.StatusInternalServerError, models.APIResponse{
			Success: false, Error: "Failed to fetch categories",
		})
		return
	}
	defer rows.Close()

	var categories []models.Category
	for rows.Next() {
		var c models.Category
		if err := rows.Scan(&c.ID, &c.Name, &c.Slug, &c.ImageURL, &c.IsActive, &c.SortOrder, &c.CreatedAt); err != nil {
			log.Printf("ERROR: scan category: %v", err)
			continue
		}
		categories = append(categories, c)
	}

	if categories == nil {
		categories = []models.Category{}
	}

	writeJSON(w, http.StatusOK, models.APIResponse{
		Success: true,
		Data:    categories,
	})
}

// Create handles POST /api/admin/categories
func (h *AdminCategoriesHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req models.CreateCategoryRequest
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

	var cat models.Category
	err := h.pool.QueryRow(r.Context(),
		`INSERT INTO categories (name, slug, image_url, is_active, sort_order)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING id, name, slug, image_url, is_active, sort_order, created_at`,
		req.Name, req.Slug, req.ImageURL, isActive, req.SortOrder,
	).Scan(&cat.ID, &cat.Name, &cat.Slug, &cat.ImageURL, &cat.IsActive, &cat.SortOrder, &cat.CreatedAt)
	if err != nil {
		log.Printf("ERROR: create category: %v", err)
		writeJSON(w, http.StatusConflict, models.APIResponse{
			Success: false, Error: "Slug already exists or creation failed",
		})
		return
	}

	writeJSON(w, http.StatusCreated, models.APIResponse{
		Success: true,
		Message: "Category created",
		Data:    cat,
	})
}

// Update handles PUT /api/admin/categories/:id
func (h *AdminCategoriesHandler) Update(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, models.APIResponse{
			Success: false, Error: "Invalid category ID",
		})
		return
	}

	var req models.UpdateCategoryRequest
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

	var cat models.Category
	err = h.pool.QueryRow(r.Context(),
		`UPDATE categories SET name = $1, slug = $2, image_url = $3, is_active = $4, sort_order = $5
		 WHERE id = $6
		 RETURNING id, name, slug, image_url, is_active, sort_order, created_at`,
		req.Name, req.Slug, req.ImageURL, isActive, req.SortOrder, id,
	).Scan(&cat.ID, &cat.Name, &cat.Slug, &cat.ImageURL, &cat.IsActive, &cat.SortOrder, &cat.CreatedAt)
	if err != nil {
		log.Printf("ERROR: update category: %v", err)
		writeJSON(w, http.StatusNotFound, models.APIResponse{
			Success: false, Error: "Category not found or slug conflict",
		})
		return
	}

	writeJSON(w, http.StatusOK, models.APIResponse{
		Success: true,
		Message: "Category updated",
		Data:    cat,
	})
}

// Delete handles DELETE /api/admin/categories/:id
func (h *AdminCategoriesHandler) Delete(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, models.APIResponse{
			Success: false, Error: "Invalid category ID",
		})
		return
	}

	// Products with this category will have category_id set to NULL (ON DELETE SET NULL)
	tag, err := h.pool.Exec(r.Context(),
		`DELETE FROM categories WHERE id = $1`, id,
	)
	if err != nil || tag.RowsAffected() == 0 {
		writeJSON(w, http.StatusNotFound, models.APIResponse{
			Success: false, Error: "Category not found",
		})
		return
	}

	writeJSON(w, http.StatusOK, models.APIResponse{
		Success: true,
		Message: "Category deleted",
	})
}
