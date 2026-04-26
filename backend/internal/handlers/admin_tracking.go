package handlers

import (
	"net/http"
	"strconv"

	"glow-beauty-goals/internal/models"

	"github.com/jackc/pgx/v5/pgxpool"
)

// AdminTrackingHandler exposes tracking diagnostics for admins.
type AdminTrackingHandler struct {
	pool *pgxpool.Pool
}

// NewAdminTrackingHandler creates a new AdminTrackingHandler.
func NewAdminTrackingHandler(pool *pgxpool.Pool) *AdminTrackingHandler {
	return &AdminTrackingHandler{pool: pool}
}

// ListLogs handles GET /api/admin/tracking/logs
func (h *AdminTrackingHandler) ListLogs(w http.ResponseWriter, r *http.Request) {
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit < 1 || limit > 200 {
		limit = 50
	}

	platform := r.URL.Query().Get("platform")
	status := r.URL.Query().Get("status")

	query := `SELECT id, event_id, event_name, platform, order_id, payload::text, status, error_msg, fired_at
			  FROM tracking_logs
			  WHERE ($1 = '' OR platform = $1)
			    AND ($2 = '' OR status = $2)
			  ORDER BY fired_at DESC
			  LIMIT $3`

	rows, err := h.pool.Query(r.Context(), query, platform, status, limit)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, models.APIResponse{
			Success: false,
			Error:   "Failed to load tracking logs",
		})
		return
	}
	defer rows.Close()

	logs := make([]models.TrackingLog, 0, limit)
	for rows.Next() {
		var item models.TrackingLog
		if err := rows.Scan(
			&item.ID,
			&item.EventID,
			&item.EventName,
			&item.Platform,
			&item.OrderID,
			&item.Payload,
			&item.Status,
			&item.ErrorMsg,
			&item.FiredAt,
		); err != nil {
			continue
		}
		logs = append(logs, item)
	}

	writeJSON(w, http.StatusOK, models.APIResponse{
		Success: true,
		Data:    logs,
	})
}

