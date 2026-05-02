-- ============================================================
-- Glow Beauty Goals — Database Schema
-- PostgreSQL DDL for all 12 tables
-- Run: psql -U postgres -d shopdb -f migrations/001_schema.sql
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 1. admin_users
-- ============================================================
CREATE TABLE IF NOT EXISTS admin_users (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        VARCHAR(255) NOT NULL,
    email       VARCHAR(255) NOT NULL UNIQUE,
    phone       VARCHAR(20),
    password_hash TEXT NOT NULL,
    role        VARCHAR(20) NOT NULL DEFAULT 'admin' CHECK (role IN ('superadmin', 'admin')),
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login  TIMESTAMPTZ
);

CREATE INDEX idx_admin_users_email ON admin_users(email);

-- ============================================================
-- 2. site_settings (key-value configuration table)
-- ============================================================
CREATE TABLE IF NOT EXISTS site_settings (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL DEFAULT '',
    description TEXT,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by  UUID REFERENCES admin_users(id) ON DELETE SET NULL
);

-- ============================================================
-- 3. customers
-- ============================================================
CREATE TABLE IF NOT EXISTS customers (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone         VARCHAR(20) NOT NULL UNIQUE,
    name          VARCHAR(255) NOT NULL DEFAULT '',
    email         VARCHAR(255),
    password_hash TEXT,  -- NULL = guest user
    is_registered BOOLEAN NOT NULL DEFAULT false,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_customers_phone ON customers(phone);
CREATE INDEX idx_customers_email ON customers(email) WHERE email IS NOT NULL;

-- ============================================================
-- 4. categories
-- ============================================================
CREATE TABLE IF NOT EXISTS categories (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name       VARCHAR(255) NOT NULL,
    slug       VARCHAR(255) NOT NULL UNIQUE,
    image_url  TEXT,
    is_active  BOOLEAN NOT NULL DEFAULT true,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_categories_slug ON categories(slug);
CREATE INDEX idx_categories_sort ON categories(sort_order);

-- ============================================================
-- 5. products
-- ============================================================
CREATE TABLE IF NOT EXISTS products (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category_id   UUID REFERENCES categories(id) ON DELETE SET NULL,
    name          VARCHAR(500) NOT NULL,
    slug          VARCHAR(500) NOT NULL UNIQUE,
    description   TEXT NOT NULL DEFAULT '',
    price         NUMERIC(10,2) NOT NULL DEFAULT 0,
    compare_price NUMERIC(10,2),  -- nullable, for strikethrough display
    stock         INT NOT NULL DEFAULT 0,
    sku           VARCHAR(100),
    is_active     BOOLEAN NOT NULL DEFAULT true,
    is_featured   BOOLEAN NOT NULL DEFAULT false,
    sort_order    INT NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_products_slug ON products(slug);
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_active ON products(is_active);
CREATE INDEX idx_products_featured ON products(is_featured) WHERE is_featured = true;
CREATE INDEX idx_products_sort ON products(sort_order);

-- ============================================================
-- 6. product_images
-- ============================================================
CREATE TABLE IF NOT EXISTS product_images (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id    UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    cloudinary_id TEXT NOT NULL,
    url           TEXT NOT NULL,
    is_primary    BOOLEAN NOT NULL DEFAULT false,
    sort_order    INT NOT NULL DEFAULT 0
);

CREATE INDEX idx_product_images_product ON product_images(product_id);

-- ============================================================
-- 7. product_variants (size, shade, color, etc.)
-- ============================================================
CREATE TABLE IF NOT EXISTS product_variants (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    name        VARCHAR(100) NOT NULL,  -- e.g. "Shade"
    value       VARCHAR(255) NOT NULL,  -- e.g. "Nude Pink"
    price_delta NUMERIC(10,2) NOT NULL DEFAULT 0,
    stock       INT NOT NULL DEFAULT 0,
    sort_order  INT NOT NULL DEFAULT 0
);

CREATE INDEX idx_product_variants_product ON product_variants(product_id);

-- ============================================================
-- 8. cart_sessions
-- ============================================================
CREATE TABLE IF NOT EXISTS cart_sessions (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_token VARCHAR(255) NOT NULL UNIQUE,
    customer_id   UUID REFERENCES customers(id) ON DELETE SET NULL,
    expires_at    TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cart_sessions_token ON cart_sessions(session_token);
CREATE INDEX idx_cart_sessions_customer ON cart_sessions(customer_id) WHERE customer_id IS NOT NULL;

-- ============================================================
-- 9. cart_items
-- ============================================================
CREATE TABLE IF NOT EXISTS cart_items (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cart_id    UUID NOT NULL REFERENCES cart_sessions(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL,
    quantity   INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
    UNIQUE(cart_id, product_id, variant_id)
);

CREATE INDEX idx_cart_items_cart ON cart_items(cart_id);

-- ============================================================
-- 10. orders
-- ============================================================

-- Sequence for auto-incrementing order numbers
CREATE SEQUENCE IF NOT EXISTS order_number_seq START WITH 1 INCREMENT BY 1;

CREATE TABLE IF NOT EXISTS orders (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_number    VARCHAR(20) NOT NULL UNIQUE,
    customer_id     UUID REFERENCES customers(id) ON DELETE SET NULL,
    customer_name   VARCHAR(255) NOT NULL,
    customer_phone  VARCHAR(20) NOT NULL,
    customer_email  VARCHAR(255),
    delivery_address TEXT NOT NULL DEFAULT '',
    delivery_area   VARCHAR(100),
    client_ip       TEXT,
    user_agent      TEXT,
    delivery_charge NUMERIC(10,2) NOT NULL DEFAULT 0,
    subtotal        NUMERIC(10,2) NOT NULL DEFAULT 0,
    discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
    total           NUMERIC(10,2) NOT NULL DEFAULT 0,
    status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','confirmed','processing','shipped','delivered','cancelled')),
    pixel_status    VARCHAR(20) CHECK (pixel_status IN ('purchase','cancelled')),
    pixel_fired_at  TIMESTAMPTZ,
    event_id        UUID,
    admin_note      TEXT,
    confirmed_by    UUID REFERENCES admin_users(id) ON DELETE SET NULL,
    confirmed_at    TIMESTAMPTZ,
    cancelled_by    UUID REFERENCES admin_users(id) ON DELETE SET NULL,
    cancelled_at    TIMESTAMPTZ,
    cancel_reason   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_orders_number ON orders(order_number);
CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created ON orders(created_at DESC);

-- ============================================================
-- 11. order_items
-- ============================================================
CREATE TABLE IF NOT EXISTS order_items (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id     UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id   UUID REFERENCES products(id) ON DELETE SET NULL,
    variant_id   UUID REFERENCES product_variants(id) ON DELETE SET NULL,
    product_name VARCHAR(500) NOT NULL,   -- snapshot at time of order
    variant_name VARCHAR(255),            -- snapshot
    unit_price   NUMERIC(10,2) NOT NULL,  -- snapshot
    quantity     INT NOT NULL DEFAULT 1,
    subtotal     NUMERIC(10,2) NOT NULL,
    image_url    TEXT                      -- snapshot
);

CREATE INDEX idx_order_items_order ON order_items(order_id);

-- ============================================================
-- 12. tracking_logs
-- ============================================================
CREATE TABLE IF NOT EXISTS tracking_logs (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id   UUID,
    event_name VARCHAR(50) NOT NULL,
    platform   VARCHAR(10) NOT NULL CHECK (platform IN ('tiktok', 'meta')),
    order_id   UUID REFERENCES orders(id) ON DELETE SET NULL,
    payload    JSONB,
    status     VARCHAR(10) NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'error')),
    error_msg  TEXT,
    fired_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tracking_logs_order ON tracking_logs(order_id);
CREATE INDEX idx_tracking_logs_event ON tracking_logs(event_name);
CREATE INDEX idx_tracking_logs_fired ON tracking_logs(fired_at DESC);

-- ============================================================
-- Function: auto-update updated_at on row modification
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to products
CREATE TRIGGER trg_products_updated_at
    BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Apply trigger to orders
CREATE TRIGGER trg_orders_updated_at
    BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Apply trigger to site_settings
CREATE TRIGGER trg_site_settings_updated_at
    BEFORE UPDATE ON site_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Function: generate order number (ORD-YYYY-NNNNN)
-- ============================================================
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TRIGGER AS $$
BEGIN
    NEW.order_number = 'ORD-' || EXTRACT(YEAR FROM NOW())::TEXT || '-' || LPAD(nextval('order_number_seq')::TEXT, 5, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_orders_number
    BEFORE INSERT ON orders
    FOR EACH ROW
    WHEN (NEW.order_number IS NULL OR NEW.order_number = '')
    EXECUTE FUNCTION generate_order_number();

-- ============================================================
-- Seed: default site_settings
-- ============================================================
INSERT INTO site_settings (key, value, description) VALUES
    ('site_name',          'Glow Beauty',                 'Website name displayed in header and title'),
    ('site_logo',          '',                            'Logo image URL (Cloudinary)'),
    ('delivery_enabled',   'true',                        'Enable/disable delivery option'),
    ('delivery_charge',    '60',                          'Delivery charge in BDT'),
    ('delivery_free_above','0',                           'Free delivery above this amount (0 = never free)'),
    ('tiktok_pixel_id',    '',                            'TikTok Pixel ID'),
    ('tiktok_access_token','',                            'TikTok Events API access token'),
    ('tiktok_test_code',   '',                            'TikTok test event code (for sandbox)'),
    ('meta_pixel_id',      '',                            'Meta (Facebook) Pixel ID'),
    ('meta_access_token',  '',                            'Meta Conversions API access token'),
    ('meta_test_code',     '',                            'Meta test event code (for sandbox)'),
    ('currency',           'BDT',                         'Store currency code'),
    ('whatsapp_number',    '',                            'WhatsApp contact number'),
    ('primary_color',      '#E91E63',                     'Primary brand color')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- Seed: default superadmin user
-- Password: admin123 (bcrypt hash)
-- CHANGE THIS IMMEDIATELY after first login!
-- ============================================================
INSERT INTO admin_users (name, email, phone, password_hash, role)
VALUES (
    'Super Admin',
    'admin@glow.com',
    '',
    -- bcrypt hash of "admin123"
    '$2a$10$rrBI4Ld1WRxiLX1mkizqRuhV7HnGdBaJEpDOTg27etN/8gRSQz2Xi',
    'superadmin'
) ON CONFLICT (email) DO NOTHING;
