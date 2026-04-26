INSERT INTO site_settings (key, value, description)
VALUES
  ('contact_phone', '', 'Public support phone number for call button/footer'),
  ('contact_email', 'support@glowbeauty.com', 'Public support email for footer')
ON CONFLICT (key) DO NOTHING;
