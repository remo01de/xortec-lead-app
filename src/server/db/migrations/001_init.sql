-- Datenmodell gemaess docs/spezifikation.md §4

CREATE TABLE runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  area_code TEXT NOT NULL,
  started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  candidates_found INTEGER NOT NULL DEFAULT 0,
  candidates_qualified INTEGER NOT NULL DEFAULT 0,
  api_calls INTEGER NOT NULL DEFAULT 0,
  cost_eur REAL NOT NULL DEFAULT 0,
  trigger TEXT NOT NULL CHECK (trigger IN ('cron', 'manual'))
);

CREATE TABLE companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  domain TEXT NOT NULL UNIQUE,
  company_name TEXT NOT NULL,
  website TEXT,
  street TEXT,
  postal_code TEXT,
  city TEXT,
  phone TEXT,
  lat REAL,
  lon REAL,
  geocode_source TEXT CHECK (geocode_source IN ('nominatim', 'plz_centroid', 'none')),
  company_type TEXT,
  services TEXT NOT NULL DEFAULT '[]',              -- JSON array
  target_segments TEXT NOT NULL DEFAULT '[]',        -- JSON array
  manufacturer_mentions TEXT NOT NULL DEFAULT '[]',  -- JSON array of {manufacturer, relationship}
  certifications TEXT NOT NULL DEFAULT '[]',         -- JSON array
  score_fachlichkeit INTEGER NOT NULL DEFAULT 0,
  score_potenzial INTEGER NOT NULL DEFAULT 0,
  score_datenqualitaet INTEGER NOT NULL DEFAULT 0,
  priority TEXT CHECK (priority IN ('A', 'B', 'C')),
  verification_status TEXT NOT NULL DEFAULT 'unverified' CHECK (verification_status IN ('verified', 'unverified')),
  status TEXT NOT NULL DEFAULT 'neu' CHECK (status IN ('neu', 'angerufen', 'kein_interesse', 'in_salesforce', 'bestandskunde')),
  note TEXT,
  first_seen_run_id INTEGER REFERENCES runs (id),
  last_updated TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_companies_postal_code ON companies (postal_code);
CREATE INDEX idx_companies_lat_lon ON companies (lat, lon);
CREATE INDEX idx_companies_status ON companies (status);

CREATE TABLE sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  title TEXT,
  evidence TEXT,
  http_ok INTEGER,       -- 0/1, NULL = not yet checked
  checked_at TEXT
);

CREATE INDEX idx_sources_company_id ON sources (company_id);

CREATE TABLE evidence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  text TEXT NOT NULL
);

CREATE INDEX idx_evidence_company_id ON evidence (company_id);
