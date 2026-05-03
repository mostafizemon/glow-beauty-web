package tracking

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"os"
	"regexp"
	"strings"
	"sync"
	"time"

	"glow-beauty-goals/internal/config"
	"glow-beauty-goals/internal/models"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Tracker handles multi-platform pixel events (TikTok + Meta).
type Tracker struct {
	pool     *pgxpool.Pool
	settings *config.SiteSettings
	client   *http.Client
}

// NewTracker creates a new Tracker instance.
func NewTracker(pool *pgxpool.Pool, settings *config.SiteSettings) *Tracker {
	return &Tracker{
		pool:     pool,
		settings: settings,
		client:   &http.Client{Timeout: 10 * time.Second},
	}
}

// TrackEvent handles a generic tracking request (usually from a bridge).
func (t *Tracker) TrackEvent(ctx context.Context, req models.TrackEventRequest) {
	eventID := uuid.New()
	if req.EventID != "" {
		if id, err := uuid.Parse(req.EventID); err == nil {
			eventID = id
		}
	}

	if !strings.EqualFold(strings.TrimSpace(req.EventName), "PageView") {
		t.fireTikTok(ctx, req.EventName, &eventID, nil, req)
	}
	t.fireMeta(ctx, req.EventName, &eventID, nil, req)
}

// FirePurchase triggers a server-side purchase event for both platforms.
func (t *Tracker) FirePurchase(ctx context.Context, order *models.Order) {
	t.FirePurchaseWithUserData(ctx, order, nil)
}

// FirePurchaseWithUserData triggers a server-side purchase event with extra browser identifiers.
func (t *Tracker) FirePurchaseWithUserData(ctx context.Context, order *models.Order, extraUserData map[string]interface{}) {
	eventID := uuid.New()
	if order.EventID != nil {
		eventID = *order.EventID
	}

	// Format contents for pixel APIs
	var contents []models.TrackContent
	for _, item := range order.Items {
		contentID := ""
		if item.ProductID != nil {
			contentID = item.ProductID.String()
		}
		contents = append(contents, models.TrackContent{
			ContentID:   contentID,
			ContentName: item.ProductName,
			ContentType: "product",
			Quantity:    item.Quantity,
			Price:       item.UnitPrice,
		})
	}

	value := order.Total
	if _, ok := normalizeMonetaryValue(value); !ok {
		value = 0
		for _, item := range order.Items {
			value += item.Subtotal
		}
	}

	userData := map[string]interface{}{
		"phone": order.CustomerPhone,
	}
	for key, value := range extraUserData {
		if str, ok := value.(string); ok && strings.TrimSpace(str) != "" {
			userData[key] = strings.TrimSpace(str)
		}
	}

	req := models.TrackEventRequest{
		EventName: "Purchase",
		EventID:   eventID.String(),
		ClientIP:  derefString(order.ClientIP),
		UserAgent: derefString(order.UserAgent),
		Value:     value,
		Currency:  "BDT",
		Contents:  contents,
		UserData:  userData,
	}

	var wg sync.WaitGroup
	wg.Add(2)
	go func() {
		defer wg.Done()
		t.fireTikTok(ctx, "Purchase", &eventID, &order.ID, req)
	}()
	go func() {
		defer wg.Done()
		t.fireMeta(ctx, "Purchase", &eventID, &order.ID, req)
	}()
	wg.Wait()

	// Update order with pixel info — use background context to prevent cancellation
	_, err := t.pool.Exec(context.Background(),
		`UPDATE orders SET pixel_status = 'purchase', pixel_fired_at = NOW(), event_id = $1
		 WHERE id = $2`, eventID, order.ID,
	)
	if err != nil {
		log.Printf("ERROR: update order pixel_status: %v", err)
	}
}

// FireCancel triggers a server-side cancellation event.
func (t *Tracker) FireCancel(ctx context.Context, order *models.Order) {
	eventID := uuid.New()
	if order.EventID != nil {
		eventID = *order.EventID
	}

	req := models.TrackEventRequest{
		EventName: "CancelOrder",
		EventID:   eventID.String(),
		ClientIP:  derefString(order.ClientIP),
		UserAgent: derefString(order.UserAgent),
		Value:     order.Total,
		Currency:  "BDT",
		UserData: map[string]interface{}{
			"phone": order.CustomerPhone,
		},
	}

	t.fireTikTok(ctx, "CancelOrder", &eventID, &order.ID, req)
	t.fireMeta(ctx, "CancelOrder", &eventID, &order.ID, req)

	// Update order pixel status
	_, err := t.pool.Exec(context.Background(),
		`UPDATE orders SET pixel_status = 'cancelled' WHERE id = $1`, order.ID,
	)
	if err != nil {
		log.Printf("ERROR: update order pixel_status: %v", err)
	}
}

func derefString(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

// hashSHA256 returns a hex-encoded SHA256 hash of the input string.
func hashSHA256(input string) string {
	h := sha256.New()
	h.Write([]byte(input))
	return hex.EncodeToString(h.Sum(nil))
}

var nonDigitsRegex = regexp.MustCompile(`\D`)

func normalizePhone(input string) string {
	normalized := nonDigitsRegex.ReplaceAllString(strings.TrimSpace(input), "")
	if normalized == "" {
		return ""
	}
	normalized = strings.TrimPrefix(normalized, "00")
	if strings.HasPrefix(normalized, "0") && len(normalized) == 11 {
		normalized = "88" + normalized
	}
	if strings.HasPrefix(normalized, "1") && len(normalized) == 10 {
		normalized = "880" + normalized
	}
	return normalized
}

func eventUsesMonetaryValue(eventName string) bool {
	switch strings.ToLower(strings.TrimSpace(eventName)) {
	case "purchase", "addtocart", "initiatecheckout", "viewcontent":
		return true
	default:
		return false
	}
}

func normalizeMonetaryValue(value float64) (float64, bool) {
	if math.IsNaN(value) || math.IsInf(value, 0) || value <= 0 {
		return 0, false
	}
	return math.Round(value*100) / 100, true
}

func normalizeCurrency(currency string) string {
	currency = strings.ToUpper(strings.TrimSpace(currency))
	if currency == "" {
		return "BDT"
	}
	return currency
}

func buildMetaContents(contents []models.TrackContent) []map[string]interface{} {
	metaContents := make([]map[string]interface{}, 0, len(contents))
	for _, item := range contents {
		contentID := strings.TrimSpace(item.ContentID)
		if contentID == "" {
			continue
		}

		quantity := item.Quantity
		if quantity < 1 {
			quantity = 1
		}

		metaItem := map[string]interface{}{
			"id":       contentID,
			"quantity": quantity,
		}
		if price, ok := normalizeMonetaryValue(item.Price); ok {
			metaItem["item_price"] = price
		}
		metaContents = append(metaContents, metaItem)
	}
	return metaContents
}

func contentIDs(contents []models.TrackContent) []string {
	ids := make([]string, 0, len(contents))
	for _, content := range contents {
		contentID := strings.TrimSpace(content.ContentID)
		if contentID != "" {
			ids = append(ids, contentID)
		}
	}
	return ids
}

// fireTikTok sends an event to TikTok Events API.
func (t *Tracker) fireTikTok(ctx context.Context, eventName string, eventID *uuid.UUID, orderID *uuid.UUID, req models.TrackEventRequest) {
	// Create a background-safe context that isn't canceled when the request finishes
	bgCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	pixelID := t.settings.Get("tiktok_pixel_id")
	accessToken := t.settings.Get("tiktok_access_token")
	testCode := t.settings.Get("tiktok_test_code")

	log.Printf("DEBUG: fireTikTok called for event: %s, pixelID: %s", eventName, pixelID)

	if pixelID == "" || accessToken == "" {
		log.Printf("TikTok tracking skipped — pixel_id or access_token not configured")
		return
	}
	if t.wasEventAlreadySent(bgCtx, eventID, eventName, "tiktok") {
		log.Printf("TikTok duplicate skipped: %s (event_id=%s)", eventName, eventID.String())
		return
	}

	// Securely hash user data for TikTok (requires SHA256)
	tikTokUser := make(map[string]interface{})
	var ttclid string
	if req.UserData != nil {
		for k, v := range req.UserData {
			if str, ok := v.(string); ok && str != "" {
				if k == "email" {
					tikTokUser["email"] = hashSHA256(strings.ToLower(strings.TrimSpace(str)))
				} else if k == "phone" {
					normalized := normalizePhone(str)
					if normalized != "" {
						tikTokUser["phone_number"] = hashSHA256(normalized)
					}
				} else if k == "external_id" {
					tikTokUser["external_id"] = hashSHA256(strings.TrimSpace(str))
				} else if k == "ttclid" {
					ttclid = strings.TrimSpace(str)
				} else {
					// Ignore unsupported keys to avoid bad payload fields.
				}
			}
		}
	}

	// Build TikTok Events API payload using context.* schema
	contextData := map[string]interface{}{}
	if len(tikTokUser) > 0 {
		contextData["user"] = tikTokUser
	}
	if req.PageURL != "" || req.Referrer != "" {
		page := map[string]interface{}{}
		if req.PageURL != "" {
			page["url"] = req.PageURL
		}
		if req.Referrer != "" {
			page["referrer"] = req.Referrer
		}
		contextData["page"] = page
	}
	if req.ClientIP != "" {
		contextData["ip"] = req.ClientIP
	}
	if req.UserAgent != "" {
		contextData["user_agent"] = req.UserAgent
	}
	if ttclid != "" {
		contextData["ad"] = map[string]interface{}{
			"callback": ttclid,
		}
	}

	log.Printf("DEBUG: TIKTOK sending: event_name=%s event_id=%s", eventName, eventID.String())
	properties := map[string]interface{}{}
	if len(req.Contents) > 0 {
		properties["contents"] = req.Contents
		properties["content_type"] = "product"

		ids := contentIDs(req.Contents)
		quantity := 0
		for _, content := range req.Contents {
			if content.Quantity > 0 {
				quantity += content.Quantity
			}
		}
		if len(ids) > 0 {
			properties["content_ids"] = ids
		}
		if quantity > 0 {
			properties["quantity"] = quantity
		}
	}
	if eventUsesMonetaryValue(eventName) && req.Value > 0 {
		if value, ok := normalizeMonetaryValue(req.Value); ok {
			properties["value"] = value
			properties["currency"] = normalizeCurrency(req.Currency)
		}
	}

	eventData := map[string]interface{}{
		"event":      eventName,
		"event_id":   eventID.String(),
		"event_time": time.Now().Unix(),
		"context":    contextData,
	}
	if len(properties) > 0 {
		eventData["properties"] = properties
	}

	if strings.EqualFold(strings.TrimSpace(eventName), "purchase") {
		if _, ok := properties["value"]; !ok {
			payload := map[string]interface{}{
				"event_source":    "web",
				"event_source_id": pixelID,
				"data":            []interface{}{eventData},
			}
			t.logTrackingEvent(bgCtx, eventID, eventName, "tiktok", orderID, payload, "error", "invalid purchase value")
			log.Printf("TikTok Purchase skipped — invalid value: %v (event_id=%s)", req.Value, eventID.String())
			return
		}
	}

	payload := map[string]interface{}{
		"event_source":    "web",
		"event_source_id": pixelID,
		"data":            []interface{}{eventData},
	}
	if testCode != "" {
		payload["test_event_code"] = testCode
	}

	body, _ := json.Marshal(payload)
	apiURL := "https://business-api.tiktok.com/open_api/v1.3/event/track/"

	httpReq, err := http.NewRequestWithContext(bgCtx, "POST", apiURL, bytes.NewReader(body))
	if err != nil {
		t.logTrackingEvent(bgCtx, eventID, eventName, "tiktok", orderID, payload, "error", err.Error())
		return
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Access-Token", accessToken)

	resp, err := t.client.Do(httpReq)
	if err != nil {
		t.logTrackingEvent(bgCtx, eventID, eventName, "tiktok", orderID, payload, "error", err.Error())
		return
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK {
		t.logTrackingEvent(bgCtx, eventID, eventName, "tiktok", orderID, payload, "error",
			fmt.Sprintf("status=%d body=%s", resp.StatusCode, string(respBody)))
		return
	}

	t.logTrackingEvent(bgCtx, eventID, eventName, "tiktok", orderID, payload, "success", "")
	log.Printf("TikTok event fired: %s (event_id=%s)", eventName, eventID.String())
}

// fireMeta sends an event to Meta Conversions API.
func (t *Tracker) fireMeta(ctx context.Context, eventName string, eventID *uuid.UUID, orderID *uuid.UUID, req models.TrackEventRequest) {
	// Create a background-safe context
	bgCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	pixelID := t.settings.Get("meta_pixel_id")
	accessToken := t.settings.Get("meta_access_token")
	testCode := t.settings.Get("meta_test_code")

	if pixelID == "" || accessToken == "" {
		log.Printf("Meta tracking skipped — pixel_id or access_token not configured")
		return
	}
	if t.wasEventAlreadySent(bgCtx, eventID, eventName, "meta") {
		log.Printf("Meta duplicate skipped: %s (event_id=%s)", eventName, eventID.String())
		return
	}

	// Securely hash user data for Meta CAPI (requires SHA256)
	metaUser := make(map[string]interface{})
	if req.UserData != nil {
		for k, v := range req.UserData {
			if str, ok := v.(string); ok && str != "" {
				if k == "email" {
					metaUser["em"] = []string{hashSHA256(strings.ToLower(strings.TrimSpace(str)))}
				} else if k == "phone" {
					normalized := normalizePhone(str)
					if normalized != "" {
						metaUser["ph"] = []string{hashSHA256(normalized)}
					}
				} else if k == "external_id" {
					metaUser["external_id"] = []string{hashSHA256(strings.TrimSpace(str))}
				} else if k == "fbp" {
					metaUser["fbp"] = strings.TrimSpace(str)
				} else if k == "fbc" {
					metaUser["fbc"] = strings.TrimSpace(str)
				} else {
					// Ignore unsupported keys to avoid bad payload fields.
				}
			}
		}
	}
	if req.ClientIP != "" {
		metaUser["client_ip_address"] = req.ClientIP
	}
	if req.UserAgent != "" {
		metaUser["client_user_agent"] = req.UserAgent
	}

	// Build Meta CAPI payload
	customData := map[string]interface{}{}
	if metaContents := buildMetaContents(req.Contents); len(metaContents) > 0 {
		customData["contents"] = metaContents
		customData["content_ids"] = contentIDs(req.Contents)
		customData["content_type"] = "product"
	}
	if eventUsesMonetaryValue(eventName) && req.Value > 0 {
		customData["value"] = req.Value
		if req.Currency != "" {
			customData["currency"] = req.Currency
		}
	}

	eventData := map[string]interface{}{
		"event_name":    eventName,
		"event_id":      eventID.String(),
		"event_time":    time.Now().Unix(),
		"action_source": "website",
		"user_data":     metaUser,
	}
	if len(customData) > 0 {
		eventData["custom_data"] = customData
	}
	if req.PageURL != "" {
		eventData["event_source_url"] = req.PageURL
	}

	payload := map[string]interface{}{
		"data": []interface{}{eventData},
	}
	if testCode != "" {
		payload["test_event_code"] = testCode
	}

	body, _ := json.Marshal(payload)
	apiVersion := strings.TrimSpace(os.Getenv("META_GRAPH_API_VERSION"))
	if apiVersion == "" {
		apiVersion = "v24.0"
	}
	apiURL := fmt.Sprintf("https://graph.facebook.com/%s/%s/events?access_token=%s", apiVersion, pixelID, accessToken)

	httpReq, err := http.NewRequestWithContext(bgCtx, "POST", apiURL, bytes.NewReader(body))
	if err != nil {
		t.logTrackingEvent(bgCtx, eventID, eventName, "meta", orderID, payload, "error", err.Error())
		return
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := t.client.Do(httpReq)
	if err != nil {
		t.logTrackingEvent(bgCtx, eventID, eventName, "meta", orderID, payload, "error", err.Error())
		return
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK {
		t.logTrackingEvent(bgCtx, eventID, eventName, "meta", orderID, payload, "error",
			fmt.Sprintf("status=%d body=%s", resp.StatusCode, string(respBody)))
		return
	}

	t.logTrackingEvent(bgCtx, eventID, eventName, "meta", orderID, payload, "success", "")
	log.Printf("Meta event fired: %s (event_id=%s)", eventName, eventID.String())
}

func (t *Tracker) wasEventAlreadySent(ctx context.Context, eventID *uuid.UUID, eventName, platform string) bool {
	if eventID == nil {
		return false
	}

	var existingID uuid.UUID
	err := t.pool.QueryRow(ctx,
		`SELECT id
		 FROM tracking_logs
		 WHERE event_id = $1 AND event_name = $2 AND platform = $3 AND status = 'success'
		 LIMIT 1`,
		*eventID, eventName, platform,
	).Scan(&existingID)
	if err == nil {
		return true
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return false
	}

	log.Printf("ERROR: tracking dedup lookup failed (event=%s, platform=%s): %v", eventName, platform, err)
	return false
}

// logTrackingEvent persists tracking attempt to DB for debugging.
func (t *Tracker) logTrackingEvent(ctx context.Context, eventID *uuid.UUID, eventName, platform string, orderID *uuid.UUID, payload interface{}, status, errorMsg string) {
	payloadJSON, _ := json.Marshal(payload)

	_, err := t.pool.Exec(ctx,
		`INSERT INTO tracking_logs (event_id, event_name, platform, order_id, payload, status, error_msg)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		eventID, eventName, platform, orderID, payloadJSON, status, errorMsg,
	)
	if err != nil {
		log.Printf("ERROR: log tracking event: %v", err)
	}
}
