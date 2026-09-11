CREATE TABLE customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  identity_key TEXT NOT NULL UNIQUE,
  company_name TEXT NOT NULL,
  domain TEXT,
  street TEXT,
  postal_code TEXT,
  city TEXT,
  imported_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_customers_domain ON customers(domain);

ALTER TABLE companies ADD COLUMN sales_feedback TEXT CHECK (sales_feedback IN ('good_fit', 'poor_fit', 'uncertain'));
ALTER TABLE companies ADD COLUMN feedback_note TEXT;
