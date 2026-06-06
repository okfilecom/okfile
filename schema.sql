CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  verified_at TEXT,
  created_at TEXT NOT NULL,
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS magic_links (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  session_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active',
  limit_prepare_per_window INTEGER NOT NULL DEFAULT 120,
  limit_prepare_window_sec INTEGER NOT NULL DEFAULT 3600,
  limit_upload_count_total INTEGER NOT NULL DEFAULT 1000,
  uploaded_count_total INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS api_key_usage_windows (
  api_key_id TEXT NOT NULL,
  window_started_at INTEGER NOT NULL,
  prepare_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (api_key_id, window_started_at),
  FOREIGN KEY (api_key_id) REFERENCES api_keys(id)
);

CREATE TABLE IF NOT EXISTS upload_notification_daily (
  day_key TEXT PRIMARY KEY,
  sent_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS published_files (
  id TEXT PRIMARY KEY,
  file_name TEXT NOT NULL,
  content_type TEXT,
  publish_origin TEXT NOT NULL,
  view_url TEXT NOT NULL,
  download_url TEXT NOT NULL,
  play_url TEXT NOT NULL,
  api_key_id TEXT,
  user_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sites (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  publish_origin TEXT NOT NULL,
  site_url TEXT NOT NULL,
  site_hostname TEXT NOT NULL,
  subdomain TEXT NOT NULL,
  entry_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'preparing',
  file_count INTEGER NOT NULL DEFAULT 0,
  total_size INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT,
  api_key_id TEXT,
  user_id TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS site_files (
  site_id TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  file_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  content_type TEXT,
  size INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  PRIMARY KEY (site_id, relative_path)
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_magic_links_user_id ON magic_links(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_published_files_created_at ON published_files(created_at);
CREATE INDEX IF NOT EXISTS idx_sites_created_at ON sites(created_at);
CREATE INDEX IF NOT EXISTS idx_site_files_file_id ON site_files(file_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sites_site_hostname ON sites(site_hostname);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sites_subdomain ON sites(subdomain);
