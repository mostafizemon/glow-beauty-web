package main

import (
	"context"
	"encoding/json"
	"log"
	"net"
	"net/http"
	"net/netip"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"glow-beauty-goals/internal/config"
	"glow-beauty-goals/internal/db"
	"glow-beauty-goals/internal/handlers"
	"glow-beauty-goals/internal/middleware"
	"glow-beauty-goals/internal/models"
	"glow-beauty-goals/internal/tracking"
)

func main() {
	// Load configuration
	cfg := config.Load()
	log.Printf("Starting Glow Beauty Goals API on port %s", cfg.Port)

	// Connect to database
	pool, err := db.Connect(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("FATAL: database connection failed: %v", err)
	}
	defer pool.Close()

	// Initialize site settings cache
	settings := config.NewSiteSettings(pool)
	if err := settings.Reload(); err != nil {
		log.Printf("WARN: initial settings load failed: %v", err)
	}

	// Initialize tracker
	tracker := tracking.NewTracker(pool, settings)

	// Initialize handlers
	adminAuthH := handlers.NewAdminAuthHandler(pool, cfg.AdminJWTSecret)
	adminUsersH := handlers.NewAdminUsersHandler(pool)
	authH := handlers.NewAuthHandler(pool, cfg.JWTSecret)
	adminSettingsH := handlers.NewAdminSettingsHandler(pool, settings)
	adminCategoriesH := handlers.NewAdminCategoriesHandler(pool)
	productsH := handlers.NewProductsHandler(pool)
	adminProductsH := handlers.NewAdminProductsHandler(pool)
	cartH := handlers.NewCartHandler(pool)
	ordersH := handlers.NewOrdersHandler(pool, settings)
	adminOrdersH := handlers.NewAdminOrdersHandler(pool, tracker)
	adminDashboardH := handlers.NewAdminDashboardHandler(pool)
	adminTrackingH := handlers.NewAdminTrackingHandler(pool)

	// Setup router
	mux := http.NewServeMux()

	// Middleware chains
	adminAuth := middleware.AdminAuth(cfg.AdminJWTSecret)
	superAdminOnly := middleware.SuperAdminOnly()
	customerAuth := middleware.Auth(cfg.JWTSecret)
	optionalAuth := middleware.OptionalAuth(cfg.JWTSecret)

	// ==========================================
	// Public endpoints
	// ==========================================
	mux.HandleFunc("GET /api/products", productsH.List)
	mux.HandleFunc("GET /api/products/{slug}", productsH.GetBySlug)
	mux.HandleFunc("GET /api/categories", adminCategoriesH.PublicList)
	mux.HandleFunc("GET /api/settings/public", adminSettingsH.GetPublic)

	// ==========================================
	// Cart (session-based, optional auth)
	// ==========================================
	mux.Handle("GET /api/cart", optionalAuth(http.HandlerFunc(cartH.GetCart)))
	mux.Handle("POST /api/cart/items", optionalAuth(http.HandlerFunc(cartH.AddItem)))
	mux.Handle("PATCH /api/cart/items/{id}", optionalAuth(http.HandlerFunc(cartH.UpdateItem)))
	mux.Handle("DELETE /api/cart/items/{id}", optionalAuth(http.HandlerFunc(cartH.RemoveItem)))
	mux.Handle("POST /api/cart/merge", customerAuth(http.HandlerFunc(cartH.Merge)))

	// ==========================================
	// Customer Auth
	// ==========================================
	mux.HandleFunc("POST /api/auth/register", authH.Register)
	mux.HandleFunc("POST /api/auth/login", authH.Login)
	mux.HandleFunc("POST /api/auth/guest", authH.Guest)
	mux.HandleFunc("POST /api/auth/logout", authH.Logout)
	mux.Handle("GET /api/auth/me", customerAuth(http.HandlerFunc(authH.Me)))

	// ==========================================
	// Customer Orders
	// ==========================================
	mux.Handle("POST /api/orders", customerAuth(http.HandlerFunc(ordersH.PlaceOrder)))
	mux.Handle("GET /api/orders/my", customerAuth(http.HandlerFunc(ordersH.MyOrders)))
	mux.Handle("GET /api/orders/{id}", customerAuth(http.HandlerFunc(ordersH.GetOrder)))

	// ==========================================
	// Tracking Bridge (frontend → backend)
	// ==========================================
	mux.HandleFunc("POST /api/track", func(w http.ResponseWriter, r *http.Request) {
		var req models.TrackEventRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(models.APIResponse{Success: false, Error: "Invalid request"})
			return
		}

		req.Referrer = r.Referer()
		req.UserAgent = r.UserAgent()
		req.ClientIP = extractClientIP(r)
		
		log.Printf("DEBUG: Tracking bridge received event: %s", req.EventName)
		go tracker.TrackEvent(context.Background(), req)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(models.APIResponse{Success: true, Message: "Event queued"})
	})

	// ==========================================
	// Admin Auth
	// ==========================================
	mux.HandleFunc("POST /api/admin/auth/login", adminAuthH.Login)
	mux.HandleFunc("POST /api/admin/auth/logout", adminAuthH.Logout)
	mux.Handle("GET /api/admin/auth/me", adminAuth(http.HandlerFunc(adminAuthH.Me)))

	// ==========================================
	// Admin Dashboard
	// ==========================================
	mux.Handle("GET /api/admin/dashboard/stats", adminAuth(http.HandlerFunc(adminDashboardH.Stats)))
	mux.Handle("GET /api/admin/tracking/logs", adminAuth(http.HandlerFunc(adminTrackingH.ListLogs)))

	// ==========================================
	// Admin Orders
	// ==========================================
	mux.Handle("GET /api/admin/orders", adminAuth(http.HandlerFunc(adminOrdersH.List)))
	mux.Handle("GET /api/admin/orders/{id}", adminAuth(http.HandlerFunc(adminOrdersH.GetOrder)))
	mux.Handle("PATCH /api/admin/orders/{id}/confirm", adminAuth(http.HandlerFunc(adminOrdersH.ConfirmOrder)))
	mux.Handle("PATCH /api/admin/orders/{id}/cancel", adminAuth(http.HandlerFunc(adminOrdersH.CancelOrder)))
	mux.Handle("PATCH /api/admin/orders/{id}/status", adminAuth(http.HandlerFunc(adminOrdersH.UpdateStatus)))
	mux.Handle("POST /api/admin/orders/{id}/note", adminAuth(http.HandlerFunc(adminOrdersH.AddNote)))
	mux.Handle("DELETE /api/admin/orders/{id}", adminAuth(http.HandlerFunc(adminOrdersH.DeleteOrder)))

	// ==========================================
	// Admin Products
	// ==========================================
	mux.Handle("GET /api/admin/products", adminAuth(http.HandlerFunc(adminProductsH.List)))
	mux.Handle("POST /api/admin/products", adminAuth(http.HandlerFunc(adminProductsH.Create)))
	mux.Handle("GET /api/admin/products/{id}", adminAuth(http.HandlerFunc(adminProductsH.Get)))
	mux.Handle("PUT /api/admin/products/{id}", adminAuth(http.HandlerFunc(adminProductsH.Update)))
	mux.Handle("DELETE /api/admin/products/{id}", adminAuth(http.HandlerFunc(adminProductsH.Delete)))
	mux.Handle("POST /api/admin/products/{id}/images", adminAuth(http.HandlerFunc(adminProductsH.AddImage)))
	mux.Handle("DELETE /api/admin/products/{id}/images/{image_id}", adminAuth(http.HandlerFunc(adminProductsH.DeleteImage)))

	// ==========================================
	// Admin Categories
	// ==========================================
	mux.Handle("GET /api/admin/categories", adminAuth(http.HandlerFunc(adminCategoriesH.List)))
	mux.Handle("POST /api/admin/categories", adminAuth(http.HandlerFunc(adminCategoriesH.Create)))
	mux.Handle("PUT /api/admin/categories/{id}", adminAuth(http.HandlerFunc(adminCategoriesH.Update)))
	mux.Handle("DELETE /api/admin/categories/{id}", adminAuth(http.HandlerFunc(adminCategoriesH.Delete)))

	// ==========================================
	// Admin Settings
	// ==========================================
	mux.Handle("GET /api/admin/settings", adminAuth(http.HandlerFunc(adminSettingsH.GetAll)))
	mux.Handle("PUT /api/admin/settings", adminAuth(http.HandlerFunc(adminSettingsH.BulkUpdate)))

	// ==========================================
	// Admin Users (superadmin-gated for create/delete)
	// ==========================================
	mux.Handle("GET /api/admin/users", adminAuth(http.HandlerFunc(adminUsersH.List)))
	mux.Handle("POST /api/admin/users", adminAuth(superAdminOnly(http.HandlerFunc(adminUsersH.Create))))
	mux.Handle("PUT /api/admin/users/{id}", adminAuth(http.HandlerFunc(adminUsersH.Update)))
	mux.Handle("PATCH /api/admin/users/{id}/password", adminAuth(http.HandlerFunc(adminUsersH.ChangePassword)))
	mux.Handle("DELETE /api/admin/users/{id}", adminAuth(superAdminOnly(http.HandlerFunc(adminUsersH.Delete))))

	// ==========================================
	// Health check
	// ==========================================
	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(models.APIResponse{Success: true, Message: "OK"})
	})

	// Apply CORS middleware
	cors := middleware.CORS(cfg.FrontendURL)
	handler := cors(mux)

	// Create server with timeouts
	server := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      handler,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Graceful shutdown
	go func() {
		sigChan := make(chan os.Signal, 1)
		signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
		sig := <-sigChan
		log.Printf("Received signal %v, shutting down...", sig)

		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		if err := server.Shutdown(ctx); err != nil {
			log.Printf("ERROR: server shutdown: %v", err)
		}
	}()

	log.Printf("Server listening on http://localhost:%s", cfg.Port)
	log.Printf("Health check: http://localhost:%s/api/health", cfg.Port)
	if err := server.ListenAndServe(); err != http.ErrServerClosed {
		log.Fatalf("FATAL: server error: %v", err)
	}
	log.Println("Server stopped")
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
