package handlers

import (
	"encoding/json"
	"log"
	"net/http"

	"glow-beauty-goals/internal/config"
	"glow-beauty-goals/internal/middleware"
	"glow-beauty-goals/internal/models"

	"github.com/jackc/pgx/v5/pgxpool"
)

// AdminSettingsHandler handles site settings endpoints.
type AdminSettingsHandler struct {
	pool     *pgxpool.Pool
	settings *config.SiteSettings
}

// NewAdminSettingsHandler creates a new AdminSettingsHandler.
func NewAdminSettingsHandler(pool *pgxpool.Pool, settings *config.SiteSettings) *AdminSettingsHandler {
	return &AdminSettingsHandler{pool: pool, settings: settings}
}

// GetAll handles GET /api/admin/settings — returns all settings (admin only).
func (h *AdminSettingsHandler) GetAll(w http.ResponseWriter, r *http.Request) {
	all := h.settings.GetAll()
	writeJSON(w, http.StatusOK, models.APIResponse{
		Success: true,
		Data:    all,
	})
}

// GetPublic handles GET /api/settings/public — returns public settings (no auth).
func (h *AdminSettingsHandler) GetPublic(w http.ResponseWriter, r *http.Request) {
	pub := h.settings.GetPublic()
	writeJSON(w, http.StatusOK, models.APIResponse{
		Success: true,
		Data:    pub,
	})
}

// BulkUpdate handles PUT /api/admin/settings — bulk update settings.
// Expects JSON body: { "key1": "value1", "key2": "value2", ... }
func (h *AdminSettingsHandler) BulkUpdate(w http.ResponseWriter, r *http.Request) {
	var updates map[string]string
	if err := json.NewDecoder(r.Body).Decode(&updates); err != nil {
		writeJSON(w, http.StatusBadRequest, models.APIResponse{
			Success: false, Error: "Invalid request body — expected { key: value, ... }",
		})
		return
	}

	if len(updates) == 0 {
		writeJSON(w, http.StatusBadRequest, models.APIResponse{
			Success: false, Error: "No settings to update",
		})
		return
	}

	adminID := middleware.GetAdminID(r.Context())

	tx, err := h.pool.Begin(r.Context())
	if err != nil {
		log.Printf("ERROR: begin settings tx: %v", err)
		writeJSON(w, http.StatusInternalServerError, models.APIResponse{
			Success: false, Error: "Failed to update settings",
		})
		return
	}
	defer tx.Rollback(r.Context())

	for key, value := range updates {
		_, err := tx.Exec(r.Context(),
			`INSERT INTO site_settings (key, value, updated_by)
			 VALUES ($1, $2, $3)
			 ON CONFLICT (key) DO UPDATE SET value = $2, updated_by = $3, updated_at = NOW()`,
			key, value, adminID,
		)
		if err != nil {
			log.Printf("ERROR: update setting %s: %v", key, err)
			writeJSON(w, http.StatusInternalServerError, models.APIResponse{
				Success: false, Error: "Failed to update setting: " + key,
			})
			return
		}
	}

	if err := tx.Commit(r.Context()); err != nil {
		log.Printf("ERROR: commit settings tx: %v", err)
		writeJSON(w, http.StatusInternalServerError, models.APIResponse{
			Success: false, Error: "Failed to save settings",
		})
		return
	}

	// Immediately invalidate cache so next read gets fresh data
	h.settings.Invalidate()

	writeJSON(w, http.StatusOK, models.APIResponse{
		Success: true,
		Message: "Settings updated successfully",
	})
}
