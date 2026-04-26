package config

import (
	"context"
	"fmt"
	"log"
	"os"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
)

// Config holds all environment-based configuration.
type Config struct {
	DatabaseURL    string
	JWTSecret      string
	AdminJWTSecret string
	CloudinaryURL  string
	Port           string
	FrontendURL    string
}

// SiteSettings provides a cached in-memory key-value store
// loaded from the site_settings table with a 5-minute TTL.
type SiteSettings struct {
	mu        sync.RWMutex
	cache     map[string]string
	loadedAt  time.Time
	ttl       time.Duration
	pool      *pgxpool.Pool
}

var (
	cfg      *Config
	settings *SiteSettings
)

// Load reads environment variables from .env and returns the Config.
func Load() *Config {
	// Load .env file if it exists (ignore error if missing)
	_ = godotenv.Load()

	cfg = &Config{
		DatabaseURL:    getEnv("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/shopdb?sslmode=disable"),
		JWTSecret:      getEnv("JWT_SECRET", "default-jwt-secret"),
		AdminJWTSecret: getEnv("ADMIN_JWT_SECRET", "default-admin-jwt-secret"),
		CloudinaryURL:  getEnv("CLOUDINARY_URL", ""),
		Port:           getEnv("PORT", "8080"),
		FrontendURL:    getEnv("FRONTEND_URL", "http://localhost:3000"),
	}

	return cfg
}

// GetConfig returns the loaded configuration.
func GetConfig() *Config {
	if cfg == nil {
		return Load()
	}
	return cfg
}

// NewSiteSettings creates a new SiteSettings cache tied to the DB pool.
func NewSiteSettings(pool *pgxpool.Pool) *SiteSettings {
	settings = &SiteSettings{
		cache: make(map[string]string),
		ttl:   5 * time.Minute,
		pool:  pool,
	}
	return settings
}

// GetSettings returns the global SiteSettings instance.
func GetSettings() *SiteSettings {
	return settings
}

// Get retrieves a setting value by key. Returns empty string if not found.
func (s *SiteSettings) Get(key string) string {
	s.mu.RLock()
	if time.Since(s.loadedAt) < s.ttl && len(s.cache) > 0 {
		val := s.cache[key]
		s.mu.RUnlock()
		return val
	}
	s.mu.RUnlock()

	// Cache expired or empty — reload
	if err := s.Reload(); err != nil {
		log.Printf("ERROR: failed to reload site settings: %v", err)
		// Return stale cache value if available
		s.mu.RLock()
		val := s.cache[key]
		s.mu.RUnlock()
		return val
	}

	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.cache[key]
}

// GetAll returns a copy of all cached settings.
func (s *SiteSettings) GetAll() map[string]string {
	s.mu.RLock()
	if time.Since(s.loadedAt) < s.ttl && len(s.cache) > 0 {
		cp := make(map[string]string, len(s.cache))
		for k, v := range s.cache {
			cp[k] = v
		}
		s.mu.RUnlock()
		return cp
	}
	s.mu.RUnlock()

	if err := s.Reload(); err != nil {
		log.Printf("ERROR: failed to reload site settings: %v", err)
	}

	s.mu.RLock()
	defer s.mu.RUnlock()
	cp := make(map[string]string, len(s.cache))
	for k, v := range s.cache {
		cp[k] = v
	}
	return cp
}

// GetPublic returns only the public-facing settings (no tokens/secrets).
func (s *SiteSettings) GetPublic() map[string]string {
	all := s.GetAll()
	publicKeys := []string{
		"site_name", "site_logo", "delivery_enabled",
		"delivery_charge", "delivery_free_above",
		"currency", "whatsapp_number", "primary_color",
		"contact_phone", "contact_email",
		"meta_pixel_id", "tiktok_pixel_id",
		"meta_test_code", "tiktok_test_code",
	}
	result := make(map[string]string, len(publicKeys))
	for _, k := range publicKeys {
		if v, ok := all[k]; ok {
			result[k] = v
		}
	}
	return result
}

// Reload forces a fresh load from the database.
func (s *SiteSettings) Reload() error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	rows, err := s.pool.Query(ctx, "SELECT key, value FROM site_settings")
	if err != nil {
		return fmt.Errorf("query site_settings: %w", err)
	}
	defer rows.Close()

	newCache := make(map[string]string)
	for rows.Next() {
		var key, value string
		if err := rows.Scan(&key, &value); err != nil {
			return fmt.Errorf("scan site_settings row: %w", err)
		}
		newCache[key] = value
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("iterate site_settings: %w", err)
	}

	s.mu.Lock()
	s.cache = newCache
	s.loadedAt = time.Now()
	s.mu.Unlock()

	log.Printf("Site settings reloaded (%d keys)", len(newCache))
	return nil
}

// Invalidate forces the cache to expire so the next Get() reloads from DB.
func (s *SiteSettings) Invalidate() {
	s.mu.Lock()
	s.loadedAt = time.Time{} // zero time = always expired
	s.mu.Unlock()
}

func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}
