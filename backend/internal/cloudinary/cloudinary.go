package cloudinary

import (
	"fmt"
	"log"
	"net/http"
	"net/url"
	"strings"
)

// Client handles Cloudinary API operations.
type Client struct {
	cloudName string
	apiKey    string
	apiSecret string
}

// NewClient creates a Cloudinary client from the CLOUDINARY_URL.
// Format: cloudinary://api_key:api_secret@cloud_name
func NewClient(cloudinaryURL string) (*Client, error) {
	if cloudinaryURL == "" {
		return &Client{}, nil // Return empty client, delete operations will be no-ops
	}

	parsed, err := url.Parse(cloudinaryURL)
	if err != nil {
		return nil, fmt.Errorf("parse cloudinary url: %w", err)
	}

	apiKey := parsed.User.Username()
	apiSecret, _ := parsed.User.Password()
	cloudName := parsed.Host

	if apiKey == "" || apiSecret == "" || cloudName == "" {
		return nil, fmt.Errorf("invalid cloudinary url format, expected cloudinary://api_key:api_secret@cloud_name")
	}

	return &Client{
		cloudName: cloudName,
		apiKey:    apiKey,
		apiSecret: apiSecret,
	}, nil
}

// Delete removes an image from Cloudinary by its public_id.
func (c *Client) Delete(publicID string) error {
	if c.cloudName == "" {
		log.Printf("WARN: Cloudinary not configured, skipping delete for %s", publicID)
		return nil
	}

	apiURL := fmt.Sprintf("https://api.cloudinary.com/v1_1/%s/image/destroy", c.cloudName)

	form := url.Values{}
	form.Set("public_id", publicID)

	req, err := http.NewRequest("POST", apiURL, strings.NewReader(form.Encode()))
	if err != nil {
		return fmt.Errorf("create delete request: %w", err)
	}

	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.SetBasicAuth(c.apiKey, c.apiSecret)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("cloudinary delete request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("cloudinary delete failed with status %d", resp.StatusCode)
	}

	log.Printf("Deleted from Cloudinary: %s", publicID)
	return nil
}
