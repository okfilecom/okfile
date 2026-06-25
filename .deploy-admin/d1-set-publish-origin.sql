INSERT INTO app_settings (key, value, updated_at)
VALUES ('publish_origin', 'https://ok26.org', datetime('now'))
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;
