CREATE TABLE IF NOT EXISTS bokun_content_localizations (
  product_id TEXT NOT NULL,
  locale TEXT NOT NULL,
  field_key TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  source_text TEXT NOT NULL,
  translated_text TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'workers-ai',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (product_id, locale, field_key)
);

CREATE INDEX IF NOT EXISTS idx_bokun_content_localizations_hash
  ON bokun_content_localizations(product_id, locale, source_hash);
