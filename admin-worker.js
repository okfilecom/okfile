const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const EXPIRED_CLEANUP_BATCH_LIMIT = 200;
const STALE_UPLOAD_SESSION_TTL_HOURS = 24;
const STALE_UPLOAD_SESSION_TTL_MS = STALE_UPLOAD_SESSION_TTL_HOURS * 60 * 60 * 1000;
const PUBLIC_SITE_EXAMPLE_ORIGIN = 'https://okfile.com';
const PUBLISH_DOMAIN_SETTING_KEY = 'publish_origin';
const META_PREFIX = '__meta__/';
const SESSION_PREFIX = '__upload_sessions__/';
const SITE_SESSION_PREFIX = '__site_sessions__/';
const SITE_UPDATE_TOKEN_PREFIX = '__site_update_tokens__/';
const SESSION_COOKIE = 'okfile_session';
const R2_STANDARD_STORAGE_PRICE_PER_GB_MONTH = 0.015;
const R2_STANDARD_STORAGE_FREE_GB = 10;
const R2_LIST_PAGE_LIMIT = 1000;
const VIP_FILE_SIZE_LIMITS = {
  0: 500 * 1024 * 1024,
  1: 5 * 1024 * 1024 * 1024,
  2: 50 * 1024 * 1024 * 1024,
  3: 500 * 1024 * 1024 * 1024,
  4: 1024 * 1024 * 1024 * 1024
};

let vipLevelSchemaEnsured = false;

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
      ...extraHeaders
    }
  });
}

function htmlResponse(html, status = 200, extraHeaders = {}) {
  return new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
      ...extraHeaders
    }
  });
}

function redirect(location, headers = {}) {
  return new Response(null, {
    status: 302,
    headers: {
      Location: location,
      ...headers
    }
  });
}

function sanitizeRelativeNextPath(rawValue, fallback, isAllowed) {
  const raw = String(rawValue || '').trim();
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return fallback;
  try {
    const parsed = new URL(raw, 'https://okfile.local');
    if (parsed.origin !== 'https://okfile.local') return fallback;
    const candidate = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    return isAllowed(parsed.pathname, candidate) ? candidate : fallback;
  } catch {
    return fallback;
  }
}

function sanitizeAdminNextPath(rawValue, fallback = '/') {
  return sanitizeRelativeNextPath(rawValue, fallback, (basePath) => {
    if (basePath === '/login' || basePath.startsWith('/auth/')) return false;
    return basePath === '/'
      || basePath === '/account'
      || basePath === '/overview'
      || basePath === '/storage'
      || basePath === '/users'
      || basePath === '/files'
      || basePath === '/publish-origin'
      || basePath === '/config'
      || basePath === '/sites'
      || basePath === '/api-keys'
      || basePath === '/cleanup'
      || /^\/users\/[^/]+$/.test(basePath);
  });
}

function svgResponse(svg, status = 200, extraHeaders = {}) {
  return new Response(svg, {
    status,
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
      ...extraHeaders
    }
  });
}

const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="okfileLogoGradient" x1="8" y1="8" x2="56" y2="56" gradientUnits="userSpaceOnUse">
      <stop stop-color="#f48120"/>
      <stop offset="1" stop-color="#ffb347"/>
    </linearGradient>
  </defs>
  <rect width="64" height="64" rx="18" fill="url(#okfileLogoGradient)"/>
  <text x="32" y="42" text-anchor="middle" font-size="30" font-family="Inter, Arial, sans-serif" font-weight="800" fill="#ffffff">O</text>
</svg>`;

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatSize(size) {
  if (!Number.isFinite(size) || size < 0) return 'Unknown';
  if (size >= 1024 * 1024 * 1024 * 1024) return `${(size / 1024 / 1024 / 1024 / 1024).toFixed(2)} TB`;
  if (size >= 1024 * 1024 * 1024) return `${(size / 1024 / 1024 / 1024).toFixed(2)} GB`;
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  if (size >= 1024) return `${(size / 1024).toFixed(0)} KB`;
  return `${size} B`;
}

function normalizeVipLevel(value) {
  const level = Number(value);
  if (!Number.isInteger(level)) return 0;
  return Math.max(0, Math.min(level, 4));
}

function vipLabel(level) {
  const normalized = normalizeVipLevel(level);
  return normalized > 0 ? `VIP-${normalized}` : 'Standard';
}

function maxFileSizeForVipLevel(level) {
  const normalized = normalizeVipLevel(level);
  return VIP_FILE_SIZE_LIMITS[normalized] || VIP_FILE_SIZE_LIMITS[0];
}

async function ensureVipLevelColumn(env) {
  if (vipLevelSchemaEnsured) return;
  try {
    await env.DB.prepare('ALTER TABLE users ADD COLUMN vip_level INTEGER NOT NULL DEFAULT 0').run();
  } catch {}
  vipLevelSchemaEnsured = true;
}

function toGb(size) {
  return Number(size || 0) / 1024 / 1024 / 1024;
}

function estimateMonthlyStorageCost(bytes) {
  const totalGb = toGb(bytes);
  const grossUsd = totalGb * R2_STANDARD_STORAGE_PRICE_PER_GB_MONTH;
  const billableGb = Math.max(totalGb - R2_STANDARD_STORAGE_FREE_GB, 0);
  const billableUsd = billableGb * R2_STANDARD_STORAGE_PRICE_PER_GB_MONTH;
  return {
    totalGb,
    billableGb,
    grossUsd,
    billableUsd,
    freeGb: R2_STANDARD_STORAGE_FREE_GB,
    unitUsdPerGbMonth: R2_STANDARD_STORAGE_PRICE_PER_GB_MONTH
  };
}

function chunkArray(items, chunkSize = 100) {
  const list = Array.isArray(items) ? items : [];
  const size = Math.max(1, chunkSize);
  const chunks = [];
  for (let index = 0; index < list.length; index += size) {
    chunks.push(list.slice(index, index + size));
  }
  return chunks;
}

function placeholders(count) {
  return Array.from({ length: Math.max(0, count) }, () => '?').join(', ');
}

function isInternalBucketKey(key) {
  const value = String(key || '');
  return value.startsWith(META_PREFIX)
    || value.startsWith(SESSION_PREFIX)
    || value.startsWith(SITE_SESSION_PREFIX)
    || value.startsWith(SITE_UPDATE_TOKEN_PREFIX);
}

function generateId(len = 8) {
  const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz';
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  let result = '';
  for (const value of bytes) result += alphabet[value % alphabet.length];
  return result;
}

function randomToken(byteLength = 32) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  let binary = '';
  for (const value of bytes) binary += String.fromCharCode(value);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((item) => item.toString(16).padStart(2, '0')).join('');
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
}

function parseCookies(request) {
  const header = request.headers.get('cookie') || '';
  const result = {};
  for (const part of header.split(/;\s*/)) {
    if (!part) continue;
    const index = part.indexOf('=');
    if (index < 0) continue;
    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    result[name] = decodeURIComponent(value);
  }
  return result;
}

function sessionCookieDomain(request) {
  const hostname = new URL(request.url).hostname.toLowerCase();
  if (hostname === 'okfile.com' || hostname.endsWith('.okfile.com')) {
    return 'Domain=.okfile.com; ';
  }
  return '';
}

function buildSessionCookie(token, request) {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; ${sessionCookieDomain(request)}Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

function clearSessionCookie(request) {
  return `${SESSION_COOKIE}=; Path=/; ${sessionCookieDomain(request)}Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

function adminEmailSet(env) {
  return new Set(
    String(env.ADMIN_EMAILS || '')
      .split(',')
      .map((value) => normalizeEmail(value))
      .filter(Boolean)
  );
}

async function ensureAppSettingsTable(env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`
  ).run();
}

async function ensurePublishedFilesTable(env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS published_files (
      id TEXT PRIMARY KEY,
      file_name TEXT NOT NULL,
      content_type TEXT,
      size INTEGER NOT NULL DEFAULT 0,
      publish_origin TEXT NOT NULL,
      view_url TEXT NOT NULL,
      download_url TEXT NOT NULL,
      play_url TEXT NOT NULL,
      client_ip TEXT,
      client_region TEXT,
      api_key_id TEXT,
      user_id TEXT,
      created_at TEXT NOT NULL
    )`
  ).run();
  try {
    await env.DB.prepare('ALTER TABLE published_files ADD COLUMN size INTEGER NOT NULL DEFAULT 0').run();
  } catch {}
  try {
    await env.DB.prepare('ALTER TABLE published_files ADD COLUMN client_ip TEXT').run();
  } catch {}
  try {
    await env.DB.prepare('ALTER TABLE published_files ADD COLUMN client_region TEXT').run();
  } catch {}
}

async function ensureSitesTables(env) {
  await env.DB.batch([
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS sites (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        publish_origin TEXT NOT NULL,
        site_url TEXT NOT NULL,
        site_hostname TEXT NOT NULL DEFAULT '',
        subdomain TEXT NOT NULL DEFAULT '',
        entry_path TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'preparing',
        file_count INTEGER NOT NULL DEFAULT 0,
        total_size INTEGER NOT NULL DEFAULT 0,
        expires_at TEXT,
        api_key_id TEXT,
        user_id TEXT,
        active_release_id TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        completed_at TEXT,
        updated_at TEXT
      )`
    ),
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS site_files (
        site_id TEXT NOT NULL,
        relative_path TEXT NOT NULL,
        file_id TEXT NOT NULL,
        file_name TEXT NOT NULL,
        content_type TEXT,
        size INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        PRIMARY KEY (site_id, relative_path)
      )`
    ),
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS site_releases (
        id TEXT PRIMARY KEY,
        site_id TEXT NOT NULL,
        version_no INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'ready',
        publish_origin TEXT NOT NULL,
        site_url TEXT NOT NULL,
        site_hostname TEXT NOT NULL,
        subdomain TEXT NOT NULL,
        entry_path TEXT NOT NULL,
        file_count INTEGER NOT NULL DEFAULT 0,
        total_size INTEGER NOT NULL DEFAULT 0,
        expires_at TEXT,
        based_on_release_id TEXT,
        change_summary TEXT,
        created_at TEXT NOT NULL,
        completed_at TEXT,
        activated_at TEXT
      )`
    ),
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS site_release_files (
        release_id TEXT NOT NULL,
        relative_path TEXT NOT NULL,
        file_id TEXT NOT NULL,
        file_name TEXT NOT NULL,
        content_type TEXT,
        size INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        PRIMARY KEY (release_id, relative_path)
      )`
    )
  ]);
  for (const statement of [
    'ALTER TABLE sites ADD COLUMN site_hostname TEXT NOT NULL DEFAULT ""',
    'ALTER TABLE sites ADD COLUMN subdomain TEXT NOT NULL DEFAULT ""',
    'ALTER TABLE sites ADD COLUMN active_release_id TEXT NOT NULL DEFAULT ""',
    'ALTER TABLE sites ADD COLUMN updated_at TEXT'
  ]) {
    try {
      await env.DB.prepare(statement).run();
    } catch {}
  }
  await env.DB.batch([
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_sites_created_at ON sites(created_at)'),
    env.DB.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_sites_site_hostname ON sites(site_hostname)'),
    env.DB.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_sites_subdomain ON sites(subdomain)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_site_files_file_id ON site_files(file_id)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_site_releases_site_id ON site_releases(site_id)'),
    env.DB.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_site_releases_site_version ON site_releases(site_id, version_no)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_site_release_files_file_id ON site_release_files(file_id)')
  ]);
}

function parseChangeSummary(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

async function ensureSiteReleaseBackfill(siteId, env) {
  await ensureSitesTables(env);
  const site = await env.DB.prepare(
    `SELECT id, publish_origin, site_url, site_hostname, subdomain, entry_path, file_count, total_size, expires_at,
            active_release_id, created_at, completed_at, updated_at
     FROM sites WHERE id = ?`
  ).bind(siteId).first();
  if (!site) return null;
  if (site.active_release_id) return site.active_release_id;

  const existingRelease = await env.DB.prepare(
    `SELECT id
     FROM site_releases
     WHERE site_id = ?
     ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END, version_no DESC
     LIMIT 1`
  ).bind(siteId).first();
  if (existingRelease?.id) {
    await env.DB.prepare(
      'UPDATE sites SET active_release_id = ?, updated_at = COALESCE(updated_at, ?) WHERE id = ?'
    ).bind(existingRelease.id, site.updated_at || site.completed_at || site.created_at || new Date().toISOString(), siteId).run();
    return existingRelease.id;
  }

  const filesResult = await env.DB.prepare(
    `SELECT relative_path, file_id, file_name, content_type, size, created_at
     FROM site_files
     WHERE site_id = ?
     ORDER BY relative_path ASC`
  ).bind(siteId).all();
  const files = filesResult.results || [];
  if (!files.length) return null;

  const releaseId = `rel_backfill_${generateId(10)}`;
  const now = new Date().toISOString();
  const createdAt = site.completed_at || site.created_at || now;
  const completedAt = site.completed_at || createdAt;
  const statements = [
    env.DB.prepare(
      `INSERT INTO site_releases (
        id, site_id, version_no, status, publish_origin, site_url, site_hostname, subdomain, entry_path,
        file_count, total_size, expires_at, based_on_release_id, change_summary, created_at, completed_at, activated_at
      ) VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      releaseId,
      siteId,
      1,
      site.publish_origin || '',
      site.site_url || '',
      site.site_hostname || '',
      site.subdomain || '',
      site.entry_path || '',
      Number(site.file_count || files.length),
      Number(site.total_size || 0),
      site.expires_at || null,
      null,
      JSON.stringify({ source: 'legacy-backfill' }),
      createdAt,
      completedAt,
      completedAt
    ),
    env.DB.prepare('UPDATE sites SET active_release_id = ?, updated_at = ? WHERE id = ?').bind(releaseId, now, siteId)
  ];
  for (const item of files) {
    statements.push(
      env.DB.prepare(
        `INSERT INTO site_release_files (
          release_id, relative_path, file_id, file_name, content_type, size, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        releaseId,
        item.relative_path,
        item.file_id,
        item.file_name || '',
        item.content_type || '',
        Number(item.size || 0),
        item.created_at || createdAt
      )
    );
  }
  await env.DB.batch(statements);
  return releaseId;
}

async function listSiteReleases(siteId, env, limit = 20) {
  await ensureSitesTables(env);
  await ensureSiteReleaseBackfill(siteId, env);
  const result = await env.DB.prepare(
    `SELECT
        id, site_id, version_no, status, publish_origin, site_url, site_hostname, subdomain, entry_path,
        file_count, total_size, expires_at, based_on_release_id, change_summary, created_at, completed_at, activated_at
     FROM site_releases
     WHERE site_id = ?
     ORDER BY version_no DESC
     LIMIT ?`
  ).bind(siteId, limit).all();
  return (result.results || []).map((item) => ({
    id: item.id,
    siteId: item.site_id,
    versionNo: Number(item.version_no || 0),
    status: item.status || 'ready',
    publishOrigin: item.publish_origin || '',
    siteUrl: item.site_url || '',
    siteHostname: item.site_hostname || '',
    subdomain: item.subdomain || '',
    entryPath: item.entry_path || '',
    fileCount: Number(item.file_count || 0),
    totalSize: Number(item.total_size || 0),
    expiresAt: item.expires_at || null,
    basedOnReleaseId: item.based_on_release_id || null,
    changeSummary: parseChangeSummary(item.change_summary),
    createdAt: item.created_at || null,
    completedAt: item.completed_at || null,
    activatedAt: item.activated_at || null
  }));
}

async function activateSiteRelease(siteId, releaseId, env) {
  await ensureSitesTables(env);
  await ensureSiteReleaseBackfill(siteId, env);
  const release = await env.DB.prepare(
    `SELECT
        id, site_id, publish_origin, site_url, site_hostname, subdomain, entry_path, total_size, expires_at
     FROM site_releases
     WHERE site_id = ? AND id = ?`
  ).bind(siteId, releaseId).first();
  if (!release) return null;
  const site = await env.DB.prepare('SELECT id, name FROM sites WHERE id = ?').bind(siteId).first();
  if (!site) return null;
  const filesResult = await env.DB.prepare(
    `SELECT relative_path, file_id, file_name, content_type, size, created_at
     FROM site_release_files
     WHERE release_id = ?
     ORDER BY relative_path ASC`
  ).bind(releaseId).all();
  const files = filesResult.results || [];
  const now = new Date().toISOString();
  const statements = [
    env.DB.prepare(
      `UPDATE site_releases
       SET status = CASE
         WHEN id = ? THEN 'active'
         WHEN status = 'active' THEN 'archived'
         ELSE status
       END,
       activated_at = CASE WHEN id = ? THEN ? ELSE activated_at END
       WHERE site_id = ?`
    ).bind(releaseId, releaseId, now, siteId),
    env.DB.prepare(
      `UPDATE sites
       SET publish_origin = ?, site_url = ?, site_hostname = ?, subdomain = ?, active_release_id = ?, entry_path = ?,
           status = 'active', file_count = ?, total_size = ?, expires_at = ?, completed_at = ?, updated_at = ?
       WHERE id = ?`
    ).bind(
      release.publish_origin || '',
      release.site_url || '',
      release.site_hostname || '',
      release.subdomain || '',
      release.id,
      release.entry_path || '',
      files.length,
      Number(release.total_size || 0),
      release.expires_at || null,
      now,
      now,
      siteId
    ),
    env.DB.prepare('DELETE FROM site_files WHERE site_id = ?').bind(siteId)
  ];
  for (const item of files) {
    statements.push(
      env.DB.prepare(
        `INSERT INTO site_files (
          site_id, relative_path, file_id, file_name, content_type, size, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        siteId,
        item.relative_path,
        item.file_id,
        item.file_name || '',
        item.content_type || '',
        Number(item.size || 0),
        item.created_at || now
      )
    );
  }
  await env.DB.batch(statements);
  return {
    siteId,
    releaseId,
    activatedAt: now
  };
}

function normalizePublishOrigin(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    return NaN;
  }
  if (!parsed.hostname) return NaN;
  if (parsed.pathname !== '/' || parsed.search || parsed.hash) return NaN;
  parsed.protocol = 'https:';
  parsed.username = '';
  parsed.password = '';
  return parsed.origin;
}

async function getConfiguredPublishOrigin(env) {
  await ensureAppSettingsTable(env);
  const row = await env.DB.prepare(
    'SELECT value FROM app_settings WHERE key = ?'
  ).bind(PUBLISH_DOMAIN_SETTING_KEY).first();
  const normalized = normalizePublishOrigin(row?.value);
  return typeof normalized === 'string' ? normalized : null;
}

function metaKey(id) {
  return `${META_PREFIX}${id}.json`;
}

function uploadSessionKey(id) {
  return `${SESSION_PREFIX}${id}.json`;
}

function siteSessionKey(id) {
  return `${SITE_SESSION_PREFIX}${id}.json`;
}

function siteUpdateTokenKey(token) {
  return `${SITE_UPDATE_TOKEN_PREFIX}${token}.json`;
}

async function readJsonObject(key, env) {
  const object = await env.FILES.get(key);
  if (!object) return null;
  try {
    return JSON.parse(await object.text());
  } catch {
    return null;
  }
}

async function saveJsonObject(key, payload, env) {
  await env.FILES.put(key, JSON.stringify(payload), {
    httpMetadata: {
      contentType: 'application/json; charset=utf-8',
      cacheControl: 'no-store'
    }
  });
}

async function readSidecarMeta(id, env) {
  return readJsonObject(metaKey(id), env);
}

function normalizeExpiresAt(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return NaN;
  return parsed.toISOString();
}

function normalizePositiveInt(value, defaults, minimum = 1, maximum = 200) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return defaults;
  return Math.max(minimum, Math.min(parsed, maximum));
}

function parseMetaIdFromKey(key) {
  const escapedPrefix = META_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`^${escapedPrefix}([a-zA-Z0-9]+)\\.json$`).exec(String(key || ''));
  return match ? match[1] : null;
}

async function deleteFileAndMeta(id, env) {
  await env.FILES.delete(id);
  await env.FILES.delete(metaKey(id));
  await ensurePublishedFilesTable(env);
  await env.DB.prepare('DELETE FROM published_files WHERE id = ?').bind(id).run();
}

async function cleanupExpiredFiles(env, options = {}) {
  const limit = Math.max(1, Math.min(Number(options.limit || EXPIRED_CLEANUP_BATCH_LIMIT), 1000));
  const listed = await env.FILES.list({ prefix: META_PREFIX, limit });
  const now = Date.now();
  let checked = 0;
  let deleted = 0;
  const deletedIds = [];
  for (const object of listed.objects || []) {
    checked += 1;
    const id = parseMetaIdFromKey(object.key);
    if (!id) continue;
    const sidecar = await readSidecarMeta(id, env);
    const expiresAt = normalizeExpiresAt(sidecar?.expiresAt);
    if (typeof expiresAt !== 'string') continue;
    if (new Date(expiresAt).getTime() > now) continue;
    await deleteFileAndMeta(id, env);
    deleted += 1;
    deletedIds.push(id);
  }
  return {
    success: true,
    checked,
    deleted,
    deletedIds,
    truncated: Boolean(listed.truncated),
    cursor: listed.cursor || null
  };
}

async function backfillPublishedFileSizes(env, options = {}) {
  await ensurePublishedFilesTable(env);
  const limit = Math.max(1, Math.min(Number(options.limit || 100), 500));
  const result = await env.DB.prepare(
    `SELECT id
     FROM published_files
     WHERE size <= 0
     ORDER BY created_at ASC
     LIMIT ?`
  ).bind(limit).all();
  let checked = 0;
  let updated = 0;
  let missing = 0;
  const updatedIds = [];
  for (const row of result.results || []) {
    const id = String(row.id || '');
    if (!id) continue;
    checked += 1;
    const head = await env.FILES.head(id);
    if (!head) {
      missing += 1;
      continue;
    }
    await env.DB.prepare('UPDATE published_files SET size = ? WHERE id = ?').bind(Number(head.size || 0), id).run();
    updated += 1;
    updatedIds.push(id);
  }
  const remainingRow = await env.DB.prepare(
    'SELECT COUNT(*) AS total FROM published_files WHERE size <= 0'
  ).first();
  return {
    success: true,
    checked,
    updated,
    missing,
    updatedIds,
    remaining: Number(remainingRow?.total || 0)
  };
}

async function collectTrackedFileOwnership(env) {
  await ensureSitesTables(env);
  await ensurePublishedFilesTable(env);
  const result = await env.DB.prepare(
    `SELECT
       file_id,
       CASE
         WHEN MAX(CASE WHEN user_id IS NOT NULL THEN 1 ELSE 0 END) = 1 THEN 'registered'
         ELSE 'anonymous'
       END AS owner_kind
     FROM (
       SELECT id AS file_id, user_id FROM published_files
       UNION ALL
       SELECT sf.file_id, s.user_id
       FROM site_files sf
       LEFT JOIN sites s ON s.id = sf.site_id
       UNION ALL
       SELECT srf.file_id, s.user_id
       FROM site_release_files srf
       INNER JOIN site_releases sr ON sr.id = srf.release_id
       INNER JOIN sites s ON s.id = sr.site_id
     ) refs
     WHERE file_id IS NOT NULL AND file_id <> ''
     GROUP BY file_id`
  ).all();
  return new Map((result.results || []).map((item) => [String(item.file_id || ''), item.owner_kind === 'registered' ? 'registered' : 'anonymous']).filter((entry) => entry[0]));
}

async function collectBucketStorageStats(env, options = {}) {
  const trackedOwnership = options.trackedOwnership instanceof Map ? options.trackedOwnership : null;
  let cursor;
  let totalObjects = 0;
  let totalBytes = 0;
  let internalObjects = 0;
  let internalBytes = 0;
  let userObjects = 0;
  let userBytes = 0;
  let referencedObjects = 0;
  let referencedBytes = 0;
  let referencedObjectsAnonymous = 0;
  let referencedBytesAnonymous = 0;
  let referencedObjectsRegistered = 0;
  let referencedBytesRegistered = 0;
  let sessionObjects = 0;
  let sessionBytes = 0;
  let sessionObjectsAnonymous = 0;
  let sessionBytesAnonymous = 0;
  let sessionObjectsRegistered = 0;
  let sessionBytesRegistered = 0;
  do {
    const listed = await env.FILES.list({ cursor, limit: R2_LIST_PAGE_LIMIT });
    for (const object of listed.objects || []) {
      const key = String(object.key || '');
      const size = Number(object.size || 0);
      totalObjects += 1;
      totalBytes += size;
      if (isInternalBucketKey(key)) {
        internalObjects += 1;
        internalBytes += size;
      } else {
        userObjects += 1;
        userBytes += size;
        const ownerKind = trackedOwnership?.get(key);
        if (ownerKind) {
          referencedObjects += 1;
          referencedBytes += size;
          if (ownerKind === 'registered') {
            referencedObjectsRegistered += 1;
            referencedBytesRegistered += size;
          } else {
            referencedObjectsAnonymous += 1;
            referencedBytesAnonymous += size;
          }
        } else {
          const uploadSession = await readJsonObject(uploadSessionKey(key), env);
          if (uploadSession) {
            const sessionOwnerKind = uploadSession.userId ? 'registered' : 'anonymous';
            sessionObjects += 1;
            sessionBytes += size;
            if (sessionOwnerKind === 'registered') {
              sessionObjectsRegistered += 1;
              sessionBytesRegistered += size;
            } else {
              sessionObjectsAnonymous += 1;
              sessionBytesAnonymous += size;
            }
          }
        }
      }
    }
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
  return {
    totalObjects,
    totalBytes,
    internalObjects,
    internalBytes,
    userObjects,
    userBytes,
    referencedObjects,
    referencedBytes,
    referencedObjectsAnonymous,
    referencedBytesAnonymous,
    referencedObjectsRegistered,
    referencedBytesRegistered,
    sessionObjects,
    sessionBytes,
    sessionObjectsAnonymous,
    sessionBytesAnonymous,
    sessionObjectsRegistered,
    sessionBytesRegistered
  };
}

async function collectStorageStats(env) {
  await ensureSitesTables(env);
  await ensurePublishedFilesTable(env);
  const trackedOwnership = await collectTrackedFileOwnership(env);
  const now = new Date().toISOString();
  const summaryRow = await env.DB.prepare(
    `WITH referenced_sources AS (
       SELECT id AS file_id, size, user_id
       FROM published_files
       UNION ALL
       SELECT sf.file_id, sf.size, s.user_id
       FROM site_files sf
       LEFT JOIN sites s ON s.id = sf.site_id
       UNION ALL
       SELECT srf.file_id, srf.size, s.user_id
       FROM site_release_files srf
       INNER JOIN site_releases sr ON sr.id = srf.release_id
       INNER JOIN sites s ON s.id = sr.site_id
     ),
     referenced_objects AS (
       SELECT
         file_id,
         MAX(size) AS size,
         CASE
           WHEN MAX(CASE WHEN user_id IS NOT NULL THEN 1 ELSE 0 END) = 1 THEN 'registered'
           ELSE 'anonymous'
         END AS owner_kind
       FROM referenced_sources
       GROUP BY file_id
     )
     SELECT
       (SELECT COUNT(*) FROM published_files) AS published_file_count,
       (SELECT COALESCE(SUM(size), 0) FROM published_files) AS published_file_bytes,
       (SELECT COUNT(*) FROM published_files WHERE user_id IS NULL) AS anonymous_published_file_count,
       (SELECT COALESCE(SUM(size), 0) FROM published_files WHERE user_id IS NULL) AS anonymous_published_file_bytes,
       (SELECT COUNT(*) FROM published_files WHERE user_id IS NOT NULL) AS registered_published_file_count,
       (SELECT COALESCE(SUM(size), 0) FROM published_files WHERE user_id IS NOT NULL) AS registered_published_file_bytes,
       (SELECT COUNT(*) FROM sites) AS site_count,
       (SELECT COUNT(*) FROM sites WHERE user_id IS NULL) AS anonymous_site_count,
       (SELECT COUNT(*) FROM sites WHERE user_id IS NOT NULL) AS registered_site_count,
       (SELECT COUNT(*) FROM sites WHERE NOT (status = 'expired' OR (expires_at IS NOT NULL AND expires_at <= ?))) AS active_site_count,
       (SELECT COALESCE(SUM(total_size), 0) FROM sites WHERE NOT (status = 'expired' OR (expires_at IS NOT NULL AND expires_at <= ?))) AS active_site_bytes,
       (SELECT COUNT(*) FROM sites WHERE user_id IS NULL AND NOT (status = 'expired' OR (expires_at IS NOT NULL AND expires_at <= ?))) AS anonymous_active_site_count,
       (SELECT COALESCE(SUM(total_size), 0) FROM sites WHERE user_id IS NULL AND NOT (status = 'expired' OR (expires_at IS NOT NULL AND expires_at <= ?))) AS anonymous_active_site_bytes,
       (SELECT COUNT(*) FROM sites WHERE user_id IS NOT NULL AND NOT (status = 'expired' OR (expires_at IS NOT NULL AND expires_at <= ?))) AS registered_active_site_count,
       (SELECT COALESCE(SUM(total_size), 0) FROM sites WHERE user_id IS NOT NULL AND NOT (status = 'expired' OR (expires_at IS NOT NULL AND expires_at <= ?))) AS registered_active_site_bytes,
       (SELECT COUNT(*) FROM site_releases) AS release_count,
       (SELECT COUNT(*) FROM referenced_objects) AS referenced_object_count,
       (SELECT COALESCE(SUM(size), 0) FROM referenced_objects) AS referenced_object_bytes,
       (SELECT COUNT(*) FROM referenced_objects WHERE owner_kind = 'anonymous') AS anonymous_referenced_object_count,
       (SELECT COALESCE(SUM(size), 0) FROM referenced_objects WHERE owner_kind = 'anonymous') AS anonymous_referenced_object_bytes,
       (SELECT COUNT(*) FROM referenced_objects WHERE owner_kind = 'registered') AS registered_referenced_object_count,
       (SELECT COALESCE(SUM(size), 0) FROM referenced_objects WHERE owner_kind = 'registered') AS registered_referenced_object_bytes`
  ).bind(now, now, now, now, now, now).first();
  const bucket = await collectBucketStorageStats(env, { trackedOwnership });
  return {
    success: true,
    counts: {
      publishedFiles: Number(summaryRow?.published_file_count || 0),
      publishedFilesAnonymous: Number(summaryRow?.anonymous_published_file_count || 0),
      publishedFilesRegistered: Number(summaryRow?.registered_published_file_count || 0),
      sites: Number(summaryRow?.site_count || 0),
      sitesAnonymous: Number(summaryRow?.anonymous_site_count || 0),
      sitesRegistered: Number(summaryRow?.registered_site_count || 0),
      activeSites: Number(summaryRow?.active_site_count || 0),
      activeSitesAnonymous: Number(summaryRow?.anonymous_active_site_count || 0),
      activeSitesRegistered: Number(summaryRow?.registered_active_site_count || 0),
      releases: Number(summaryRow?.release_count || 0),
      referencedObjects: Number(bucket.referencedObjects || 0),
      referencedObjectsAnonymous: Number(bucket.referencedObjectsAnonymous || 0),
      referencedObjectsRegistered: Number(bucket.referencedObjectsRegistered || 0),
      sessionObjects: Number(bucket.sessionObjects || 0),
      sessionObjectsAnonymous: Number(bucket.sessionObjectsAnonymous || 0),
      sessionObjectsRegistered: Number(bucket.sessionObjectsRegistered || 0)
    },
    bytes: {
      publishedFiles: Number(summaryRow?.published_file_bytes || 0),
      publishedFilesAnonymous: Number(summaryRow?.anonymous_published_file_bytes || 0),
      publishedFilesRegistered: Number(summaryRow?.registered_published_file_bytes || 0),
      activeSites: Number(summaryRow?.active_site_bytes || 0),
      activeSitesAnonymous: Number(summaryRow?.anonymous_active_site_bytes || 0),
      activeSitesRegistered: Number(summaryRow?.registered_active_site_bytes || 0),
      referencedObjects: Number(bucket.referencedBytes || 0),
      referencedObjectsAnonymous: Number(bucket.referencedBytesAnonymous || 0),
      referencedObjectsRegistered: Number(bucket.referencedBytesRegistered || 0),
      sessionObjects: Number(bucket.sessionBytes || 0),
      sessionObjectsAnonymous: Number(bucket.sessionBytesAnonymous || 0),
      sessionObjectsRegistered: Number(bucket.sessionBytesRegistered || 0),
      bucketTotal: bucket.totalBytes,
      bucketUserObjects: bucket.userBytes,
      bucketInternalObjects: bucket.internalBytes
    },
    objects: {
      bucketTotal: bucket.totalObjects,
      bucketUserObjects: bucket.userObjects,
      bucketInternalObjects: bucket.internalObjects
    },
    estimates: {
      bucketTotal: estimateMonthlyStorageCost(bucket.totalBytes),
      bucketUserObjects: estimateMonthlyStorageCost(bucket.userBytes)
    }
  };
}

async function listSiteStoredFileIds(siteId, env) {
  await ensureSitesTables(env);
  const result = await env.DB.prepare(
    `SELECT DISTINCT file_id
     FROM (
       SELECT file_id FROM site_files WHERE site_id = ?
       UNION ALL
       SELECT srf.file_id
       FROM site_release_files srf
       INNER JOIN site_releases sr ON sr.id = srf.release_id
       WHERE sr.site_id = ?
     ) refs`
  ).bind(siteId, siteId).all();
  return Array.from(new Set((result.results || []).map((item) => String(item.file_id || '')).filter(Boolean)));
}

async function listRetainedFileIdsForDeletedSite(siteId, fileIds, env) {
  await ensureSitesTables(env);
  await ensurePublishedFilesTable(env);
  const retained = new Set();
  for (const chunk of chunkArray(fileIds, 100)) {
    if (!chunk.length) continue;
    const inClause = placeholders(chunk.length);
    const published = await env.DB.prepare(
      `SELECT id AS file_id
       FROM published_files
       WHERE id IN (${inClause})`
    ).bind(...chunk).all();
    for (const item of published.results || []) retained.add(String(item.file_id || ''));
    const currentSites = await env.DB.prepare(
      `SELECT DISTINCT file_id
       FROM site_files
       WHERE file_id IN (${inClause}) AND site_id <> ?`
    ).bind(...chunk, siteId).all();
    for (const item of currentSites.results || []) retained.add(String(item.file_id || ''));
    const releases = await env.DB.prepare(
      `SELECT DISTINCT srf.file_id
       FROM site_release_files srf
       INNER JOIN site_releases sr ON sr.id = srf.release_id
       WHERE srf.file_id IN (${inClause}) AND sr.site_id <> ?`
    ).bind(...chunk, siteId).all();
    for (const item of releases.results || []) retained.add(String(item.file_id || ''));
  }
  return retained;
}

async function deleteStoredObject(id, env) {
  await env.FILES.delete(id);
  await env.FILES.delete(metaKey(id));
  await ensurePublishedFilesTable(env);
  await env.DB.prepare('DELETE FROM published_files WHERE id = ?').bind(id).run();
}

async function deleteUploadSessionObject(id, env) {
  await deleteStoredObject(id, env);
  await env.FILES.delete(uploadSessionKey(id));
}

async function collectTrackedFileIds(env) {
  await ensureSitesTables(env);
  await ensurePublishedFilesTable(env);
  const result = await env.DB.prepare(
    `SELECT DISTINCT file_id
     FROM (
       SELECT id AS file_id FROM published_files
       UNION ALL
       SELECT file_id FROM site_files
       UNION ALL
       SELECT srf.file_id
       FROM site_release_files srf
       INNER JOIN site_releases sr ON sr.id = srf.release_id
     ) refs
     WHERE file_id IS NOT NULL AND file_id <> ''`
  ).all();
  return new Set((result.results || []).map((item) => String(item.file_id || '')).filter(Boolean));
}

async function auditUntrackedBucketObjects(env, options = {}) {
  const trackedIds = await collectTrackedFileIds(env);
  const sampleLimit = Math.max(1, Math.min(Number(options.sampleLimit || 20), 100));
  const cleanup = Boolean(options.cleanup);
  const staleSessionThresholdMs = Math.max(
    60 * 60 * 1000,
    Number(options.staleSessionThresholdMs || STALE_UPLOAD_SESSION_TTL_MS)
  );
  let cursor;
  let scannedUserObjects = 0;
  let scannedUserBytes = 0;
  let trackedObjects = 0;
  let trackedBytes = 0;
  let sessionBackedObjects = 0;
  let sessionBackedBytes = 0;
  let activeSessionObjects = 0;
  let activeSessionBytes = 0;
  let staleSessionObjects = 0;
  let staleSessionBytes = 0;
  let orphanObjects = 0;
  let orphanBytes = 0;
  let cleanedObjects = 0;
  let cleanedBytes = 0;
  let cleanedStaleSessionObjects = 0;
  let cleanedStaleSessionBytes = 0;
  const samples = [];
  do {
    const listed = await env.FILES.list({ cursor, limit: R2_LIST_PAGE_LIMIT });
    for (const object of listed.objects || []) {
      const key = String(object.key || '');
      if (!key || isInternalBucketKey(key)) continue;
      const size = Number(object.size || 0);
      scannedUserObjects += 1;
      scannedUserBytes += size;
      if (trackedIds.has(key)) {
        trackedObjects += 1;
        trackedBytes += size;
        continue;
      }
      const uploadSession = await readJsonObject(uploadSessionKey(key), env);
      if (uploadSession) {
        sessionBackedObjects += 1;
        sessionBackedBytes += size;
        const createdAt = new Date(uploadSession.createdAt || 0).getTime();
        const isStaleSession = Number.isFinite(createdAt) && createdAt > 0 && (Date.now() - createdAt) >= staleSessionThresholdMs;
        if (isStaleSession) {
          staleSessionObjects += 1;
          staleSessionBytes += size;
          if (cleanup) {
            await deleteUploadSessionObject(key, env);
            cleanedObjects += 1;
            cleanedBytes += size;
            cleanedStaleSessionObjects += 1;
            cleanedStaleSessionBytes += size;
          }
        } else {
          activeSessionObjects += 1;
          activeSessionBytes += size;
        }
        if (samples.length < sampleLimit) {
          samples.push({ key, size, reason: isStaleSession ? 'stale_upload_session_exists' : 'upload_session_exists' });
        }
        continue;
      }
      const sidecar = await readSidecarMeta(key, env);
      orphanObjects += 1;
      orphanBytes += size;
      if (cleanup) {
        await deleteStoredObject(key, env);
        cleanedObjects += 1;
        cleanedBytes += size;
      }
      if (samples.length < sampleLimit) {
        samples.push({ key, size, reason: sidecar ? 'sidecar_without_db_record' : 'binary_without_db_record' });
      }
    }
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
  return {
    success: true,
    scannedUserObjects,
    scannedUserBytes,
    trackedObjects,
    trackedBytes,
    sessionBackedObjects,
    sessionBackedBytes,
    activeSessionObjects,
    activeSessionBytes,
    staleSessionObjects,
    staleSessionBytes,
    orphanObjects,
    orphanBytes,
    cleanedObjects,
    cleanedBytes,
    cleanedStaleSessionObjects,
    cleanedStaleSessionBytes,
    staleSessionThresholdMs,
    samples
  };
}

async function getUserByEmail(email, env) {
  await ensureVipLevelColumn(env);
  return env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(normalizeEmail(email)).first();
}

async function getUserById(id, env) {
  await ensureVipLevelColumn(env);
  return env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
}

async function createOrGetUser(email, env) {
  const normalized = normalizeEmail(email);
  let user = await getUserByEmail(normalized, env);
  if (user) return user;
  const now = new Date().toISOString();
  const id = `usr_${generateId(16)}`;
  await env.DB.prepare(
    'INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)'
  ).bind(id, normalized, now).run();
  return getUserById(id, env);
}

async function sendMagicLink(email, request, env, nextPath = '') {
  if (!env.RESEND_API_KEY) throw new Error('Missing RESEND_API_KEY');
  if (!env.RESEND_FROM_EMAIL) throw new Error('Missing RESEND_FROM_EMAIL');
  const user = await createOrGetUser(email, env);
  const rawToken = randomToken(32);
  const tokenHash = await sha256Hex(rawToken);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + MAGIC_LINK_TTL_MS).toISOString();
  await env.DB.prepare(
    'INSERT INTO magic_links (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)'
  ).bind(`ml_${generateId(16)}`, user.id, tokenHash, expiresAt, now.toISOString()).run();

  const verifyUrl = `${new URL(request.url).origin}/auth/verify?token=${encodeURIComponent(rawToken)}${nextPath ? `&next=${encodeURIComponent(nextPath)}` : ''}`;
  const payload = {
    from: env.RESEND_FROM_EMAIL,
    to: [normalizeEmail(email)],
    subject: 'OkFile Admin Login Link',
    html: `<div style="font-family:Arial,sans-serif;line-height:1.7;color:#111">
      <h2>Sign in to the OkFile Admin Console</h2>
      <p>Click the link below to verify your email and sign in:</p>
      <p><a href="${verifyUrl}" style="display:inline-block;padding:12px 18px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px">Verify and Sign In</a></p>
      <p>If the button does not work, copy this link into your browser:</p>
      <p>${verifyUrl}</p>
      <p>This link is valid for 15 minutes.</p>
    </div>`
  };

  const resendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  if (!resendRes.ok) {
    const errorText = await resendRes.text();
    throw new Error(`Failed to send email: ${errorText}`);
  }
  return user;
}

async function consumeMagicLink(rawToken, env) {
  const tokenHash = await sha256Hex(rawToken);
  const link = await env.DB.prepare(
    `SELECT magic_links.*, users.email
     FROM magic_links
     JOIN users ON users.id = magic_links.user_id
     WHERE magic_links.token_hash = ?`
  ).bind(tokenHash).first();
  if (!link) return { error: 'The verification link does not exist or has expired' };
  if (link.used_at) return { error: 'The verification link has already been used' };
  if (new Date(link.expires_at).getTime() < Date.now()) return { error: 'The verification link has expired' };

  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare('UPDATE magic_links SET used_at = ? WHERE id = ?').bind(now, link.id),
    env.DB.prepare('UPDATE users SET verified_at = COALESCE(verified_at, ?), last_login_at = ? WHERE id = ?').bind(now, now, link.user_id)
  ]);
  return { userId: link.user_id, email: link.email };
}

async function createSession(userId, env) {
  const rawToken = randomToken(32);
  const sessionHash = await sha256Hex(rawToken);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS).toISOString();
  await env.DB.prepare(
    'INSERT INTO sessions (id, user_id, session_hash, expires_at, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(`sess_${generateId(16)}`, userId, sessionHash, expiresAt, now.toISOString(), now.toISOString()).run();
  return rawToken;
}

async function getSessionFromRequest(request, env) {
  await ensureVipLevelColumn(env);
  const token = parseCookies(request)[SESSION_COOKIE];
  if (!token) return null;
  const sessionHash = await sha256Hex(token);
  const record = await env.DB.prepare(
    `SELECT sessions.id AS session_id, sessions.expires_at, users.*
     FROM sessions
     JOIN users ON users.id = sessions.user_id
     WHERE sessions.session_hash = ?`
  ).bind(sessionHash).first();
  if (!record) return null;
  if (new Date(record.expires_at).getTime() < Date.now()) return null;
  await env.DB.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?').bind(new Date().toISOString(), record.session_id).run();
  return {
    sessionId: record.session_id,
    userId: record.id,
    email: record.email,
    vipLevel: normalizeVipLevel(record.vip_level),
    isAdmin: adminEmailSet(env).has(normalizeEmail(record.email))
  };
}

async function logoutSession(request, env) {
  const token = parseCookies(request)[SESSION_COOKIE];
  if (!token) return;
  const sessionHash = await sha256Hex(token);
  await env.DB.prepare('DELETE FROM sessions WHERE session_hash = ?').bind(sessionHash).run();
}

function accountShell(title, body, script = '') {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<meta name="robots" content="noindex,nofollow">
<meta name="theme-color" content="#f5f7fb">
<link rel="icon" href="/favicon.ico" type="image/svg+xml">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html{background:#f5f7fb}
body{font-family:Inter,ui-sans-serif,system-ui,-apple-system,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;background:linear-gradient(180deg,#f7f9fc 0%,#eef3f9 100%);color:#1f2937;min-height:100vh}
.wrap{max-width:none;margin:0}
.topbar{display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;gap:12px;flex-wrap:wrap}
.brand{font-size:24px;font-weight:700;color:#111827;text-decoration:none}
.brand span{color:#f48120}
.nav{display:flex;gap:10px;flex-wrap:wrap}
.nav a,.nav button{padding:10px 16px;border-radius:12px;border:1px solid #d7dee8;background:#fff;color:#334155;text-decoration:none;cursor:pointer;transition:.18s;box-shadow:0 1px 2px rgba(15,23,42,.04)}
.nav a:hover,.nav button:hover{border-color:#b8c7db;background:#f8fafc;color:#0f172a}
.card{background:#fff;border:1px solid #dce4ee;border-radius:18px;padding:24px;margin-bottom:18px;box-shadow:0 12px 30px rgba(15,23,42,.06)}
.card h1,.card h2{font-size:22px;color:#0f172a;margin-bottom:8px}
.muted{color:#64748b;font-size:14px;line-height:1.6}
.hidden{display:none}
.cf-shell{display:grid;grid-template-columns:280px minmax(0,1fr);min-height:100vh;background:linear-gradient(180deg,#f7f9fc 0%,#eef3f9 100%)}
.cf-sidebar{display:flex;flex-direction:column;gap:20px;padding:18px 16px;border-right:1px solid #dde6f0;background:#fbfcfe;position:sticky;top:0;height:100vh;overflow:auto}
.cf-sidebar-header{display:grid;gap:14px}
.cf-sidebar-brand{display:inline-flex;align-items:center;gap:10px;text-decoration:none}
.cf-logo{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:10px;background:linear-gradient(135deg,#f48120,#ffb347);color:#fff;font-weight:800;box-shadow:0 8px 18px rgba(244,129,32,.2)}
.cf-brand-copy strong{display:block;color:#0f172a;font-size:16px}
.cf-brand-copy span{display:block;color:#64748b;font-size:12px;margin-top:2px}
.cf-account-card{padding:14px 14px 12px;border-radius:14px;background:#fff;border:1px solid #dce4ee}
.cf-account-label{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8}
.cf-account-value{margin-top:6px;color:#0f172a;font-size:14px;font-weight:600;word-break:break-word}
.cf-nav-group{display:grid;gap:8px}
.cf-nav-title{padding:0 10px;font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8}
.cf-nav-link{display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border-radius:12px;text-decoration:none;color:#334155;border:1px solid transparent;transition:.18s}
.cf-nav-link:hover{background:#f8fafc;border-color:#d7dee8;color:#0f172a}
.cf-nav-link.active{background:#fff7ed;border-color:#fed7aa;color:#9a3412}
.cf-nav-link strong{display:block;font-size:14px;font-weight:600}
.cf-nav-link span{display:block;font-size:12px;color:#64748b;line-height:1.45;margin-top:2px}
.cf-main{min-width:0;display:flex;flex-direction:column}
.cf-topbar{position:sticky;top:0;z-index:10;display:flex;justify-content:space-between;align-items:center;gap:12px;padding:14px 20px;border-bottom:1px solid #dde6f0;background:rgba(247,249,252,.92);backdrop-filter:blur(12px)}
.cf-topbar-title{display:grid;gap:4px}
.cf-breadcrumb{display:flex;align-items:center;gap:8px;flex-wrap:wrap;color:#94a3b8;font-size:12px}
.cf-breadcrumb span{color:#cbd5e1}
.cf-topbar-title .eyebrow{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#f48120}
.cf-topbar-title strong{color:#0f172a;font-size:18px}
.cf-topbar-title span{color:#64748b;font-size:13px}
.cf-topbar-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.cf-account-chip{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:999px;background:#fff;border:1px solid #d7dee8;color:#334155;font-size:12px;font-weight:600}
.cf-content{padding:18px 20px}
.field{margin-top:14px}
.field label{display:block;font-size:13px;color:#334155;margin-bottom:8px}
.field input,.field select{width:100%;padding:12px 14px;border-radius:12px;border:1px solid #cfd8e3;background:#fff;color:#0f172a}
.field input:focus,.field select:focus{outline:none;border-color:#6b8ecf;box-shadow:0 0 0 3px rgba(59,130,246,.14)}
.btn-primary{margin-top:12px;padding:10px 14px;border-radius:12px;border:1px solid #1d4ed8;background:#1d4ed8;color:#fff;cursor:pointer;font-weight:600;box-shadow:0 8px 18px rgba(29,78,216,.16)}
.btn-primary:hover{background:#1e40af;border-color:#1e40af}
.btn-primary:disabled{opacity:.6;cursor:not-allowed}
.btn-secondary,.btn-danger{display:inline-flex;align-items:center;justify-content:center;padding:8px 12px;border-radius:12px;border:1px solid #d7dee8;background:#fff;color:#334155;cursor:pointer;text-decoration:none;font-size:12px;font-weight:600;transition:.18s}
.btn-secondary:hover{border-color:#bccadd;background:#f8fafc;color:#0f172a}
.btn-danger{border-color:#fecaca;color:#b91c1c;background:#fff5f5}
.btn-danger:hover{border-color:#fca5a5;color:#991b1b;background:#fee2e2}
.msg{margin-top:14px;font-size:14px;color:#15803d}
.err{margin-top:14px;font-size:14px;color:#b91c1c}
.note{margin-top:10px;padding:10px 12px;border-radius:12px;background:#f8fbff;border:1px solid #d7e6fb;color:#1d4ed8;font-size:12px}
.mono{font-family:Consolas,'SF Mono',monospace;word-break:break-all}
.inline-link{color:#1d4ed8;text-decoration:none}
.inline-link:hover{text-decoration:underline}
table{width:100%;border-collapse:collapse}
th,td{border-bottom:1px solid #e7edf4;padding:11px 10px;text-align:left;font-size:13px;vertical-align:top}
th{padding:9px 10px;color:#64748b;font-size:11px;font-weight:600;letter-spacing:.02em;background:#fbfcfe}
td input,td select{width:100%;padding:8px 10px;border-radius:8px;border:1px solid #cfd8e3;background:#fff;color:#0f172a}
.action-row{display:flex;gap:8px;flex-wrap:wrap}
.site-actions{position:relative;display:flex;justify-content:flex-end}
.site-actions-toggle{margin:0;padding:0;width:30px;height:30px;border-radius:9px;border:1px solid #d7dee8;background:#fff;color:#334155;cursor:pointer;font-size:16px;font-weight:700;line-height:1;transition:.18s}
.site-actions-toggle:hover{border-color:#bccadd;background:#f8fafc;color:#0f172a}
.site-actions-toggle:focus-visible{outline:none;border-color:#6b8ecf;box-shadow:0 0 0 3px rgba(59,130,246,.14)}
.site-actions.open .site-actions-toggle{border-color:#bccadd;background:#f8fafc;color:#0f172a}
.site-actions-menu{position:absolute;top:calc(100% + 6px);right:0;z-index:40;display:none;min-width:200px;padding:6px 0;border-radius:13px;border:1px solid #d7dee8;background:#fff;box-shadow:0 16px 32px rgba(15,23,42,.12)}
.site-actions.open .site-actions-menu{display:block}
.site-actions-item{display:flex;align-items:center;width:100%;padding:9px 12px;border:none;background:transparent;color:#334155;text-decoration:none;text-align:left;font-size:12px;font-weight:600;cursor:pointer}
.site-actions-item:hover{background:#f8fafc;color:#0f172a}
.site-actions-item.danger{color:#b91c1c}
.site-actions-item.danger:hover{background:#fff5f5;color:#991b1b}
.site-actions-divider{margin:6px 0;border-top:1px solid #eef2f7}
.inline-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.inline-row input,.inline-row select{width:auto;min-width:120px}
.pager{display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin-top:12px}
.pager-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.site-detail{margin-top:16px;padding:16px;border-radius:14px;background:#f8fafc;border:1px solid #e2e8f0}
.site-detail h3{font-size:18px;margin-bottom:8px}
.site-detail-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin:12px 0}
.site-detail-grid .item{padding:12px 14px;border-radius:14px;background:#fff;border:1px solid #e2e8f0}
.site-detail-grid .item .k{font-size:12px;color:#64748b}
.site-detail-grid .item .v{font-size:13px;color:#0f172a;margin-top:4px;word-break:break-word}
.file-path{font-family:Consolas,'SF Mono',monospace;font-size:12px;word-break:break-all}
.stack{display:grid;gap:14px}
.hero-card{padding:22px;border-radius:20px;background:linear-gradient(135deg,#ffffff,#f8fbff);border:1px solid #dce4ee}
.hero-top{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;flex-wrap:wrap}
.hero-copy h1{font-size:30px;line-height:1.2;margin-bottom:10px}
.hero-copy p{max-width:780px}
.meta-line{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}
.meta-pill{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:999px;background:#f8fafc;border:1px solid #dce4ee;color:#334155;font-size:12px}
.stats-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin:18px 0}
.stat-card{padding:14px 16px;border-radius:16px;background:#fff;border:1px solid #dce4ee}
.stat-label{font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.05em}
.stat-value{margin-top:8px;font-size:28px;font-weight:700;color:#0f172a}
.section-card{padding:0;overflow:hidden}
.section-card.site-management-card{overflow:visible}
.section-card.site-management-card .section-body{overflow:visible}
.section-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:22px 24px 0 24px;flex-wrap:wrap}
.section-head h2{margin-bottom:6px}
.section-head p{max-width:780px}
.section-body{padding:18px 20px 20px}
.table-wrap{overflow-x:auto;border-top:1px solid #e7edf4}
.table-toolbar{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:14px 20px;border-top:1px solid #e7edf4;flex-wrap:wrap}
.toolbar-copy{max-width:760px}
.status-pill{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:600;border:1px solid transparent}
.status-pill.active{background:#ecfdf3;color:#166534;border-color:#bbf7d0}
.status-pill.disabled{background:#f8fafc;color:#475569;border-color:#e2e8f0}
.cell-stack{display:grid;gap:6px}
.token-name{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.token-name strong{font-size:14px;color:#0f172a}
.subtle{font-size:12px;color:#64748b;line-height:1.55}
.actions-cell{display:flex;gap:8px;flex-wrap:wrap;min-width:160px}
.empty-state{padding:28px 24px;color:#64748b}
.empty-state strong{display:block;color:#0f172a;font-size:16px;margin-bottom:8px}
.overview-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px}
.overview-link{display:grid;gap:6px;padding:14px;border-radius:14px;background:#fff;border:1px solid #dce4ee;text-decoration:none;color:#334155;transition:.18s;box-shadow:0 4px 12px rgba(15,23,42,.04)}
.overview-link:hover{border-color:#c7d6ea;background:#fdfefe}
.overview-link strong{font-size:14px;color:#0f172a}
.overview-link span{font-size:12px;color:#64748b;line-height:1.45}
@media (max-width: 860px){
  .cf-shell{grid-template-columns:1fr}
  .cf-sidebar{position:static;height:auto;border-right:none;border-bottom:1px solid #dde6f0}
  .cf-topbar{padding:12px 16px}
  .cf-content{padding:14px 16px}
  .hero-copy h1{font-size:26px}
}
</style>
</head>
<body>
<div class="wrap">
${body}
</div>
<script>
${script}
</script>
</body>
</html>`;
}

const ADMIN_PAGE_CONFIGS = {
  overview: {
    key: 'overview',
    title: 'Overview',
    subtitle: 'Admin summary and control-plane context',
    eyebrow: 'Admin',
    path: '/',
  },
  storage: {
    key: 'storage',
    title: 'Storage Overview',
    subtitle: 'Bucket usage, object counts, and storage cost estimates',
    eyebrow: 'Storage',
    path: '/storage',
  },
  users: {
    key: 'users',
    title: 'Users',
    subtitle: 'Registered accounts, key usage, and site ownership',
    eyebrow: 'Users',
    path: '/users',
  },
  files: {
    key: 'files',
    title: 'Files',
    subtitle: 'Inspect uploaded file records, owners, size, and direct access links',
    eyebrow: 'Files',
    path: '/files',
  },
  config: {
    key: 'config',
    title: 'Config',
    subtitle: 'Global settings for public-facing behavior and future admin options',
    eyebrow: 'Configuration',
    path: '/config',
  },
  sites: {
    key: 'sites',
    title: 'Site Management',
    subtitle: 'Search, inspect, update, and delete published sites',
    eyebrow: 'Sites',
    path: '/sites',
  },
  'api-keys': {
    key: 'api-keys',
    title: 'API Key Management',
    subtitle: 'Adjust account API Key status, prepare limits, and upload quota',
    eyebrow: 'API Keys',
    path: '/api-keys',
  },
  cleanup: {
    key: 'cleanup',
    title: 'Expired File Cleanup',
    subtitle: 'Run bounded cleanup batches for expired file objects',
    eyebrow: 'Maintenance',
    path: '/cleanup',
  },
};

function getAdminPageConfig(pageKey, pageContext = {}) {
  if (pageKey === 'user-detail') {
    return {
      key: 'user-detail',
      title: 'User Details',
      subtitle: `Account profile, API Keys, uploaded files, and published sites for ${pageContext.userId || 'the selected user'}`,
      eyebrow: 'Users',
      path: '/users',
    };
  }
  return ADMIN_PAGE_CONFIGS[pageKey] || ADMIN_PAGE_CONFIGS.overview;
}

function adminNavLink(page, key, title, desc) {
  const target = getAdminPageConfig(key);
  const activeClass = page.key === key || (page.key === 'user-detail' && key === 'users') ? ' active' : '';
  return `<a class="cf-nav-link${activeClass}" href="${target.path}"><div><strong>${escapeHtml(title)}</strong><span>${escapeHtml(desc)}</span></div></a>`;
}

function adminBreadcrumb(page, pageContext = {}) {
  if (page.key === 'user-detail') {
    return `<a href="/users">Users</a><span>/</span>${escapeHtml(pageContext.userId || 'User Details')}`;
  }
  return '';
}

function adminContentForPage(page, pageContext = {}) {
  if (page.key === 'overview') {
    return `<div class="card section-card">
      <div class="section-body">
        <div class="meta-line" style="margin-top:0">
          <span class="meta-pill">Signed in as <span id="currentUser" class="mono"></span></span>
          <span class="meta-pill">Independent console at <code>admin.okfile.com</code></span>
        </div>
      </div>
    </div>
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Rows</div>
        <div class="stat-value" id="adminStatRows">0</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Keys</div>
        <div class="stat-value" id="adminStatKeys">0</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Active</div>
        <div class="stat-value" id="adminStatActive">0</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Disabled</div>
        <div class="stat-value" id="adminStatDisabled">0</div>
      </div>
    </div>
    <div class="overview-grid">
      <a class="overview-link" href="/storage">
        <strong>Storage</strong>
        <span>Bucket usage, object counts, and monthly cost estimates.</span>
      </a>
      <a class="overview-link" href="/users">
        <strong>Users</strong>
        <span>Registered accounts, API Key usage, and site ownership.</span>
      </a>
      <a class="overview-link" href="/files">
        <strong>Files</strong>
        <span>Uploaded file records, owner lookup, size, and direct links.</span>
      </a>
      <a class="overview-link" href="/sites">
        <strong>Sites</strong>
        <span>Published sites, release history, expiry, and deletion tools.</span>
      </a>
      <a class="overview-link" href="/api-keys">
        <strong>API Keys</strong>
        <span>Quota limits, status, and inline save operations.</span>
      </a>
      <a class="overview-link" href="/config">
        <strong>Config</strong>
        <span>Global settings such as publish origin and future defaults.</span>
      </a>
      <a class="overview-link" href="/cleanup">
        <strong>Cleanup</strong>
        <span>Run bounded expired-file cleanup jobs.</span>
      </a>
    </div>`;
  }

  if (page.key === 'storage') {
    return `<div class="card section-card">
      <div class="section-body">
        <div class="inline-row" style="justify-content:flex-end;margin-top:0;margin-bottom:14px">
          <button class="btn-secondary" id="refreshStorageStatsBtn" type="button">Refresh Stats</button>
        </div>
        <div id="storageStatsWrap" class="muted">Loading storage statistics...</div>
      </div>
    </div>`;
  }

  if (page.key === 'users') {
    return `<div class="card section-card">
      <div class="table-wrap" id="usersTableWrap"><div class="empty-state"><strong>Loading users...</strong><div>Please wait while OkFile loads account records.</div></div></div>
    </div>`;
  }

  if (page.key === 'files') {
    return `<div class="card section-card">
      <div class="section-body">
        <div class="inline-row" style="margin-top:14px">
          <select id="fileScope">
            <option value="published" selected>Published Files</option>
            <option value="user-facing">User-Facing R2 Objects</option>
          </select>
          <input id="fileQuery" type="text" placeholder="Search file name, file ID, owner email, or API Key name">
          <select id="fileSort">
            <option value="created_desc" selected>Newest first</option>
            <option value="size_desc">Largest first</option>
            <option value="size_asc">Smallest first</option>
          </select>
          <select id="filePageSize">
            <option value="10">10 / page</option>
            <option value="20" selected>20 / page</option>
            <option value="50">50 / page</option>
          </select>
          <button class="btn-primary" id="fileSearchBtn" style="margin-top:0">Search</button>
          <button class="btn-secondary" id="fileResetBtn" type="button">Reset</button>
        </div>
        <div class="table-wrap" id="fileTableWrap"><div class="empty-state"><strong>Loading files...</strong><div>Please wait while OkFile loads published file records.</div></div></div>
      </div>
    </div>`;
  }

  if (page.key === 'config') {
    return `<div class="card section-card">
      <div class="section-body">
        <div class="note">Controls the public origin used by generated file links.</div>
        <div class="field" style="margin-top:0">
          <label for="publishOrigin">Publish Domain or Full Origin</label>
          <input id="publishOrigin" type="text" placeholder="Example: ok26.org or https://ok26.org">
        </div>
        <button class="btn-primary" id="savePublishOriginBtn">Save Publish Origin</button>
        <div class="note" id="publishOriginPreview">Using the default upload API origin.</div>
      </div>
    </div>`;
  }

  if (page.key === 'sites') {
    return `<div class="card section-card site-management-card">
      <div class="section-body">
        <div class="note" id="siteManageHint">Site subdomains follow the current publish origin.</div>
        <div class="inline-row" style="margin-top:14px">
          <input id="siteQuery" type="text" placeholder="Search site name, subdomain, email, or site ID">
          <select id="siteStatusFilter">
            <option value="all">All statuses</option>
            <option value="active">Active only</option>
            <option value="expired">Expired only</option>
          </select>
          <select id="sitePageSize">
            <option value="10">10 / page</option>
            <option value="20" selected>20 / page</option>
            <option value="50">50 / page</option>
          </select>
          <button class="btn-primary" id="siteSearchBtn" style="margin-top:0">Search</button>
          <button class="btn-secondary" id="siteResetBtn" type="button">Reset</button>
        </div>
        <div id="siteTableWrap" class="muted">Loading sites...</div>
        <div id="siteDetailWrap" class="hidden"></div>
      </div>
    </div>`;
  }

  if (page.key === 'api-keys') {
    return `<div class="card section-card">
      <div class="table-wrap" id="adminTableWrap"><div class="empty-state"><strong>Loading API Key records...</strong><div>Please wait while OkFile loads admin API Key data.</div></div></div>
    </div>`;
  }

  if (page.key === 'user-detail') {
    return `<div class="card section-card">
      <div class="section-body">
        <div class="note">User ID: <code>${escapeHtml(pageContext.userId || '-')}</code></div>
        <div id="userDetailWrap" class="muted" style="margin-top:16px">Loading user details...</div>
      </div>
    </div>`;
  }

  return `<div class="card section-card">
    <div class="section-body">
      <div class="inline-row">
        <label class="muted" for="cleanupLimit">Items to check</label>
        <input id="cleanupLimit" type="number" min="1" max="1000" value="${EXPIRED_CLEANUP_BATCH_LIMIT}" style="width:140px">
        <button class="btn-primary" id="cleanupBtn">Clean Up Expired Files Now</button>
      </div>
      <div class="note" id="cleanupResult">No expired-file cleanup run yet.</div>
      <div class="inline-row" style="margin-top:14px">
        <label class="muted" for="untrackedSampleLimit">Sample size</label>
        <input id="untrackedSampleLimit" type="number" min="1" max="100" value="20" style="width:120px">
        <label class="muted" for="staleUploadHours">Stale upload hours</label>
        <input id="staleUploadHours" type="number" min="1" max="720" value="${STALE_UPLOAD_SESSION_TTL_HOURS}" style="width:120px">
        <button class="btn-secondary" id="auditUntrackedBtn" type="button">Audit Untracked Objects</button>
        <button class="btn-primary" id="cleanupUntrackedBtn" type="button">Clean Untracked Objects</button>
      </div>
      <div class="note" id="untrackedCleanupResult">No untracked-object audit run yet.</div>
      <div class="inline-row" style="margin-top:14px">
        <label class="muted" for="sizeBackfillLimit">Backfill batch</label>
        <input id="sizeBackfillLimit" type="number" min="1" max="500" value="100" style="width:120px">
        <button class="btn-primary" id="sizeBackfillBtn" type="button">Backfill Zero Sizes</button>
      </div>
      <div class="note" id="sizeBackfillResult">No published-file size backfill run yet.</div>
    </div>
  </div>`;
}

function adminLoginPage(nextPath = '/', state = {}) {
  const warning = state.signedInEmail
    ? `<div class="note" style="margin-bottom:18px">The signed-in email <code>${escapeHtml(state.signedInEmail)}</code> is not included in <code>ADMIN_EMAILS</code>. Request a new magic link for an admin email or sign out first.</div>
       <div class="inline-row" style="margin-bottom:18px"><button class="btn-secondary" id="logoutBtn" type="button">Sign Out</button></div>`
    : '';
  return accountShell(
    'OkFile Admin Sign In',
    `<div class="topbar">
      <a class="brand" href="${PUBLIC_SITE_EXAMPLE_ORIGIN}/">OkFile</a>
      <div class="nav">
        <a href="${PUBLIC_SITE_EXAMPLE_ORIGIN}/en/">Home</a>
        <a href="${PUBLIC_SITE_EXAMPLE_ORIGIN}/en/account/">Account</a>
        <a href="${PUBLIC_SITE_EXAMPLE_ORIGIN}/en/upload/">Manual Upload</a>
      </div>
    </div>
    <div style="max-width:720px;margin:56px auto;padding:0 20px 48px">
      <div class="card" style="max-width:580px;margin:0 auto">
        <h1>Admin Sign In</h1>
        <p class="muted">Request a magic link for an email address that is listed in <code>ADMIN_EMAILS</code>. After verification, OkFile returns you to the admin page you were trying to open.</p>
        ${warning}
        <div class="field">
          <label for="email">Email Address</label>
          <input id="email" type="email" placeholder="you@example.com">
        </div>
        <button class="btn-primary" id="sendLinkBtn">Send Sign-In Link</button>
        <div class="msg hidden" id="authMsg"></div>
        <div class="err hidden" id="authErr"></div>
      </div>
    </div>`,
    `const NEXT_PATH=${JSON.stringify(nextPath)};
const $=(id)=>document.getElementById(id);
function show(el,msg){ if(!el) return; el.textContent=msg; el.classList.remove('hidden'); }
function hide(el){ if(!el) return; el.textContent=''; el.classList.add('hidden'); }
async function api(path,init){
  const res=await fetch(path,{credentials:'same-origin',...init});
  const data=await res.json().catch(()=>null);
  if(!res.ok) throw new Error(data?.error||('HTTP '+res.status));
  return data;
}
if($('sendLinkBtn')) $('sendLinkBtn').onclick = async () => {
  hide($('authMsg')); hide($('authErr'));
  try{
    await api('/api/auth/request-link',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({email:$('email').value,next:NEXT_PATH})
    });
    show($('authMsg'),'Verification link sent. Check your email.');
  }catch(error){
    show($('authErr'),error.message);
  }
};
if($('logoutBtn')) $('logoutBtn').onclick = async () => {
  await fetch('/api/auth/logout',{method:'POST',credentials:'same-origin'});
  location.href = '/login';
};`
  );
}

function adminHomePage(pageKey = 'overview', pageContext = {}, session = null) {
  const page = getAdminPageConfig(pageKey, pageContext);
  const breadcrumb = adminBreadcrumb(page, pageContext);
  const initialEmail = session?.email || 'Guest';
  return accountShell(
    'OkFile Admin Console',
    `<div class="cf-shell">
      <aside class="cf-sidebar">
        <div class="cf-sidebar-header">
          <a class="cf-sidebar-brand" href="${PUBLIC_SITE_EXAMPLE_ORIGIN}/" id="publicHomeLink">
            <span class="cf-logo">O</span>
            <span class="cf-brand-copy">
              <strong>OkFile</strong>
              <span id="sidebarWorkspaceLabel">${escapeHtml(initialEmail)}</span>
            </span>
          </a>
        </div>
        <nav class="cf-nav-group">
          <div class="cf-nav-title">Overview</div>
          ${adminNavLink(page, 'overview', 'Overview', 'Admin summary and control-plane context')}
        </nav>
        <nav class="cf-nav-group">
          <div class="cf-nav-title">Traffic & Accounts</div>
          ${adminNavLink(page, 'storage', 'Storage', 'Bucket usage, object counts, and cost estimates')}
          ${adminNavLink(page, 'users', 'Users', 'Registered accounts, key usage, and site ownership')}
        </nav>
        <nav class="cf-nav-group">
          <div class="cf-nav-title">Content</div>
          ${adminNavLink(page, 'files', 'Files', 'Inspect uploaded file records and jump to user details')}
          ${adminNavLink(page, 'sites', 'Sites', 'Search, inspect, update, and delete published sites')}
          ${adminNavLink(page, 'api-keys', 'API Keys', 'Adjust status, prepare limits, and upload quota')}
        </nav>
        <nav class="cf-nav-group">
          <div class="cf-nav-title">Configuration</div>
          ${adminNavLink(page, 'config', 'Config', 'Global settings for public-facing behavior and future admin options')}
        </nav>
        <nav class="cf-nav-group">
          <div class="cf-nav-title">Maintenance</div>
          ${adminNavLink(page, 'cleanup', 'Cleanup', 'Run bounded expired-file cleanup batches')}
        </nav>
        <nav class="cf-nav-group">
          <div class="cf-nav-title">Resources</div>
          <a class="cf-nav-link" href="${PUBLIC_SITE_EXAMPLE_ORIGIN}/en/account/" id="publicAccountLink"><div><strong>Main Site Account</strong><span>Open the public account and key page</span></div></a>
        </nav>
      </aside>
      <main class="cf-main">
        <div class="cf-topbar">
          <div class="cf-topbar-title">
            ${breadcrumb ? `<div class="cf-breadcrumb">${breadcrumb}</div>` : ''}
            <strong>${escapeHtml(page.title)}</strong>
          </div>
          <div class="cf-topbar-actions">
            <span class="cf-account-chip" id="topAccountChip">${escapeHtml(initialEmail)}</span>
            <button id="logoutBtn" class="btn-secondary">Sign Out</button>
          </div>
        </div>
        <div class="cf-content">
          <div class="stack" id="dashboardCard">
            <div>
              <div class="msg hidden" id="adminMsg"></div>
              <div class="err hidden" id="adminErr"></div>
            </div>
            ${adminContentForPage(page, pageContext)}
          </div>
        </div>
      </main>
    </div>`,
    `const PAGE_KEY=${JSON.stringify(page.key)};
const PAGE_CONTEXT=${JSON.stringify(pageContext)};
const LOGIN_PATH='/login';
const $=(id)=>document.getElementById(id);
const dashboardCard=$('dashboardCard');
const logoutBtn=$('logoutBtn');
const topAccountChip=$('topAccountChip');
const sidebarWorkspaceLabel=$('sidebarWorkspaceLabel');
const siteState={page:1,pageSize:20,q:'',status:'all',selectedSiteId:'',detailPage:1,detailPageSize:20,detailQ:''};
const fileState={page:1,pageSize:20,q:'',scope:'published',sort:'created_desc'};
function esc(value){
  return String(value == null ? '' : value)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}
function effectivePublicOrigin(data){
  return data && data.configuredOrigin ? data.configuredOrigin : '';
}
function syncPublicNav(origin){
  const base = origin || '${PUBLIC_SITE_EXAMPLE_ORIGIN}';
  $('publicHomeLink').href = base + '/';
  $('publicAccountLink').href = base + '/en/account/';
}
function formatReleaseSummary(summary){
  if(!summary) return 'Initial release or change summary unavailable';
  const parts = [];
  if(Number.isFinite(summary.added)) parts.push('Added ' + summary.added);
  if(Number.isFinite(summary.modified)) parts.push('Modified ' + summary.modified);
  if(Number.isFinite(summary.removed)) parts.push('Removed ' + summary.removed);
  if(Number.isFinite(summary.unchanged)) parts.push('Unchanged ' + summary.unchanged);
  return parts.length ? parts.join(' / ') : 'Initial release or change summary unavailable';
}
function show(el,msg){el.textContent=msg;el.classList.remove('hidden')}
function hide(el){el.textContent='';el.classList.add('hidden')}
function setSidebarWorkspaceLabel(value){
  if(!sidebarWorkspaceLabel) return;
  sidebarWorkspaceLabel.textContent = value || 'Guest';
}
function formatTime(value){
  if(!value) return '-';
  const d=new Date(value);
  if(Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('en-US',{hour12:false});
}
function formatCompactTime(value){
  if(!value) return '-';
  const d = new Date(value);
  if(Number.isNaN(d.getTime())) return value;
  const pad = (n)=>String(n).padStart(2,'0');
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}
function formatSiteListTime(value){
  if(!value) return '-';
  const d = new Date(value);
  if(Number.isNaN(d.getTime())) return value;
  const now = new Date();
  const pad = (n)=>String(n).padStart(2,'0');
  const datePart = (d.getFullYear() === now.getFullYear() ? '' : (d.getFullYear() + '-'))
    + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  return datePart + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
}
function displayOrigin(value){
  const normalized = normalizePublishOrigin(value);
  if (typeof normalized === 'string') {
    try {
      return new URL(normalized).hostname || normalized;
    } catch {}
  }
  return String(value || '').replace(/^https?:\\/\\//i, '') || '-';
}
function formatSize(size){
  if(!Number.isFinite(size) || size < 0) return 'Unknown';
  if(size >= 1024 * 1024 * 1024 * 1024) return (size / 1024 / 1024 / 1024 / 1024).toFixed(2) + ' TB';
  if(size >= 1024 * 1024 * 1024) return (size / 1024 / 1024 / 1024).toFixed(2) + ' GB';
  if(size >= 1024 * 1024) return (size / 1024 / 1024).toFixed(1) + ' MB';
  if(size >= 1024) return Math.round(size / 1024) + ' KB';
  return String(size) + ' B';
}
function formatNumber(value){
  return new Intl.NumberFormat('en-US').format(Number(value||0));
}
function formatUsd(value){
  const amount = Number(value || 0);
  return '$' + amount.toFixed(amount >= 10 ? 2 : 4);
}
function siteStatus(item){
  if(item.expiresAt && new Date(item.expiresAt).getTime() <= Date.now()) return 'expired';
  return item.status || 'active';
}
function toDatetimeLocalValue(value){
  if(!value) return '';
  const d = new Date(value);
  if(Number.isNaN(d.getTime())) return '';
  const pad = (n)=>String(n).padStart(2,'0');
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}
function buildQuery(params){
  const qs = new URLSearchParams();
  Object.keys(params).forEach((key)=>{
    const value = params[key];
    if(value === undefined || value === null || value === '') return;
    qs.set(key,String(value));
  });
  const text = qs.toString();
  return text ? '?' + text : '';
}
function normalizeFileSortValue(value){
  return value === 'size_desc' || value === 'size_asc' || value === 'created_desc'
    ? value
    : 'created_desc';
}
function userHref(userId){
  return '/users/' + encodeURIComponent(String(userId || ''));
}
function userLink(label, userId, extraClass){
  const text = esc(label || userId || 'Anonymous');
  if(!userId) return text;
  return '<a class="inline-link' + (extraClass ? ' ' + extraClass : '') + '" href="' + userHref(userId) + '">' + text + '</a>';
}
function renderUserCell(email, userId, extraLine){
  return '<div class="cell-stack"><strong>' + userLink(email || 'Anonymous', userId) + '</strong>' +
    (userId ? '<div class="subtle mono">' + userLink(userId, userId, 'mono') + '</div>' : '') +
    (extraLine ? '<div class="subtle">' + esc(extraLine) + '</div>' : '') +
  '</div>';
}
function renderCompactUserCell(email, userId){
  return '<strong>' + userLink(email || 'Anonymous', userId) + '</strong>';
}
async function api(path,init){
  const res=await fetch(path,{credentials:'same-origin',...init});
  const data=await res.json().catch(()=>null);
  if(!res.ok) throw new Error(data?.error||('HTTP '+res.status));
  return data;
}
async function openSiteUpdate(siteId){
  hide($('adminErr'));
  hide($('adminMsg'));
  try{
    const data = await api('/api/admin/sites/' + encodeURIComponent(siteId) + '/update-link',{method:'POST'});
    window.open(data.uploadUrl,'_blank','noopener');
  }catch(error){
    show($('adminErr'),error.message);
  }
}
function metricCard(label, value, detail){
  return '<div class="item"><div class="k">' + esc(label) + '</div><div class="v">' + esc(value) + '</div>' + (detail ? '<div class="muted" style="margin-top:6px">' + esc(detail) + '</div>' : '') + '</div>';
}
function storageMetricSection(title, subtitle, cards){
  return '<div class="site-detail">' +
    '<div class="cell-stack">' +
      '<strong>' + esc(title) + '</strong>' +
      (subtitle ? '<div class="subtle">' + esc(subtitle) + '</div>' : '') +
    '</div>' +
    '<div class="site-detail-grid">' + cards.join('') + '</div>' +
  '</div>';
}
function setAdminSummary(items){
  if(!$('adminStatRows')) return;
  const rows = items.length;
  const keyed = items.filter((item)=>item.hasApiKey);
  const active = keyed.filter((item)=>item.status === 'active').length;
  const disabled = keyed.filter((item)=>item.status === 'disabled').length;
  $('adminStatRows').textContent = formatNumber(rows);
  $('adminStatKeys').textContent = formatNumber(keyed.length);
  $('adminStatActive').textContent = formatNumber(active);
  $('adminStatDisabled').textContent = formatNumber(disabled);
}
async function loadStorageStats(){
  hide($('adminErr'));
  const wrap = $('storageStatsWrap');
  if(!wrap) return null;
  wrap.textContent = 'Loading storage statistics...';
  const data = await api('/api/admin/storage-stats');
  const counts = data.counts || {};
  const bytes = data.bytes || {};
  const objects = data.objects || {};
  const bucketCost = data.estimates?.bucketTotal || {};
  const userCost = data.estimates?.bucketUserObjects || {};
  const anonymousCurrentBytes = Number(bytes.publishedFilesAnonymous || 0) + Number(bytes.activeSitesAnonymous || 0);
  const registeredCurrentBytes = Number(bytes.publishedFilesRegistered || 0) + Number(bytes.activeSitesRegistered || 0);
  wrap.innerHTML = '<div class="stack">' +
    storageMetricSection('Overall', 'Bucket-wide storage, database totals, and pricing reference.', [
      metricCard('Total Bucket Usage', formatSize(Number(bytes.bucketTotal || 0)), 'Objects: ' + String(objects.bucketTotal || 0)),
      metricCard('User-Facing R2 Objects', formatSize(Number(bytes.bucketUserObjects || 0)), 'Objects: ' + String(objects.bucketUserObjects || 0) + ' across uploads, sites, and retained history'),
      metricCard('Internal Metadata Usage', formatSize(Number(bytes.bucketInternalObjects || 0)), 'Objects: ' + String(objects.bucketInternalObjects || 0)),
      metricCard('Published File Total', formatSize(Number(bytes.publishedFiles || 0)), 'Records: ' + String(counts.publishedFiles || 0)),
      metricCard('Active Site Total', formatSize(Number(bytes.activeSites || 0)), 'Sites: ' + String(counts.sites || 0) + ', active: ' + String(counts.activeSites || 0)),
      metricCard('Referenced User Objects', formatSize(Number(bytes.referencedObjects || 0)), 'Deduplicated objects referenced by files or site releases: ' + String(counts.referencedObjects || 0)),
      metricCard('Open Upload Sessions', formatSize(Number(bytes.sessionObjects || 0)), 'Objects: ' + String(counts.sessionObjects || 0)),
      metricCard('Estimated Monthly Storage Cost', formatUsd(bucketCost.billableUsd || 0), 'Estimated from total bucket usage; total: ' + Number(bucketCost.totalGb || 0).toFixed(3) + ' GB, free allowance: ' + Number(bucketCost.freeGb || 0).toFixed(0) + ' GB'),
      metricCard('User File Monthly Cost Reference', formatUsd(userCost.billableUsd || 0), 'Estimated from user-facing objects; total: ' + Number(userCost.totalGb || 0).toFixed(3) + ' GB')
    ]) +
    storageMetricSection('Anonymous', 'Anonymous records split into current storage and all referenced objects.', [
      metricCard('Current Storage', formatSize(anonymousCurrentBytes), 'Current files plus active sites'),
      metricCard('Referenced Objects', formatSize(Number(bytes.referencedObjectsAnonymous || 0)), 'Objects: ' + String(counts.referencedObjectsAnonymous || 0)),
      metricCard('Open Upload Sessions', formatSize(Number(bytes.sessionObjectsAnonymous || 0)), 'Objects: ' + String(counts.sessionObjectsAnonymous || 0)),
      metricCard('Files', formatSize(Number(bytes.publishedFilesAnonymous || 0)), 'Records: ' + String(counts.publishedFilesAnonymous || 0)),
      metricCard('Active Sites', formatSize(Number(bytes.activeSitesAnonymous || 0)), 'Sites: ' + String(counts.sitesAnonymous || 0) + ', active: ' + String(counts.activeSitesAnonymous || 0))
    ]) +
    storageMetricSection('Registered', 'Registered records split into current storage and all referenced objects.', [
      metricCard('Current Storage', formatSize(registeredCurrentBytes), 'Current files plus active sites'),
      metricCard('Referenced Objects', formatSize(Number(bytes.referencedObjectsRegistered || 0)), 'Objects: ' + String(counts.referencedObjectsRegistered || 0)),
      metricCard('Open Upload Sessions', formatSize(Number(bytes.sessionObjectsRegistered || 0)), 'Objects: ' + String(counts.sessionObjectsRegistered || 0)),
      metricCard('Files', formatSize(Number(bytes.publishedFilesRegistered || 0)), 'Records: ' + String(counts.publishedFilesRegistered || 0)),
      metricCard('Active Sites', formatSize(Number(bytes.activeSitesRegistered || 0)), 'Sites: ' + String(counts.sitesRegistered || 0) + ', active: ' + String(counts.activeSitesRegistered || 0))
    ]) +
  '</div>' +
  '<div class="note">Current Storage uses published files plus active sites. Referenced Objects uses the deduplicated object set still linked by any file record, current site mapping, or historical site release, measured from actual R2 object sizes. User-Facing R2 Objects equals Referenced Objects plus any still-open upload-session objects. Estimated using the current standard storage rate of ' + formatUsd(bucketCost.unitUsdPerGbMonth || 0) + ' / GB-month. This covers storage only and excludes request-based charges.</div>';
}
function row(item){
  if(!item.hasApiKey){
    return '<tr>' +
      '<td>' + renderUserCell(item.ownerEmail, item.userId, 'Registered ' + formatTime(item.userCreatedAt)) + '</td>' +
      '<td><div class="cell-stack"><strong>No API Key yet</strong><div class="subtle">This account exists but the user has not created any API Key yet.</div></div></td>' +
      '<td><span class="subtle">-</span></td>' +
      '<td><span class="subtle">-</span></td>' +
      '<td><span class="subtle">-</span></td>' +
      '<td><span class="subtle">-</span></td>' +
      '<td><span class="subtle">Waiting for user action</span></td>' +
    '</tr>';
  }
  return '<tr>' +
    '<td>' + renderUserCell(item.ownerEmail, item.userId, 'Registered ' + formatTime(item.userCreatedAt)) + '</td>' +
    '<td><div class="cell-stack"><div class="token-name"><strong>' + esc(item.name) + '</strong><span class="status-pill ' + (item.status === 'disabled' ? 'disabled' : 'active') + '">' + esc(item.status === 'disabled' ? 'Disabled' : 'Active') + '</span></div><div class="mono">' + esc(item.keyPrefix) + '...</div></div></td>' +
    '<td><select data-field="status" data-id="' + item.id + '"><option value="active"' + (item.status==='active'?' selected':'') + '>active</option><option value="disabled"' + (item.status==='disabled'?' selected':'') + '>disabled</option></select></td>' +
    '<td><div class="cell-stack"><input data-field="limitPreparePerWindow" data-id="' + item.id + '" type="number" min="1" value="' + item.limitPreparePerWindow + '"><div class="subtle">requests per window</div></div></td>' +
    '<td><div class="cell-stack"><input data-field="limitPrepareWindowSec" data-id="' + item.id + '" type="number" min="60" value="' + item.limitPrepareWindowSec + '"><div class="subtle">window seconds</div></div></td>' +
    '<td><div class="cell-stack"><input data-field="limitUploadCountTotal" data-id="' + item.id + '" type="number" min="1" value="' + item.limitUploadCountTotal + '"><div class="subtle">uploaded ' + formatNumber(item.uploadedCountTotal) + '</div></div></td>' +
    '<td>' + renderApiKeyActionsMenu(item) + '</td>' +
  '</tr>';
}
function renderApiKeyActionsMenu(item){
  return '<div class="site-actions" data-site-actions>' +
    '<button class="site-actions-toggle" type="button" data-site-menu-toggle aria-label="Open actions menu">...</button>' +
    '<div class="site-actions-menu">' +
      '<button class="site-actions-item" type="button" data-save="' + esc(item.id) + '">Save Changes</button>' +
    '</div>' +
  '</div>';
}
function userRow(item){
  const totalStorageBytes = Number(item.fileBytes || 0) + Number(item.siteBytes || 0);
  return '<tr>' +
    '<td>' + renderUserCell(item.email, item.id) + '</td>' +
    '<td><div class="cell-stack"><div>' + esc(formatTime(item.createdAt)) + '</div><div class="subtle">Registered account</div></div></td>' +
    '<td><div class="cell-stack"><strong>' + esc(item.vipLabel || 'Standard') + '</strong><div class="subtle">' + esc(formatSize(Number(item.maxFileSize || 0))) + ' per file</div></div></td>' +
    '<td>' + esc(formatNumber(item.apiKeyCount)) + '<div class="subtle">active ' + esc(formatNumber(item.activeApiKeyCount)) + '</div></td>' +
    '<td>' + esc(formatNumber(item.uploadedCountTotal)) + '</td>' +
    '<td><div class="cell-stack"><strong>' + esc(formatSize(totalStorageBytes)) + '</strong><div class="subtle">files ' + esc(formatSize(Number(item.fileBytes || 0))) + ' + sites ' + esc(formatSize(Number(item.siteBytes || 0))) + '</div></div></td>' +
    '<td>' + esc(formatNumber(item.siteCount)) + '</td>' +
  '</tr>';
}
async function loadUsersTable(){
  hide($('adminErr'));
  const data = await api('/api/admin/users');
  if(!$('usersTableWrap')) return data.users || [];
  const items = data.users || [];
  $('usersTableWrap').innerHTML = '<table><thead><tr><th>User</th><th>Registered</th><th>VIP</th><th>API Keys</th><th>Total Uploads</th><th>Storage</th><th>Sites</th></tr></thead><tbody>' +
    (items.length ? items.map(userRow).join('') : '<tr><td colspan="7" class="muted">No users were found.</td></tr>') +
    '</tbody></table>';
  return items;
}
async function loadAdminTable(){
  hide($('adminErr'));
  const data=await api('/api/admin/api-keys');
  const items = data.apiKeys || [];
  setAdminSummary(items);
  if(!$('adminTableWrap')) return items;
  $('adminTableWrap').innerHTML = '<table><thead><tr><th>User</th><th>API Key</th><th>Status</th><th>Prepare Limit</th><th>Window</th><th>Upload Quota</th><th>Actions</th></tr></thead><tbody>' + items.map(row).join('') + '</tbody></table>';
  document.querySelectorAll('[data-save]').forEach((btn)=>{
    btn.onclick = async () => {
      hide($('adminErr'));
      hide($('adminMsg'));
      const id = btn.getAttribute('data-save');
      const originalText = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Saving...';
      try{
        await api('/api/admin/api-keys/' + id,{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({
            status:document.querySelector('[data-field="status"][data-id="' + id + '"]').value,
            limitPreparePerWindow:Number(document.querySelector('[data-field="limitPreparePerWindow"][data-id="' + id + '"]').value),
            limitPrepareWindowSec:Number(document.querySelector('[data-field="limitPrepareWindowSec"][data-id="' + id + '"]').value),
            limitUploadCountTotal:Number(document.querySelector('[data-field="limitUploadCountTotal"][data-id="' + id + '"]').value)
          })
        });
        show($('adminMsg'),'Saved successfully');
        await loadAdminTable();
      }catch(error){
        show($('adminErr'),error.message);
      }finally{
        btn.disabled = false;
        btn.textContent = originalText;
      }
    };
  });
}
async function loadPublishDomain(){
  const data = await api('/api/admin/publish-domain');
  if($('publishOrigin')) $('publishOrigin').value = data.configuredOrigin || '';
  if($('publishOriginPreview')) $('publishOriginPreview').textContent = data.configuredOrigin
    ? 'Current publish origin: ' + data.configuredOrigin
    : 'Using the default upload API origin.';
  if($('siteManageHint')) $('siteManageHint').textContent = data.configuredOrigin
    ? 'New site subdomains use ' + displayOrigin(data.configuredOrigin)
    : 'Site subdomains use the default upload API origin.';
  syncPublicNav(effectivePublicOrigin(data));
  return data;
}
function siteRow(item){
  const siteLink = item.siteUrl
    ? '<a class="mono" href="' + esc(item.siteUrl) + '" target="_blank" rel="noopener">' + esc(item.siteHostname || item.subdomain || '-') + '</a>'
    : '<span class="mono">' + esc(item.siteHostname || item.subdomain || '-') + '</span>';
  const timeParts = [formatSiteListTime(item.createdAt)];
  if(item.completedAt) timeParts.push('D ' + formatSiteListTime(item.completedAt));
  if(item.expiresAt) timeParts.push('E ' + formatSiteListTime(item.expiresAt));
  const originLine = displayOrigin(item.publishOrigin);
  return '<tr>' +
    '<td><div class="cell-stack"><div>' + esc(item.name || item.id) + '</div><div class="subtle">' + siteLink + '</div></div></td>' +
    '<td>' + esc(siteStatus(item)) + '</td>' +
    '<td>' + esc(item.entryPath || '-') + '</td>' +
    '<td><div class="subtle">' + esc(String(item.fileCount || 0)) + ' files</div><div class="subtle">' + esc(formatSize(Number(item.totalSize || 0))) + '</div></td>' +
    '<td><div class="subtle">' + renderCompactUserCell(item.ownerEmail || 'Anonymous', item.userId) + '</div></td>' +
    '<td><div class="cell-stack"><div>' + esc(timeParts.join(' | ')) + '</div><div class="muted">' + esc(originLine) + '</div></div></td>' +
    '<td>' + renderSiteActionsMenu(item) + '</td>' +
  '</tr>';
}
function renderSiteActionsMenu(item){
  const parts = [];
  if(item.siteUrl){
    parts.push('<a class="site-actions-item" href="' + esc(item.siteUrl) + '" target="_blank" rel="noopener">Open Site</a>');
  }
  parts.push('<button class="site-actions-item" type="button" data-view-site="' + esc(item.id) + '">View Details</button>');
  parts.push('<button class="site-actions-item" type="button" data-update-site="' + esc(item.id) + '">Update Site</button>');
  parts.push('<button class="site-actions-item" type="button" data-extend-site="' + esc(item.id) + '">Extend 7 Days</button>');
  parts.push('<button class="site-actions-item" type="button" data-expire-site="' + esc(item.id) + '">Expire Now</button>');
  parts.push('<div class="site-actions-divider"></div>');
  parts.push('<button class="site-actions-item danger" type="button" data-delete-site="' + esc(item.id) + '">Delete Mapping</button>');
  parts.push('<button class="site-actions-item danger" type="button" data-destroy-site="' + esc(item.id) + '">Delete Permanently</button>');
  return '<div class="site-actions" data-site-actions>' +
    '<button class="site-actions-toggle" type="button" data-site-menu-toggle aria-label="Open actions menu">...</button>' +
    '<div class="site-actions-menu">' + parts.join('') + '</div>' +
  '</div>';
}
function renderReadonlySiteActions(item){
  if(!item.siteUrl) return '<span class="subtle">No public links</span>';
  return '<div class="site-actions" data-site-actions>' +
    '<button class="site-actions-toggle" type="button" data-site-menu-toggle aria-label="Open actions menu">...</button>' +
    '<div class="site-actions-menu">' +
      '<a class="site-actions-item" href="' + esc(item.siteUrl) + '" target="_blank" rel="noopener">Open Site</a>' +
    '</div>' +
  '</div>';
}
function renderSiteDetailActionsMenu(site){
  const parts = [];
  parts.push('<button class="site-actions-item" id="siteClearExpiryBtn" type="button">Clear Expiry</button>');
  if(site.siteUrl){
    parts.push('<a class="site-actions-item" href="' + esc(site.siteUrl) + '" target="_blank" rel="noopener">Open Site</a>');
  }
  parts.push('<button class="site-actions-item" id="siteOpenUpdateBtn" type="button">Update Site</button>');
  parts.push('<div class="site-actions-divider"></div>');
  parts.push('<button class="site-actions-item danger" id="siteDestroyBtn" type="button">Delete Site Permanently</button>');
  return '<div class="site-actions" data-site-actions>' +
    '<button class="site-actions-toggle" type="button" data-site-menu-toggle aria-label="Open actions menu">...</button>' +
    '<div class="site-actions-menu">' + parts.join('') + '</div>' +
  '</div>';
}
function renderReleaseActionsMenu(release, isActive){
  if(isActive){
    return '<span class="muted">Current live release</span>';
  }
  return '<div class="site-actions" data-site-actions>' +
    '<button class="site-actions-toggle" type="button" data-site-menu-toggle aria-label="Open actions menu">...</button>' +
    '<div class="site-actions-menu">' +
      '<button class="site-actions-item" type="button" data-activate-release="' + esc(release.id) + '">Switch to This Release</button>' +
    '</div>' +
  '</div>';
}
function renderSiteDetailFileActions(site, item){
  return '<div class="site-actions" data-site-actions>' +
    '<button class="site-actions-toggle" type="button" data-site-menu-toggle aria-label="Open actions menu">...</button>' +
    '<div class="site-actions-menu">' +
      '<a class="site-actions-item" href="' + esc(site.siteUrl + item.relativePath) + '" target="_blank" rel="noopener">Open</a>' +
    '</div>' +
  '</div>';
}
function closeSiteActionsMenus(exceptMenu){
  document.querySelectorAll('[data-site-actions].open').forEach((menu)=>{
    if(exceptMenu && menu === exceptMenu) return;
    menu.classList.remove('open');
  });
}
function renderFileActions(item){
  const actions = [];
  if(item.viewUrl){
    actions.push('<a class="site-actions-item" href="' + esc(item.viewUrl) + '" target="_blank" rel="noopener">Open</a>');
  }else if(item.playUrl){
    actions.push('<a class="site-actions-item" href="' + esc(item.playUrl) + '" target="_blank" rel="noopener">Open</a>');
  }
  if(item.downloadUrl){
    actions.push('<a class="site-actions-item" href="' + esc(item.downloadUrl) + '" target="_blank" rel="noopener">Download</a>');
  }
  return actions.length
    ? '<div class="site-actions" data-site-actions>' +
        '<button class="site-actions-toggle" type="button" data-site-menu-toggle aria-label="Open actions menu">...</button>' +
        '<div class="site-actions-menu">' + actions.join('') + '</div>' +
      '</div>'
    : '<span class="subtle">No public links</span>';
}
document.addEventListener('click',(event)=>{
  const toggle = event.target.closest('[data-site-menu-toggle]');
  if(toggle){
    const menu = toggle.closest('[data-site-actions]');
    const willOpen = !menu.classList.contains('open');
    closeSiteActionsMenus(menu);
    menu.classList.toggle('open', willOpen);
    return;
  }
  if(!event.target.closest('[data-site-actions]')){
    closeSiteActionsMenus();
  }
});
function fileRow(item){
  const originDetail = item.originDetail || item.publishOrigin || '-';
  const ownerLabel = item.ownerLabel || item.ownerEmail || 'Anonymous';
  const ownerDetail = item.ownerDetail || (item.apiKeyName ? ('API Key: ' + item.apiKeyName) : 'Guest upload or no API Key');
  const idLine = item.subtitle || item.id;
  const sourceParts = [];
  if(item.clientIp) sourceParts.push('IP ' + item.clientIp);
  if(item.clientRegion) sourceParts.push('Region ' + item.clientRegion);
  const sourceLine = sourceParts.join(' | ');
  const detailLine = item.publishOrigin && originDetail === item.publishOrigin ? '' : originDetail;
  const extraLine = sourceLine || '-';
  const fileLink = item.viewUrl
    ? '<a href="' + esc(item.viewUrl) + '" target="_blank" rel="noopener"><strong>' + esc(item.fileName || item.id) + '</strong></a>'
    : '<strong>' + esc(item.fileName || item.id) + '</strong>';
  return '<tr>' +
    '<td><div class="cell-stack">' + fileLink + '<div class="subtle mono">' + esc(idLine) + '</div></div></td>' +
    '<td>' + esc(item.contentType || '-') + '</td>' +
    '<td>' + esc(formatSize(Number(item.size || 0))) + '</td>' +
    '<td>' + renderUserCell(ownerLabel, item.userId, ownerDetail) + '</td>' +
    '<td><div class="cell-stack"><div>' + formatTime(item.createdAt) + '</div>' + (detailLine ? '<div class="muted">' + esc(detailLine) + '</div>' : '') + '<div class="muted">' + esc(extraLine) + '</div></div></td>' +
    '<td>' + renderFileActions(item) + '</td>' +
  '</tr>';
}
function renderFilesPager(meta){
  if(!meta) return '';
  const unitLabel = meta.scope === 'user-facing' ? 'objects' : 'files';
  return '<div class="pager">' +
    '<div class="muted">Total: ' + meta.total + ' ' + unitLabel + ', page ' + meta.page + ' / ' + meta.totalPages + '</div>' +
    '<div class="pager-actions">' +
      '<button class="btn-secondary" id="filePrevPage"' + (meta.page <= 1 ? ' disabled' : '') + '>Previous</button>' +
      '<button class="btn-secondary" id="fileNextPage"' + (meta.page >= meta.totalPages ? ' disabled' : '') + '>Next</button>' +
    '</div>' +
  '</div>';
}
function renderSitePager(meta){
  if(!meta) return '';
  return '<div class="pager">' +
    '<div class="muted">Total: ' + meta.total + ' sites, page ' + meta.page + ' / ' + meta.totalPages + '</div>' +
    '<div class="pager-actions">' +
      '<button class="btn-secondary" id="sitePrevPage"' + (meta.page <= 1 ? ' disabled' : '') + '>Previous</button>' +
      '<button class="btn-secondary" id="siteNextPage"' + (meta.page >= meta.totalPages ? ' disabled' : '') + '>Next</button>' +
    '</div>' +
  '</div>';
}
async function loadSiteDetail(siteId){
  hide($('adminErr'));
  const wrap = $('siteDetailWrap');
  if(!siteId){
    wrap.innerHTML = '';
    wrap.classList.add('hidden');
    return;
  }
  wrap.classList.remove('hidden');
  wrap.innerHTML = '<div class="site-detail muted">Loading site details...</div>';
  const data = await api('/api/admin/sites/' + encodeURIComponent(siteId) + buildQuery({
    filePage: siteState.detailPage,
    filePageSize: siteState.detailPageSize,
    fileQ: siteState.detailQ
  }));
  const site = data.site;
  const meta = data.filesMeta;
  const releases = data.releases || [];
  const expiresValue = toDatetimeLocalValue(site.expiresAt);
  const rows = (data.files || []).map((item)=>'<tr>' +
    '<td class="file-path">' + esc(item.relativePath) + '</td>' +
    '<td>' + esc(item.fileName || '-') + '</td>' +
    '<td>' + esc(item.contentType || '-') + '</td>' +
    '<td>' + esc(formatSize(Number(item.size || 0))) + '</td>' +
    '<td>' + renderSiteDetailFileActions(site, item) + '</td>' +
  '</tr>').join('');
  const releaseRows = releases.map((release)=>{
    const isActive = site.activeReleaseId && site.activeReleaseId === release.id;
    return '<tr>' +
      '<td><div>V' + esc(String(release.versionNo || 0)) + '</div><div class="muted mono">' + esc(release.id) + '</div></td>' +
      '<td>' + esc(release.status || 'ready') + '</td>' +
      '<td>' + esc(release.entryPath || '-') + '</td>' +
      '<td>' + esc(String(release.fileCount || 0)) + '<div class="muted">' + esc(formatSize(Number(release.totalSize || 0))) + '</div></td>' +
      '<td><div>' + formatTime(release.completedAt) + '</div><div class="muted">' + esc(formatReleaseSummary(release.changeSummary)) + '</div></td>' +
      '<td>' + renderReleaseActionsMenu(release, isActive) + '</td>' +
    '</tr>';
  }).join('');
  wrap.innerHTML = '<div class="site-detail">' +
    '<h3>Site Details</h3>' +
    '<div class="site-detail-grid">' +
      '<div class="item"><div class="k">Site</div><div class="v">' + (site.siteUrl ? '<a href="' + esc(site.siteUrl) + '" target="_blank" rel="noopener">' + esc(site.name || site.id) + '</a>' : esc(site.name || site.id)) + '</div></div>' +
      '<div class="item"><div class="k">Site ID</div><div class="v mono">' + esc(site.id) + '</div></div>' +
      '<div class="item"><div class="k">Subdomain</div><div class="v mono">' + (site.siteUrl ? '<a href="' + esc(site.siteUrl) + '" target="_blank" rel="noopener">' + esc(site.siteHostname || '-') + '</a>' : esc(site.siteHostname || '-')) + '</div></div>' +
      '<div class="item"><div class="k">Entry File</div><div class="v">' + esc(site.entryPath || '-') + '</div></div>' +
      '<div class="item"><div class="k">Status</div><div class="v">' + esc(siteStatus(site)) + '</div></div>' +
      '<div class="item"><div class="k">Owner</div><div class="v">' + userLink(site.ownerEmail || 'Anonymous', site.userId) + '</div></div>' +
      '<div class="item"><div class="k">User ID</div><div class="v mono">' + (site.userId ? userLink(site.userId, site.userId, 'mono') : '-') + '</div></div>' +
      '<div class="item"><div class="k">Current Release</div><div class="v">' + esc(site.activeReleaseId || '-') + '</div></div>' +
    '</div>' +
    '<div class="inline-row" style="margin:10px 0 14px">' +
      '<input id="siteExpiryInput" type="datetime-local" value="' + esc(expiresValue) + '">' +
      '<button class="btn-primary" id="siteSaveExpiryBtn" style="margin-top:0">Save Expiry</button>' +
      renderSiteDetailActionsMenu(site) +
    '</div>' +
    '<div class="note">Update flow: click "Update Site" to open the upload page and create a new release for the current site ID. After all files finish uploading, the site switches to the new release atomically. You can also switch back to an earlier release here.</div>' +
    '<table><thead><tr><th>Release</th><th>Status</th><th>Entry</th><th>Files / Size</th><th>Time / Summary</th><th>Actions</th></tr></thead><tbody>' + (releaseRows || '<tr><td colspan="6" class="muted">No release history is available yet.</td></tr>') + '</tbody></table>' +
    '<div class="inline-row" style="margin:10px 0 14px">' +
      '<input id="siteDetailQuery" type="text" placeholder="Search file path or file name" value="' + esc(siteState.detailQ) + '">' +
      '<select id="siteDetailPageSize">' +
        '<option value="20"' + (siteState.detailPageSize === 20 ? ' selected' : '') + '>20 / page</option>' +
        '<option value="50"' + (siteState.detailPageSize === 50 ? ' selected' : '') + '>50 / page</option>' +
        '<option value="100"' + (siteState.detailPageSize === 100 ? ' selected' : '') + '>100 / page</option>' +
      '</select>' +
      '<button class="btn-secondary" id="siteDetailSearchBtn" type="button">Search Files</button>' +
    '</div>' +
    '<table><thead><tr><th>Relative Path</th><th>File Name</th><th>Type</th><th>Size</th><th>Actions</th></tr></thead><tbody>' + (rows || '<tr><td colspan="5" class="muted">No matching files were found.</td></tr>') + '</tbody></table>' +
    '<div class="pager">' +
      '<div class="muted">Files: ' + meta.total + ', page ' + meta.page + ' / ' + meta.totalPages + '</div>' +
      '<div class="pager-actions">' +
        '<button class="btn-secondary" id="siteDetailPrevPage"' + (meta.page <= 1 ? ' disabled' : '') + '>Previous</button>' +
        '<button class="btn-secondary" id="siteDetailNextPage"' + (meta.page >= meta.totalPages ? ' disabled' : '') + '>Next</button>' +
      '</div>' +
    '</div>' +
  '</div>';
  $('siteSaveExpiryBtn').onclick = async () => {
    hide($('adminErr'));
    hide($('adminMsg'));
    try{
      const raw = $('siteExpiryInput').value;
      await api('/api/admin/sites/' + encodeURIComponent(site.id) + '/expiry',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({expiresAt: raw ? new Date(raw).toISOString() : null})
      });
      show($('adminMsg'),'Site expiry updated');
      await loadSitesTable();
    }catch(error){
      show($('adminErr'),error.message);
    }
  };
  $('siteClearExpiryBtn').onclick = async () => {
    hide($('adminErr'));
    hide($('adminMsg'));
    try{
      await api('/api/admin/sites/' + encodeURIComponent(site.id) + '/expiry',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({expiresAt:null})
      });
      show($('adminMsg'),'Site expiry cleared');
      await loadSitesTable();
    }catch(error){
      show($('adminErr'),error.message);
    }
  };
  $('siteDetailSearchBtn').onclick = async () => {
    siteState.detailQ = $('siteDetailQuery').value.trim();
    siteState.detailPageSize = Number($('siteDetailPageSize').value || 20);
    siteState.detailPage = 1;
    await loadSiteDetail(site.id);
  };
  $('siteDetailPrevPage').onclick = async () => {
    if(meta.page <= 1) return;
    siteState.detailPage = meta.page - 1;
    await loadSiteDetail(site.id);
  };
  $('siteDetailNextPage').onclick = async () => {
    if(meta.page >= meta.totalPages) return;
    siteState.detailPage = meta.page + 1;
    await loadSiteDetail(site.id);
  };
  document.querySelectorAll('[data-activate-release]').forEach((btn)=>{
    btn.onclick = async () => {
      hide($('adminErr'));
      hide($('adminMsg'));
      const releaseId = btn.getAttribute('data-activate-release');
      if(!confirm('Switch to this historical release now? The live site will update immediately.')) return;
      try{
        await api('/api/admin/sites/' + encodeURIComponent(site.id) + '/releases/' + encodeURIComponent(releaseId) + '/activate',{method:'POST'});
        show($('adminMsg'),'Site release switched');
        await loadSitesTable();
      }catch(error){
        show($('adminErr'),error.message);
      }
    };
  });
  $('siteOpenUpdateBtn').onclick = async () => {
    await openSiteUpdate(site.id);
  };
  $('siteDestroyBtn').onclick = async () => {
    hide($('adminErr'));
    hide($('adminMsg'));
    if(!confirm('Delete this site permanently? This removes the site mapping, release history, and attempts to clean up underlying file objects that are not referenced elsewhere.')) return;
    try{
      const result = await api('/api/admin/sites/' + encodeURIComponent(site.id) + '/destroy',{method:'POST'});
      siteState.selectedSiteId = '';
      $('siteDetailWrap').innerHTML = '';
      $('siteDetailWrap').classList.add('hidden');
      show($('adminMsg'),'Site deleted permanently. Deleted objects: ' + String(result.deletedObjectCount || 0) + ', retained shared objects: ' + String(result.retainedObjectCount || 0));
      await loadSitesTable();
      await loadStorageStats();
    }catch(error){
      show($('adminErr'),error.message);
    }
  };
}
async function loadSitesTable(){
  hide($('adminErr'));
  if(!$('siteTableWrap')) return null;
  const data = await api('/api/admin/sites' + buildQuery({
    q: siteState.q,
    status: siteState.status,
    page: siteState.page,
    pageSize: siteState.pageSize
  }));
  if(!data.sites || !data.sites.length){
    $('siteTableWrap').innerHTML = '<div class="muted">No matching sites were found.</div>';
    if(siteState.selectedSiteId) await loadSiteDetail(siteState.selectedSiteId);
    return;
  }
  $('siteTableWrap').innerHTML = '<table><thead><tr><th>Site</th><th>Status</th><th>Entry</th><th>Files / Size</th><th>Owner</th><th>Time / Origin</th><th>Actions</th></tr></thead><tbody>' + data.sites.map(siteRow).join('') + '</tbody></table>' + renderSitePager(data.meta);
  if($('sitePrevPage')) $('sitePrevPage').onclick = async () => {
    if(data.meta.page <= 1) return;
    siteState.page = data.meta.page - 1;
    await loadSitesTable();
  };
  if($('siteNextPage')) $('siteNextPage').onclick = async () => {
    if(data.meta.page >= data.meta.totalPages) return;
    siteState.page = data.meta.page + 1;
    await loadSitesTable();
  };
  document.querySelectorAll('[data-view-site]').forEach((btn)=>{
    btn.onclick = async () => {
      siteState.selectedSiteId = btn.getAttribute('data-view-site');
      siteState.detailPage = 1;
      siteState.detailQ = '';
      await loadSiteDetail(siteState.selectedSiteId);
    };
  });
  document.querySelectorAll('[data-update-site]').forEach((btn)=>{
    btn.onclick = async () => {
      await openSiteUpdate(btn.getAttribute('data-update-site'));
    };
  });
  document.querySelectorAll('[data-extend-site]').forEach((btn)=>{
    btn.onclick = async () => {
      hide($('adminErr'));
      hide($('adminMsg'));
      const siteId = btn.getAttribute('data-extend-site');
      const site = data.sites.find((item)=>item.id === siteId);
      const baseTime = site && site.expiresAt && new Date(site.expiresAt).getTime() > Date.now()
        ? new Date(site.expiresAt).getTime()
        : Date.now();
      const next = new Date(baseTime + 7 * 24 * 60 * 60 * 1000).toISOString();
      try{
        await api('/api/admin/sites/' + encodeURIComponent(siteId) + '/expiry',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({expiresAt: next})
        });
        show($('adminMsg'),'Site extended by 7 days');
        await loadSitesTable();
      }catch(error){
        show($('adminErr'),error.message);
      }
    };
  });
  document.querySelectorAll('[data-expire-site]').forEach((btn)=>{
    btn.onclick = async () => {
      hide($('adminErr'));
      hide($('adminMsg'));
      const siteId = btn.getAttribute('data-expire-site');
      if(!confirm('Expire this site immediately?')) return;
      try{
        await api('/api/admin/sites/' + encodeURIComponent(siteId) + '/expire',{method:'POST'});
        show($('adminMsg'),'Site expired immediately');
        await loadSitesTable();
      }catch(error){
        show($('adminErr'),error.message);
      }
    };
  });
  document.querySelectorAll('[data-delete-site]').forEach((btn)=>{
    btn.onclick = async () => {
      hide($('adminErr'));
      hide($('adminMsg'));
      const siteId = btn.getAttribute('data-delete-site');
      if(!confirm('Delete this site mapping? The subdomain will stop working, but underlying files will remain.')) return;
      try{
        await api('/api/admin/sites/' + encodeURIComponent(siteId) + '/delete',{method:'POST'});
        if(siteState.selectedSiteId === siteId){
          siteState.selectedSiteId = '';
          $('siteDetailWrap').innerHTML = '';
          $('siteDetailWrap').classList.add('hidden');
        }
        show($('adminMsg'),'Site mapping deleted');
        await loadSitesTable();
        await loadStorageStats();
      }catch(error){
        show($('adminErr'),error.message);
      }
    };
  });
  document.querySelectorAll('[data-destroy-site]').forEach((btn)=>{
    btn.onclick = async () => {
      hide($('adminErr'));
      hide($('adminMsg'));
      const siteId = btn.getAttribute('data-destroy-site');
      if(!confirm('Delete this site permanently? This removes the site mapping, release history, and underlying file objects that are not reused elsewhere.')) return;
      try{
        const result = await api('/api/admin/sites/' + encodeURIComponent(siteId) + '/destroy',{method:'POST'});
        if(siteState.selectedSiteId === siteId){
          siteState.selectedSiteId = '';
          $('siteDetailWrap').innerHTML = '';
          $('siteDetailWrap').classList.add('hidden');
        }
        show($('adminMsg'),'Site deleted permanently. Deleted objects: ' + String(result.deletedObjectCount || 0) + ', retained shared objects: ' + String(result.retainedObjectCount || 0));
        await loadSitesTable();
        await loadStorageStats();
      }catch(error){
        show($('adminErr'),error.message);
      }
    };
  });
  if(siteState.selectedSiteId){
    await loadSiteDetail(siteState.selectedSiteId);
  }
}
async function loadFilesTable(){
  hide($('adminErr'));
  if(!$('fileTableWrap')) return null;
  const data = await api('/api/admin/files' + buildQuery({
    q: fileState.q,
    scope: fileState.scope,
    sort: fileState.sort,
    page: fileState.page,
    pageSize: fileState.pageSize
  }));
  if($('fileScope')) $('fileScope').value = data.meta?.scope || fileState.scope;
  if($('fileSort')) $('fileSort').value = data.meta?.sort || fileState.sort;
  if(!data.files || !data.files.length){
    $('fileTableWrap').innerHTML = '<div class="muted">' + (fileState.scope === 'user-facing' ? 'No matching user-facing objects were found.' : 'No matching files were found.') + '</div>';
    return data;
  }
  $('fileTableWrap').innerHTML = '<table><thead><tr><th>' + (fileState.scope === 'user-facing' ? 'Object' : 'File') + '</th><th>Type</th><th>Size</th><th>Owner</th><th>Time / Origin</th><th>Actions</th></tr></thead><tbody>' + data.files.map(fileRow).join('') + '</tbody></table>' + renderFilesPager(data.meta);
  if($('filePrevPage')) $('filePrevPage').onclick = async () => {
    if(data.meta.page <= 1) return;
    fileState.page = data.meta.page - 1;
    await loadFilesTable();
  };
  if($('fileNextPage')) $('fileNextPage').onclick = async () => {
    if(data.meta.page >= data.meta.totalPages) return;
    fileState.page = data.meta.page + 1;
    await loadFilesTable();
  };
  return data;
}
async function loadUserDetailPage(){
  hide($('adminErr'));
  const wrap = $('userDetailWrap');
  if(!wrap) return null;
  const userId = PAGE_CONTEXT.userId || '';
  if(!userId){
    wrap.innerHTML = '<div class="muted">Missing user ID.</div>';
    return null;
  }
  const data = await api('/api/admin/users/' + encodeURIComponent(userId));
  const user = data.user || {};
  const summary = data.summary || {};
  const keyRows = (data.apiKeys || []).map((item)=>'<tr>' +
    '<td><div class="cell-stack"><strong>' + esc(item.name || 'Unnamed Key') + '</strong><div class="subtle mono">' + esc(item.id) + '</div></div></td>' +
    '<td><span class="status-pill ' + (item.status === 'disabled' ? 'disabled' : 'active') + '">' + esc(item.status === 'disabled' ? 'Disabled' : 'Active') + '</span></td>' +
    '<td>' + esc(formatTime(item.createdAt)) + '</td>' +
    '<td>' + esc(formatNumber(item.uploadedCountTotal || 0)) + '</td>' +
  '</tr>').join('');
  const fileRows = (data.files || []).map((item)=>'<tr>' +
    '<td><div class="cell-stack">' + (item.viewUrl ? '<a href="' + esc(item.viewUrl) + '" target="_blank" rel="noopener"><strong>' + esc(item.fileName || item.id) + '</strong></a>' : '<strong>' + esc(item.fileName || item.id) + '</strong>') + '<div class="subtle mono">' + esc(item.id) + '</div></div></td>' +
    '<td>' + esc(item.contentType || '-') + '</td>' +
    '<td>' + esc(formatSize(Number(item.size || 0))) + '</td>' +
    '<td><div class="cell-stack"><div>' + esc(formatTime(item.createdAt)) + '</div><div class="muted">' + esc(([item.clientIp ? ('IP ' + item.clientIp) : '', item.clientRegion ? ('Region ' + item.clientRegion) : ''].filter(Boolean).join(' | ')) || '-') + '</div></div></td>' +
    '<td>' + renderFileActions(item) + '</td>' +
  '</tr>').join('');
  const siteRows = (data.sites || []).map((item)=>'<tr>' +
    '<td><div class="cell-stack">' + (item.siteUrl ? '<a href="' + esc(item.siteUrl) + '" target="_blank" rel="noopener"><strong>' + esc(item.name || item.id) + '</strong></a>' : '<strong>' + esc(item.name || item.id) + '</strong>') + '<div class="subtle mono">' + esc(item.id) + '</div></div></td>' +
    '<td>' + esc(siteStatus(item)) + '</td>' +
    '<td>' + esc(String(item.fileCount || 0)) + '<div class="subtle">' + esc(formatSize(Number(item.totalSize || 0))) + '</div></td>' +
    '<td>' + esc(formatTime(item.createdAt)) + '</td>' +
    '<td>' + renderReadonlySiteActions(item) + '</td>' +
  '</tr>').join('');
  const totalStorageBytes = Number(summary.fileBytes || 0) + Number(summary.siteBytes || 0);
  wrap.innerHTML = '<div class="stack">' +
    '<div class="stats-grid">' +
      '<div class="stat-card"><div class="stat-label">API Keys</div><div class="stat-value">' + esc(formatNumber(summary.apiKeyCount || 0)) + '</div><div class="muted">active ' + esc(formatNumber(summary.activeApiKeyCount || 0)) + '</div></div>' +
      '<div class="stat-card"><div class="stat-label">Uploads</div><div class="stat-value">' + esc(formatNumber(summary.uploadedCountTotal || 0)) + '</div><div class="muted">from API Key counters</div></div>' +
      '<div class="stat-card"><div class="stat-label">Files</div><div class="stat-value">' + esc(formatNumber(summary.fileCount || 0)) + '</div><div class="muted">' + esc(formatSize(Number(summary.fileBytes || 0))) + '</div></div>' +
      '<div class="stat-card"><div class="stat-label">Sites</div><div class="stat-value">' + esc(formatNumber(summary.siteCount || 0)) + '</div><div class="muted">active ' + esc(formatNumber(summary.activeSiteCount || 0)) + ' · ' + esc(formatSize(Number(summary.siteBytes || 0))) + '</div></div>' +
      '<div class="stat-card"><div class="stat-label">Storage</div><div class="stat-value">' + esc(formatSize(totalStorageBytes)) + '</div><div class="muted">files + sites</div></div>' +
    '</div>' +
    '<div class="site-detail"><h3>Account</h3><div class="site-detail-grid">' +
      metricCard('Email', user.email || '-', '') +
      metricCard('User ID', user.id || '-', '') +
      metricCard('VIP Level', user.vipLabel || 'Standard', 'Current single-file upload tier') +
      metricCard('Single File Limit', formatSize(Number(user.maxFileSize || 0)), 'Applies to direct uploads and prepare requests') +
      metricCard('Registered', formatTime(user.createdAt), 'Account creation time') +
      metricCard('Verified', formatTime(user.verifiedAt), 'First verified sign-in') +
      metricCard('Last Login', formatTime(user.lastLoginAt), 'Latest recorded session activity') +
      metricCard('Stored Files', formatNumber(summary.fileCount || 0), formatSize(Number(summary.fileBytes || 0))) +
      metricCard('Published Sites', formatNumber(summary.siteCount || 0), formatSize(Number(summary.siteBytes || 0))) +
      metricCard('Combined Storage', formatSize(totalStorageBytes), 'Files plus sites for this account') +
    '</div>' +
    '<div class="field"><label for="userVipLevel">VIP Level</label><select id="userVipLevel">' +
      '<option value="0"' + (Number(user.vipLevel || 0) === 0 ? ' selected' : '') + '>Standard</option>' +
      '<option value="1"' + (Number(user.vipLevel || 0) === 1 ? ' selected' : '') + '>VIP-1</option>' +
      '<option value="2"' + (Number(user.vipLevel || 0) === 2 ? ' selected' : '') + '>VIP-2</option>' +
      '<option value="3"' + (Number(user.vipLevel || 0) === 3 ? ' selected' : '') + '>VIP-3</option>' +
      '<option value="4"' + (Number(user.vipLevel || 0) === 4 ? ' selected' : '') + '>VIP-4</option>' +
    '</select></div>' +
    '<div class="action-row"><button class="btn-primary" type="button" id="saveVipBtn">Save VIP Level</button><div class="note" id="userVipHint">Current limit: ' + esc(formatSize(Number(user.maxFileSize || 0))) + ' per file.</div></div>' +
    '</div></div>' +
    '<div class="site-detail"><h3>API Keys</h3><div class="table-wrap"><table><thead><tr><th>Key</th><th>Status</th><th>Created</th><th>Uploaded</th></tr></thead><tbody>' + (keyRows || '<tr><td colspan="4" class="muted">No API Keys were found for this user.</td></tr>') + '</tbody></table></div></div>' +
    '<div class="site-detail"><h3>Files</h3><div class="table-wrap"><table><thead><tr><th>File</th><th>Type</th><th>Size</th><th>Created / Source</th><th>Actions</th></tr></thead><tbody>' + (fileRows || '<tr><td colspan="5" class="muted">No uploaded files were found for this user.</td></tr>') + '</tbody></table></div></div>' +
    '<div class="site-detail"><h3>Sites</h3><div class="table-wrap"><table><thead><tr><th>Site</th><th>Status</th><th>Files / Size</th><th>Created</th><th>Actions</th></tr></thead><tbody>' + (siteRows || '<tr><td colspan="5" class="muted">No published sites were found for this user.</td></tr>') + '</tbody></table></div></div>' +
  '</div>';
  const saveVipBtn = $('saveVipBtn');
  const userVipLevel = $('userVipLevel');
  const userVipHint = $('userVipHint');
  if(saveVipBtn && userVipLevel){
    userVipLevel.onchange = () => {
      const labels = {
        '0': '500 MB per file',
        '1': '5.00 GB per file',
        '2': '50.00 GB per file',
        '3': '500.00 GB per file',
        '4': '1.00 TB per file'
      };
      if(userVipHint) userVipHint.textContent = 'Selected limit: ' + (labels[userVipLevel.value] || labels['0']);
    };
    saveVipBtn.onclick = async () => {
      hide($('adminErr'));
      hide($('adminMsg'));
      saveVipBtn.disabled = true;
      saveVipBtn.textContent = 'Saving...';
      try{
        await api('/api/admin/users/' + encodeURIComponent(userId),{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({vipLevel:Number(userVipLevel.value || 0)})
        });
        show($('adminMsg'),'VIP level updated');
        await loadUserDetailPage();
      }catch(error){
        show($('adminErr'),error.message);
      }finally{
        saveVipBtn.disabled = false;
        saveVipBtn.textContent = 'Save VIP Level';
      }
    };
  }
  return data;
}
function setCleanupBusy(busy){
  $('cleanupBtn').disabled = busy;
  $('cleanupBtn').textContent = busy ? 'Cleaning...' : 'Clean Up Expired Files Now';
}
function setUntrackedCleanupBusy(mode){
  if($('auditUntrackedBtn')){
    $('auditUntrackedBtn').disabled = mode !== '';
    $('auditUntrackedBtn').textContent = mode === 'audit' ? 'Auditing...' : 'Audit Untracked Objects';
  }
  if($('cleanupUntrackedBtn')){
    $('cleanupUntrackedBtn').disabled = mode !== '';
    $('cleanupUntrackedBtn').textContent = mode === 'cleanup' ? 'Cleaning...' : 'Clean Untracked Objects';
  }
}
function setSizeBackfillBusy(busy){
  if(!$('sizeBackfillBtn')) return;
  $('sizeBackfillBtn').disabled = busy;
  $('sizeBackfillBtn').textContent = busy ? 'Backfilling...' : 'Backfill Zero Sizes';
}
async function runCleanup(){
  hide($('adminErr'));
  hide($('adminMsg'));
  const rawLimit = Number($('cleanupLimit').value || ${EXPIRED_CLEANUP_BATCH_LIMIT});
  const limit = Math.max(1, Math.min(rawLimit, 1000));
  $('cleanupLimit').value = String(limit);
  setCleanupBusy(true);
  $('cleanupResult').textContent = 'Running cleanup...';
  try{
    const data = await api('/api/admin/cleanup-expired',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({limit})
    });
    const extra = data.truncated && data.cursor ? '; more items remain in the next batch' : '';
    $('cleanupResult').textContent = 'Checked ' + data.checked + ', deleted ' + data.deleted + extra;
    show($('adminMsg'),'Expired file cleanup completed');
    await loadAdminTable();
    await loadStorageStats();
  }catch(error){
    $('cleanupResult').textContent = 'Cleanup failed';
    show($('adminErr'),error.message);
  }finally{
    setCleanupBusy(false);
  }
}
async function runUntrackedAudit(cleanup){
  hide($('adminErr'));
  hide($('adminMsg'));
  const rawSampleLimit = Number($('untrackedSampleLimit').value || 20);
  const sampleLimit = Math.max(1, Math.min(rawSampleLimit, 100));
  $('untrackedSampleLimit').value = String(sampleLimit);
  const rawStaleHours = Number($('staleUploadHours').value || ${STALE_UPLOAD_SESSION_TTL_HOURS});
  const staleHours = Math.max(1, Math.min(rawStaleHours, 24 * 30));
  $('staleUploadHours').value = String(staleHours);
  setUntrackedCleanupBusy(cleanup ? 'cleanup' : 'audit');
  $('untrackedCleanupResult').textContent = cleanup ? 'Cleaning untracked objects...' : 'Auditing untracked objects...';
  try{
    const endpoint = cleanup ? '/api/admin/cleanup-untracked-objects' : '/api/admin/audit-untracked-objects?sampleLimit=' + encodeURIComponent(sampleLimit) + '&staleHours=' + encodeURIComponent(staleHours);
    const data = cleanup
      ? await api(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sampleLimit,staleHours})})
      : await api(endpoint);
    const summary = [
      'Referenced ' + data.trackedObjects + ' objects',
      'active upload sessions ' + data.activeSessionObjects,
      'stale upload sessions ' + data.staleSessionObjects,
      'orphan objects ' + data.orphanObjects
    ];
    if(cleanup){
      summary.push('deleted ' + data.cleanedObjects);
      show($('adminMsg'),'Untracked object cleanup completed');
    }else{
      show($('adminMsg'),'Untracked object audit completed');
    }
    $('untrackedCleanupResult').textContent = summary.join('; ');
    await loadStorageStats();
  }catch(error){
    $('untrackedCleanupResult').textContent = cleanup ? 'Untracked object cleanup failed' : 'Untracked object audit failed';
    show($('adminErr'),error.message);
  }finally{
    setUntrackedCleanupBusy('');
  }
}
async function runSizeBackfill(){
  hide($('adminErr'));
  hide($('adminMsg'));
  const rawLimit = Number($('sizeBackfillLimit').value || 100);
  const limit = Math.max(1, Math.min(rawLimit, 500));
  $('sizeBackfillLimit').value = String(limit);
  setSizeBackfillBusy(true);
  $('sizeBackfillResult').textContent = 'Backfilling published file sizes...';
  try{
    const data = await api('/api/admin/backfill-published-file-sizes',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({limit})
    });
    $('sizeBackfillResult').textContent = 'Checked ' + data.checked + ', updated ' + data.updated + ', missing ' + data.missing + ', remaining ' + data.remaining;
    show($('adminMsg'),'Published file size backfill completed');
    await loadAdminTable();
    await loadStorageStats();
  }catch(error){
    $('sizeBackfillResult').textContent = 'Published file size backfill failed';
    show($('adminErr'),error.message);
  }finally{
    setSizeBackfillBusy(false);
  }
}
async function loadMe(){
  hide($('adminErr'));
  hide($('adminMsg'));
  try{
    const me=await api('/api/account/me');
    if(!me.isAdmin){
      location.href = LOGIN_PATH + '?next=' + encodeURIComponent(location.pathname + location.search + location.hash);
      return;
    }
    if($('currentUser')) $('currentUser').textContent = me.email;
    topAccountChip.textContent = me.email;
    setSidebarWorkspaceLabel(me.email);
    try{
      await loadPublishDomain();
    }catch(error){
      console.warn('Failed to load publish origin metadata', error);
      syncPublicNav('');
    }
    if(PAGE_KEY === 'overview'){
      await loadAdminTable();
    }else if(PAGE_KEY === 'storage'){
      await loadStorageStats();
    }else if(PAGE_KEY === 'users'){
      await loadUsersTable();
    }else if(PAGE_KEY === 'files'){
      await loadFilesTable();
    }else if(PAGE_KEY === 'config'){
      await loadPublishDomain();
    }else if(PAGE_KEY === 'sites'){
      await loadSitesTable();
    }else if(PAGE_KEY === 'api-keys'){
      await loadAdminTable();
    }else if(PAGE_KEY === 'user-detail'){
      await loadUserDetailPage();
    }
  }catch(error){
    if(String(error.message || '').includes('Please sign in first')){
      location.href = LOGIN_PATH + '?next=' + encodeURIComponent(location.pathname + location.search + location.hash);
      return;
    }
    show($('adminErr'),error.message || 'Failed to load admin data');
  }
}
if($('savePublishOriginBtn')) $('savePublishOriginBtn').onclick = async () => {
  hide($('adminErr'));
  hide($('adminMsg'));
  try{
    const data = await api('/api/admin/publish-domain',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({publishOrigin:$('publishOrigin').value})
    });
    if($('publishOrigin')) $('publishOrigin').value = data.configuredOrigin || '';
    if($('publishOriginPreview')) $('publishOriginPreview').textContent = data.configuredOrigin
      ? 'Current publish origin: ' + data.configuredOrigin
      : 'Using the default upload API origin.';
    syncPublicNav(effectivePublicOrigin(data));
    show($('adminMsg'),'Publish origin saved');
  }catch(error){
    show($('adminErr'),error.message);
  }
};
if($('siteSearchBtn')) $('siteSearchBtn').onclick = async () => {
  siteState.q = $('siteQuery').value.trim();
  siteState.status = $('siteStatusFilter').value;
  siteState.pageSize = Number($('sitePageSize').value || 20);
  siteState.page = 1;
  await loadSitesTable();
};
if($('siteResetBtn')) $('siteResetBtn').onclick = async () => {
  $('siteQuery').value = '';
  $('siteStatusFilter').value = 'all';
  $('sitePageSize').value = '20';
  siteState.q = '';
  siteState.status = 'all';
  siteState.pageSize = 20;
  siteState.page = 1;
  siteState.selectedSiteId = '';
  $('siteDetailWrap').innerHTML = '';
  $('siteDetailWrap').classList.add('hidden');
  await loadSitesTable();
};
if($('fileSearchBtn')) $('fileSearchBtn').onclick = async () => {
  fileState.q = $('fileQuery').value.trim();
  fileState.scope = $('fileScope').value || 'published';
  fileState.sort = normalizeFileSortValue($('fileSort').value);
  fileState.pageSize = Number($('filePageSize').value || 20);
  fileState.page = 1;
  await loadFilesTable();
};
if($('fileResetBtn')) $('fileResetBtn').onclick = async () => {
  $('fileScope').value = 'published';
  $('fileQuery').value = '';
  $('fileSort').value = 'created_desc';
  $('filePageSize').value = '20';
  fileState.scope = 'published';
  fileState.q = '';
  fileState.sort = 'created_desc';
  fileState.pageSize = 20;
  fileState.page = 1;
  await loadFilesTable();
};
if($('cleanupBtn')) $('cleanupBtn').onclick = runCleanup;
if($('auditUntrackedBtn')) $('auditUntrackedBtn').onclick = () => runUntrackedAudit(false);
if($('cleanupUntrackedBtn')) $('cleanupUntrackedBtn').onclick = () => runUntrackedAudit(true);
if($('sizeBackfillBtn')) $('sizeBackfillBtn').onclick = runSizeBackfill;
if($('refreshStorageStatsBtn')) $('refreshStorageStatsBtn').onclick = loadStorageStats;
logoutBtn.onclick = async () => {
  await fetch('/api/auth/logout',{method:'POST',credentials:'same-origin'});
  location.href = LOGIN_PATH;
};
loadMe();`
  );
}

async function handleAuthRequestLink(request, env) {
  let body;
  try {
    body = await request.json();
  } catch (error) {
    return json({ error: `Request body must be JSON: ${error.message}` }, 400);
  }
  const email = normalizeEmail(body?.email);
  if (!isEmail(email)) return json({ error: 'Enter a valid email address' }, 400);
  if (!adminEmailSet(env).has(email)) {
    return json({ error: 'This email does not have admin access' }, 403);
  }
  const nextPath = sanitizeAdminNextPath(body?.next, '/');
  try {
    await sendMagicLink(email, request, env, nextPath);
    return json({ success: true, message: 'Verification link sent. Check your email' });
  } catch (error) {
    return json({ error: error.message || 'Failed to send email' }, 500);
  }
}

async function handleVerify(request, env) {
  const url = new URL(request.url);
  const token = String(url.searchParams.get('token') || '').trim();
  if (!token) return htmlResponse('<h1>Invalid verification link</h1>', 400);
  const result = await consumeMagicLink(token, env);
  if (result.error) return htmlResponse(`<h1>${escapeHtml(result.error)}</h1>`, 400);
  const sessionToken = await createSession(result.userId, env);
  const nextPath = sanitizeAdminNextPath(url.searchParams.get('next'), '/');
  return redirect(nextPath, { 'Set-Cookie': buildSessionCookie(sessionToken, request) });
}

async function handleAccountMe(request, env) {
  const session = await getSessionFromRequest(request, env);
  if (!session) return json({ error: 'Please sign in first' }, 401);
  return json({
    success: true,
    email: session.email,
    isAdmin: session.isAdmin
  });
}

async function handleLogout(request, env) {
  await logoutSession(request, env);
  return json({ success: true }, 200, { 'Set-Cookie': clearSessionCookie(request) });
}

async function handleAdminApiKeys(request, env) {
  const session = await getSessionFromRequest(request, env);
  if (!session) return json({ error: 'Please sign in first' }, 401);
  if (!session.isAdmin) return json({ error: 'You do not have admin access' }, 403);
  const result = await env.DB.prepare(
    `SELECT
        users.id AS user_id,
        users.email,
        users.created_at AS user_created_at,
        api_keys.id,
        api_keys.name,
        api_keys.key_prefix,
        api_keys.status,
        api_keys.limit_prepare_per_window,
        api_keys.limit_prepare_window_sec,
        api_keys.limit_upload_count_total,
        api_keys.uploaded_count_total,
        api_keys.created_at AS api_key_created_at
     FROM users
     LEFT JOIN api_keys ON api_keys.user_id = users.id
     ORDER BY users.created_at DESC, api_keys.created_at DESC`
  ).all();
  return json({
    success: true,
    apiKeys: (result.results || []).map((item) => ({
      id: item.id,
      userId: item.user_id,
      ownerEmail: item.email,
      userCreatedAt: item.user_created_at,
      hasApiKey: Boolean(item.id),
      name: item.name || '',
      keyPrefix: item.key_prefix || '',
      status: item.status || 'active',
      limitPreparePerWindow: item.limit_prepare_per_window || 0,
      limitPrepareWindowSec: item.limit_prepare_window_sec || 0,
      limitUploadCountTotal: item.limit_upload_count_total || 0,
      uploadedCountTotal: item.uploaded_count_total || 0,
      apiKeyCreatedAt: item.api_key_created_at || null
    }))
  });
}

async function handleAdminUsers(request, env) {
  const session = await getSessionFromRequest(request, env);
  if (!session) return json({ error: 'Please sign in first' }, 401);
  if (!session.isAdmin) return json({ error: 'You do not have admin access' }, 403);
  await ensureVipLevelColumn(env);
  await ensureSitesTables(env);
  const result = await env.DB.prepare(
    `SELECT
        users.id AS user_id,
        users.email,
        users.vip_level,
        users.created_at AS user_created_at,
        (SELECT COUNT(*) FROM api_keys WHERE api_keys.user_id = users.id) AS api_key_count,
        (SELECT COUNT(*) FROM api_keys WHERE api_keys.user_id = users.id AND api_keys.status = 'active') AS active_api_key_count,
        (SELECT COUNT(*) FROM sites WHERE sites.user_id = users.id) AS site_count,
        (SELECT COALESCE(SUM(api_keys.uploaded_count_total), 0) FROM api_keys WHERE api_keys.user_id = users.id) AS uploaded_count_total,
        (SELECT COALESCE(SUM(size), 0) FROM published_files WHERE published_files.user_id = users.id) AS file_bytes,
        (SELECT COALESCE(SUM(total_size), 0) FROM sites WHERE sites.user_id = users.id) AS site_bytes
     FROM users
     ORDER BY users.created_at DESC`
  ).all();
  return json({
    success: true,
    users: (result.results || []).map((item) => ({
      id: item.user_id,
      email: item.email,
      vipLevel: normalizeVipLevel(item.vip_level),
      vipLabel: vipLabel(item.vip_level),
      maxFileSize: maxFileSizeForVipLevel(item.vip_level),
      createdAt: item.user_created_at || null,
      apiKeyCount: Number(item.api_key_count || 0),
      activeApiKeyCount: Number(item.active_api_key_count || 0),
      siteCount: Number(item.site_count || 0),
      uploadedCountTotal: Number(item.uploaded_count_total || 0),
      fileBytes: Number(item.file_bytes || 0),
      siteBytes: Number(item.site_bytes || 0),
    })),
  });
}

function normalizeFileSort(value) {
  if (value === 'size_desc' || value === 'size_asc' || value === 'created_desc') return value;
  return 'created_desc';
}

function sortFileList(items, sort) {
  const sorted = [...items];
  sorted.sort((a, b) => {
    if (sort === 'size_desc') {
      const sizeDelta = Number(b.size || 0) - Number(a.size || 0);
      if (sizeDelta) return sizeDelta;
    } else if (sort === 'size_asc') {
      const sizeDelta = Number(a.size || 0) - Number(b.size || 0);
      if (sizeDelta) return sizeDelta;
    } else {
      const timeDelta = new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      if (timeDelta) return timeDelta;
    }
    return String(a.id || '').localeCompare(String(b.id || ''));
  });
  return sorted;
}

async function collectPublishedAdminFileMap(env) {
  await ensurePublishedFilesTable(env);
  const result = await env.DB.prepare(
    `SELECT
        published_files.id,
        published_files.file_name,
        published_files.content_type,
        published_files.publish_origin,
        published_files.view_url,
        published_files.download_url,
        published_files.play_url,
        published_files.client_ip,
        published_files.client_region,
        published_files.api_key_id,
        published_files.user_id,
        published_files.created_at,
        users.email AS owner_email,
        api_keys.name AS api_key_name
     FROM published_files
     LEFT JOIN users ON users.id = published_files.user_id
     LEFT JOIN api_keys ON api_keys.id = published_files.api_key_id`
  ).all();
  return new Map((result.results || []).map((item) => [String(item.id || ''), {
    id: item.id,
    fileName: item.file_name || item.id,
    contentType: item.content_type || '',
    publishOrigin: item.publish_origin || '',
    viewUrl: item.view_url || '',
    downloadUrl: item.download_url || '',
    playUrl: item.play_url || '',
    clientIp: item.client_ip || '',
    clientRegion: item.client_region || '',
    apiKeyId: item.api_key_id || null,
    apiKeyName: item.api_key_name || '',
    userId: item.user_id || null,
    ownerEmail: item.owner_email || '',
    createdAt: item.created_at || null
  }]).filter((entry) => entry[0]));
}

async function collectFileReferenceCountMap(env, sql) {
  const result = await env.DB.prepare(sql).all();
  return new Map((result.results || []).map((item) => [String(item.file_id || ''), Number(item.ref_count || 0)]).filter((entry) => entry[0]));
}

async function collectOpenUploadSessionMap(env) {
  const sessions = new Map();
  let cursor;
  do {
    const listed = await env.FILES.list({ prefix: SESSION_PREFIX, cursor, limit: R2_LIST_PAGE_LIMIT });
    for (const object of listed.objects || []) {
      const key = String(object.key || '');
      if (!key.startsWith(SESSION_PREFIX) || !key.endsWith('.json')) continue;
      const session = await readJsonObject(key, env);
      if (!session) continue;
      const fileId = key.slice(SESSION_PREFIX.length, -5);
      if (!fileId) continue;
      sessions.set(fileId, session);
    }
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
  return sessions;
}

async function listAdminUserFacingObjects(env, options = {}) {
  const query = String(options.query || '').trim().toLowerCase();
  const page = normalizePositiveInt(options.page, 1, 1, 999999);
  const pageSize = normalizePositiveInt(options.pageSize, 20, 1, 100);
  const sort = normalizeFileSort(options.sort);
  const trackedOwnership = await collectTrackedFileOwnership(env);
  const publishedMap = await collectPublishedAdminFileMap(env);
  const uploadSessions = await collectOpenUploadSessionMap(env);
  const siteRefCounts = await collectFileReferenceCountMap(env, 'SELECT file_id, COUNT(DISTINCT site_id) AS ref_count FROM site_files GROUP BY file_id');
  const releaseRefCounts = await collectFileReferenceCountMap(env, 'SELECT file_id, COUNT(DISTINCT release_id) AS ref_count FROM site_release_files GROUP BY file_id');
  let cursor;
  const items = [];
  do {
    const listed = await env.FILES.list({ cursor, limit: R2_LIST_PAGE_LIMIT });
    for (const object of listed.objects || []) {
      const key = String(object.key || '');
      if (!key || isInternalBucketKey(key)) continue;
      const published = publishedMap.get(key);
      const uploadSession = uploadSessions.get(key);
      const siteRefs = Number(siteRefCounts.get(key) || 0);
      const releaseRefs = Number(releaseRefCounts.get(key) || 0);
      const sourceParts = [];
      if (published) sourceParts.push('Published file');
      if (siteRefs) sourceParts.push(siteRefs === 1 ? 'Current site' : `${siteRefs} current sites`);
      if (releaseRefs) sourceParts.push(releaseRefs === 1 ? 'Historical release' : `${releaseRefs} historical releases`);
      if (uploadSession) sourceParts.push('Open upload session');
      const ownerKind = trackedOwnership.get(key) || (uploadSession?.userId ? 'registered' : 'anonymous');
      const ownerLabel = published?.ownerEmail || (uploadSession?.userId ? 'Registered session' : (ownerKind === 'registered' ? 'Registered object' : 'Anonymous'));
      const ownerDetail = sourceParts.length ? sourceParts.join(' + ') : 'User-facing object';
      const item = {
        id: key,
        fileName: published?.fileName || key,
        subtitle: key,
        contentType: published?.contentType || '',
        size: Number(object.size || 0),
        publishOrigin: published?.publishOrigin || '',
        originDetail: uploadSession ? 'Upload session remains open' : ownerDetail,
        viewUrl: published?.viewUrl || '',
        downloadUrl: published?.downloadUrl || '',
        playUrl: published?.playUrl || '',
        clientIp: published?.clientIp || uploadSession?.clientIp || '',
        clientRegion: published?.clientRegion || uploadSession?.clientRegion || '',
        apiKeyId: published?.apiKeyId || null,
        apiKeyName: published?.apiKeyName || '',
        userId: published?.userId || uploadSession?.userId || null,
        ownerEmail: published?.ownerEmail || '',
        ownerLabel,
        ownerDetail,
        createdAt: published?.createdAt || uploadSession?.createdAt || null
      };
      if (query) {
        const haystack = [
          item.id,
          item.fileName,
          item.contentType,
          item.ownerLabel,
          item.ownerDetail,
          item.originDetail,
          item.apiKeyName
        ].join('\n').toLowerCase();
        if (!haystack.includes(query)) continue;
      }
      items.push(item);
    }
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
  const sorted = sortFileList(items, sort);
  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    files: sorted.slice(start, start + pageSize),
    meta: {
      q: query,
      scope: 'user-facing',
      sort,
      page: safePage,
      pageSize,
      total,
      totalPages
    }
  };
}

async function handleAdminFiles(request, env) {
  const session = await getSessionFromRequest(request, env);
  if (!session) return json({ error: 'Please sign in first' }, 401);
  if (!session.isAdmin) return json({ error: 'You do not have admin access' }, 403);
  await ensurePublishedFilesTable(env);
  const url = new URL(request.url);
  const query = String(url.searchParams.get('q') || '').trim().toLowerCase();
  const queryLike = `%${query}%`;
  const scope = url.searchParams.get('scope') === 'user-facing' ? 'user-facing' : 'published';
  const sort = normalizeFileSort(url.searchParams.get('sort'));
  const page = normalizePositiveInt(url.searchParams.get('page'), 1, 1, 999999);
  const pageSize = normalizePositiveInt(url.searchParams.get('pageSize'), 20, 1, 100);
  const offset = (page - 1) * pageSize;
  if (scope === 'user-facing') {
    return json({
      success: true,
      ...(await listAdminUserFacingObjects(env, { query, page, pageSize, sort }))
    });
  }
  const orderBy = sort === 'size_desc'
    ? 'published_files.size DESC, published_files.created_at DESC'
    : sort === 'size_asc'
      ? 'published_files.size ASC, published_files.created_at DESC'
      : 'published_files.created_at DESC';
  const filters = `WHERE
    (? = '' OR lower(published_files.id) LIKE ? OR lower(published_files.file_name) LIKE ? OR lower(COALESCE(users.email, '')) LIKE ? OR lower(COALESCE(api_keys.name, '')) LIKE ?)`;
  const bindings = [query, queryLike, queryLike, queryLike, queryLike];
  const countRow = await env.DB.prepare(
    `SELECT COUNT(*) AS total
     FROM published_files
     LEFT JOIN users ON users.id = published_files.user_id
     LEFT JOIN api_keys ON api_keys.id = published_files.api_key_id
     ${filters}`
  ).bind(...bindings).first();
  const result = await env.DB.prepare(
    `SELECT
        published_files.id,
        published_files.file_name,
        published_files.content_type,
        published_files.size,
        published_files.publish_origin,
        published_files.view_url,
        published_files.download_url,
        published_files.play_url,
        published_files.client_ip,
        published_files.client_region,
        published_files.api_key_id,
        published_files.user_id,
        published_files.created_at,
        users.email AS owner_email,
        api_keys.name AS api_key_name
     FROM published_files
     LEFT JOIN users ON users.id = published_files.user_id
     LEFT JOIN api_keys ON api_keys.id = published_files.api_key_id
     ${filters}
     ORDER BY ${orderBy}
     LIMIT ? OFFSET ?`
  ).bind(...bindings, pageSize, offset).all();
  const total = Number(countRow?.total || 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return json({
    success: true,
    files: (result.results || []).map((item) => ({
      id: item.id,
      fileName: item.file_name || item.id,
      contentType: item.content_type || '',
      size: Number(item.size || 0),
      publishOrigin: item.publish_origin || '',
      viewUrl: item.view_url || '',
      downloadUrl: item.download_url || '',
      playUrl: item.play_url || '',
      clientIp: item.client_ip || '',
      clientRegion: item.client_region || '',
      apiKeyId: item.api_key_id || null,
      apiKeyName: item.api_key_name || '',
      userId: item.user_id || null,
      ownerEmail: item.owner_email || '',
      createdAt: item.created_at || null,
    })),
    meta: {
      q: query,
      scope,
      sort,
      page,
      pageSize,
      total,
      totalPages
    }
  });
}

async function handleAdminUserDetail(request, userId, env) {
  const session = await getSessionFromRequest(request, env);
  if (!session) return json({ error: 'Please sign in first' }, 401);
  if (!session.isAdmin) return json({ error: 'You do not have admin access' }, 403);
  await ensureVipLevelColumn(env);
  await ensurePublishedFilesTable(env);
  await ensureSitesTables(env);
  const user = await env.DB.prepare(
    `SELECT id, email, vip_level, created_at, verified_at, last_login_at
     FROM users
     WHERE id = ?`
  ).bind(userId).first();
  if (!user) return json({ error: 'User not found' }, 404);
  const summaryRow = await env.DB.prepare(
    `SELECT
        (SELECT COUNT(*) FROM api_keys WHERE user_id = ?1) AS api_key_count,
        (SELECT COUNT(*) FROM api_keys WHERE user_id = ?1 AND status = 'active') AS active_api_key_count,
        (SELECT COALESCE(SUM(uploaded_count_total), 0) FROM api_keys WHERE user_id = ?1) AS uploaded_count_total,
        (SELECT COUNT(*) FROM published_files WHERE user_id = ?1) AS file_count,
        (SELECT COALESCE(SUM(size), 0) FROM published_files WHERE user_id = ?1) AS file_bytes,
        (SELECT COUNT(*) FROM sites WHERE user_id = ?1) AS site_count,
        (SELECT COUNT(*) FROM sites WHERE user_id = ?1 AND NOT (status = 'expired' OR (expires_at IS NOT NULL AND expires_at <= ?2))) AS active_site_count,
        (SELECT COALESCE(SUM(total_size), 0) FROM sites WHERE user_id = ?1) AS site_bytes`
  ).bind(userId, new Date().toISOString()).first();
  const apiKeysResult = await env.DB.prepare(
    `SELECT id, name, status, uploaded_count_total, created_at
     FROM api_keys
     WHERE user_id = ?
     ORDER BY created_at DESC`
  ).bind(userId).all();
  const filesResult = await env.DB.prepare(
    `SELECT id, file_name, content_type, size, publish_origin, view_url, download_url, play_url, client_ip, client_region, created_at
     FROM published_files
     WHERE user_id = ?
     ORDER BY created_at DESC
     LIMIT 50`
  ).bind(userId).all();
  const sitesResult = await env.DB.prepare(
    `SELECT id, name, site_url, status, file_count, total_size, expires_at, created_at
     FROM sites
     WHERE user_id = ?
     ORDER BY COALESCE(completed_at, created_at) DESC
     LIMIT 30`
  ).bind(userId).all();
  return json({
    success: true,
    user: {
      id: user.id,
      email: user.email,
      vipLevel: normalizeVipLevel(user.vip_level),
      vipLabel: vipLabel(user.vip_level),
      maxFileSize: maxFileSizeForVipLevel(user.vip_level),
      createdAt: user.created_at || null,
      verifiedAt: user.verified_at || null,
      lastLoginAt: user.last_login_at || null
    },
    summary: {
      apiKeyCount: Number(summaryRow?.api_key_count || 0),
      activeApiKeyCount: Number(summaryRow?.active_api_key_count || 0),
      uploadedCountTotal: Number(summaryRow?.uploaded_count_total || 0),
      fileCount: Number(summaryRow?.file_count || 0),
      fileBytes: Number(summaryRow?.file_bytes || 0),
      siteCount: Number(summaryRow?.site_count || 0),
      activeSiteCount: Number(summaryRow?.active_site_count || 0),
      siteBytes: Number(summaryRow?.site_bytes || 0)
    },
    apiKeys: (apiKeysResult.results || []).map((item) => ({
      id: item.id,
      name: item.name || '',
      status: item.status || 'active',
      uploadedCountTotal: Number(item.uploaded_count_total || 0),
      createdAt: item.created_at || null
    })),
    files: (filesResult.results || []).map((item) => ({
      id: item.id,
      fileName: item.file_name || item.id,
      contentType: item.content_type || '',
      size: Number(item.size || 0),
      publishOrigin: item.publish_origin || '',
      viewUrl: item.view_url || '',
      downloadUrl: item.download_url || '',
      playUrl: item.play_url || '',
      clientIp: item.client_ip || '',
      clientRegion: item.client_region || '',
      createdAt: item.created_at || null
    })),
    sites: (sitesResult.results || []).map((item) => ({
      id: item.id,
      name: item.name || item.id,
      siteUrl: item.site_url || '',
      status: item.status || 'active',
      fileCount: Number(item.file_count || 0),
      totalSize: Number(item.total_size || 0),
      expiresAt: item.expires_at || null,
      createdAt: item.created_at || null
    }))
  });
}

async function handleAdminUpdateUser(request, userId, env) {
  const session = await getSessionFromRequest(request, env);
  if (!session) return json({ error: 'Please sign in first' }, 401);
  if (!session.isAdmin) return json({ error: 'You do not have admin access' }, 403);
  await ensureVipLevelColumn(env);
  let body;
  try {
    body = await request.json();
  } catch (error) {
    return json({ error: `Request body must be JSON: ${error.message}` }, 400);
  }
  const vipLevel = normalizeVipLevel(body?.vipLevel);
  const result = await env.DB.prepare('UPDATE users SET vip_level = ? WHERE id = ?').bind(vipLevel, userId).run();
  if (!result.meta?.changes) return json({ error: 'User not found' }, 404);
  return json({
    success: true,
    vipLevel,
    vipLabel: vipLabel(vipLevel),
    maxFileSize: maxFileSizeForVipLevel(vipLevel),
    maxFileSizeLabel: formatSize(maxFileSizeForVipLevel(vipLevel))
  });
}

async function handleAdminUpdateApiKey(request, keyId, env) {
  const session = await getSessionFromRequest(request, env);
  if (!session) return json({ error: 'Please sign in first' }, 401);
  if (!session.isAdmin) return json({ error: 'You do not have admin access' }, 403);
  let body;
  try {
    body = await request.json();
  } catch (error) {
    return json({ error: `Request body must be JSON: ${error.message}` }, 400);
  }
  const status = body?.status === 'disabled' ? 'disabled' : 'active';
  const limitPreparePerWindow = Math.max(Number(body?.limitPreparePerWindow || 0), 1);
  const limitPrepareWindowSec = Math.max(Number(body?.limitPrepareWindowSec || 0), 60);
  const limitUploadCountTotal = Math.max(Number(body?.limitUploadCountTotal || 0), 1);
  await env.DB.prepare(
    `UPDATE api_keys
     SET status = ?, limit_prepare_per_window = ?, limit_prepare_window_sec = ?, limit_upload_count_total = ?
     WHERE id = ?`
  ).bind(status, limitPreparePerWindow, limitPrepareWindowSec, limitUploadCountTotal, keyId).run();
  return json({ success: true });
}

async function handleAdminCleanupExpired(request, env) {
  const session = await getSessionFromRequest(request, env);
  if (!session) return json({ error: 'Please sign in first' }, 401);
  if (!session.isAdmin) return json({ error: 'You do not have admin access' }, 403);
  let body = {};
  try {
    if (request.headers.get('content-type')?.includes('application/json')) {
      body = await request.json();
    }
  } catch {}
  const result = await cleanupExpiredFiles(env, {
    limit: body?.limit || EXPIRED_CLEANUP_BATCH_LIMIT
  });
  return json(result);
}

async function handleAdminAuditUntrackedObjects(request, env) {
  const session = await getSessionFromRequest(request, env);
  if (!session) return json({ error: 'Please sign in first' }, 401);
  if (!session.isAdmin) return json({ error: 'You do not have admin access' }, 403);
  const url = new URL(request.url);
  const sampleLimit = normalizePositiveInt(url.searchParams.get('sampleLimit'), 20, 1, 100);
  const staleHours = normalizePositiveInt(url.searchParams.get('staleHours'), STALE_UPLOAD_SESSION_TTL_HOURS, 1, 24 * 30);
  return json(await auditUntrackedBucketObjects(env, { sampleLimit, staleSessionThresholdMs: staleHours * 60 * 60 * 1000 }));
}

async function handleAdminCleanupUntrackedObjects(request, env) {
  const session = await getSessionFromRequest(request, env);
  if (!session) return json({ error: 'Please sign in first' }, 401);
  if (!session.isAdmin) return json({ error: 'You do not have admin access' }, 403);
  let body = {};
  try {
    if (request.headers.get('content-type')?.includes('application/json')) {
      body = await request.json();
    }
  } catch {}
  const sampleLimit = normalizePositiveInt(body?.sampleLimit, 20, 1, 100);
  const staleHours = normalizePositiveInt(body?.staleHours, STALE_UPLOAD_SESSION_TTL_HOURS, 1, 24 * 30);
  return json(await auditUntrackedBucketObjects(env, {
    sampleLimit,
    cleanup: true,
    staleSessionThresholdMs: staleHours * 60 * 60 * 1000
  }));
}

async function handleAdminBackfillPublishedFileSizes(request, env) {
  const session = await getSessionFromRequest(request, env);
  if (!session) return json({ error: 'Please sign in first' }, 401);
  if (!session.isAdmin) return json({ error: 'You do not have admin access' }, 403);
  let body = {};
  try {
    if (request.headers.get('content-type')?.includes('application/json')) {
      body = await request.json();
    }
  } catch {}
  return json(await backfillPublishedFileSizes(env, {
    limit: body?.limit || 100
  }));
}

async function handleAdminStorageStats(request, env) {
  const session = await getSessionFromRequest(request, env);
  if (!session) return json({ error: 'Please sign in first' }, 401);
  if (!session.isAdmin) return json({ error: 'You do not have admin access' }, 403);
  return json(await collectStorageStats(env));
}

async function handleAdminGetPublishDomain(request, env) {
  const session = await getSessionFromRequest(request, env);
  if (!session) return json({ error: 'Please sign in first' }, 401);
  if (!session.isAdmin) return json({ error: 'You do not have admin access' }, 403);
  const configuredOrigin = await getConfiguredPublishOrigin(env);
  return json({
    success: true,
    configuredOrigin,
    exampleOrigin: PUBLIC_SITE_EXAMPLE_ORIGIN
  });
}

async function handleAdminSetPublishDomain(request, env) {
  const session = await getSessionFromRequest(request, env);
  if (!session) return json({ error: 'Please sign in first' }, 401);
  if (!session.isAdmin) return json({ error: 'You do not have admin access' }, 403);
  let body;
  try {
    body = await request.json();
  } catch (error) {
    return json({ error: `Request body must be JSON: ${error.message}` }, 400);
  }
  const rawValue = String(body?.publishOrigin || '').trim();
  if (!rawValue) {
    await ensureAppSettingsTable(env);
    await env.DB.prepare('DELETE FROM app_settings WHERE key = ?').bind(PUBLISH_DOMAIN_SETTING_KEY).run();
    return json({ success: true, configuredOrigin: null, exampleOrigin: PUBLIC_SITE_EXAMPLE_ORIGIN });
  }
  const normalized = normalizePublishOrigin(rawValue);
  if (Number.isNaN(normalized)) {
    return json({ error: 'Publish origin must be a domain or a full origin without a path, for example ok26.org or https://ok26.org' }, 400);
  }
  await ensureAppSettingsTable(env);
  await env.DB.prepare(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).bind(PUBLISH_DOMAIN_SETTING_KEY, normalized, new Date().toISOString()).run();
  return json({ success: true, configuredOrigin: normalized, exampleOrigin: PUBLIC_SITE_EXAMPLE_ORIGIN });
}

async function handleAdminSites(request, env) {
  const session = await getSessionFromRequest(request, env);
  if (!session) return json({ error: 'Please sign in first' }, 401);
  if (!session.isAdmin) return json({ error: 'You do not have admin access' }, 403);
  await ensureSitesTables(env);
  const url = new URL(request.url);
  const query = String(url.searchParams.get('q') || '').trim().toLowerCase();
  const queryLike = `%${query}%`;
  const now = new Date().toISOString();
  const statusFilter = ['all', 'active', 'expired'].includes(url.searchParams.get('status'))
    ? url.searchParams.get('status')
    : 'all';
  const page = normalizePositiveInt(url.searchParams.get('page'), 1, 1, 999999);
  const pageSize = normalizePositiveInt(url.searchParams.get('pageSize'), 20, 1, 100);
  const offset = (page - 1) * pageSize;
  const filters = `WHERE
    (? = '' OR lower(sites.id) LIKE ? OR lower(sites.name) LIKE ? OR lower(sites.site_hostname) LIKE ? OR lower(COALESCE(users.email, '')) LIKE ?)
    AND (
      ? = 'all'
      OR (? = 'expired' AND (sites.status = 'expired' OR (sites.expires_at IS NOT NULL AND sites.expires_at <= ?)))
      OR (? = 'active' AND NOT (sites.status = 'expired' OR (sites.expires_at IS NOT NULL AND sites.expires_at <= ?)))
    )`;
  const bindings = [query, queryLike, queryLike, queryLike, queryLike, statusFilter, statusFilter, now, statusFilter, now];
  const countRow = await env.DB.prepare(
    `SELECT COUNT(*) AS total
     FROM sites
     LEFT JOIN users ON users.id = sites.user_id
     ${filters}`
  ).bind(...bindings).first();
  const result = await env.DB.prepare(
    `SELECT
        sites.id,
        sites.name,
        sites.publish_origin,
        sites.site_url,
        sites.site_hostname,
        sites.subdomain,
        sites.entry_path,
        sites.status,
        sites.file_count,
        sites.total_size,
        sites.expires_at,
        sites.api_key_id,
        sites.user_id,
        sites.created_at,
        sites.completed_at,
        users.email AS owner_email
     FROM sites
     LEFT JOIN users ON users.id = sites.user_id
     ${filters}
     ORDER BY COALESCE(sites.completed_at, sites.created_at) DESC
     LIMIT ? OFFSET ?`
  ).bind(...bindings, pageSize, offset).all();
  const total = Number(countRow?.total || 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return json({
    success: true,
    sites: (result.results || []).map((item) => ({
      id: item.id,
      name: item.name || item.id,
      publishOrigin: item.publish_origin || '',
      siteUrl: item.site_url || '',
      siteHostname: item.site_hostname || '',
      subdomain: item.subdomain || '',
      entryPath: item.entry_path || '',
      status: item.status || 'active',
      fileCount: Number(item.file_count || 0),
      totalSize: Number(item.total_size || 0),
      expiresAt: item.expires_at || null,
      apiKeyId: item.api_key_id || null,
      userId: item.user_id || null,
      ownerEmail: item.owner_email || '',
      createdAt: item.created_at || null,
      completedAt: item.completed_at || null
    })),
    meta: {
      q: query,
      status: statusFilter,
      page,
      pageSize,
      total,
      totalPages
    }
  });
}

async function handleAdminSiteDetail(request, siteId, env) {
  const session = await getSessionFromRequest(request, env);
  if (!session) return json({ error: 'Please sign in first' }, 401);
  if (!session.isAdmin) return json({ error: 'You do not have admin access' }, 403);
  await ensureSitesTables(env);
  await ensureSiteReleaseBackfill(siteId, env);
  const site = await env.DB.prepare(
    `SELECT
        sites.id,
        sites.name,
        sites.publish_origin,
        sites.site_url,
        sites.site_hostname,
        sites.subdomain,
        sites.entry_path,
        sites.status,
        sites.file_count,
        sites.total_size,
        sites.expires_at,
        sites.api_key_id,
        sites.user_id,
        sites.active_release_id,
        sites.created_at,
        sites.completed_at,
        sites.updated_at,
        users.email AS owner_email
     FROM sites
     LEFT JOIN users ON users.id = sites.user_id
     WHERE sites.id = ?`
  ).bind(siteId).first();
  if (!site) return json({ error: 'Site not found' }, 404);
  const url = new URL(request.url);
  const fileQ = String(url.searchParams.get('fileQ') || '').trim().toLowerCase();
  const fileLike = `%${fileQ}%`;
  const filePage = normalizePositiveInt(url.searchParams.get('filePage'), 1, 1, 999999);
  const filePageSize = normalizePositiveInt(url.searchParams.get('filePageSize'), 20, 1, 100);
  const fileOffset = (filePage - 1) * filePageSize;
  const fileCountRow = await env.DB.prepare(
    `SELECT COUNT(*) AS total
     FROM site_files
     WHERE site_id = ?
       AND (? = '' OR lower(relative_path) LIKE ? OR lower(file_name) LIKE ?)`
  ).bind(siteId, fileQ, fileLike, fileLike).first();
  const filesResult = await env.DB.prepare(
    `SELECT site_id, relative_path, file_id, file_name, content_type, size, created_at
     FROM site_files
     WHERE site_id = ?
       AND (? = '' OR lower(relative_path) LIKE ? OR lower(file_name) LIKE ?)
     ORDER BY relative_path ASC
     LIMIT ? OFFSET ?`
  ).bind(siteId, fileQ, fileLike, fileLike, filePageSize, fileOffset).all();
  const filesTotal = Number(fileCountRow?.total || 0);
  const releases = await listSiteReleases(siteId, env, 30);
  return json({
    success: true,
    site: {
      id: site.id,
      name: site.name || site.id,
      publishOrigin: site.publish_origin || '',
      siteUrl: site.site_url || '',
      siteHostname: site.site_hostname || '',
      subdomain: site.subdomain || '',
      entryPath: site.entry_path || '',
      status: site.status || 'active',
      fileCount: Number(site.file_count || 0),
      totalSize: Number(site.total_size || 0),
      expiresAt: site.expires_at || null,
      apiKeyId: site.api_key_id || null,
      userId: site.user_id || null,
      activeReleaseId: site.active_release_id || null,
      ownerEmail: site.owner_email || '',
      createdAt: site.created_at || null,
      completedAt: site.completed_at || null,
      updatedAt: site.updated_at || null
    },
    files: (filesResult.results || []).map((item) => ({
      siteId: item.site_id,
      relativePath: item.relative_path,
      fileId: item.file_id,
      fileName: item.file_name || '',
      contentType: item.content_type || '',
      size: Number(item.size || 0),
      createdAt: item.created_at || null
    })),
    filesMeta: {
      q: fileQ,
      page: filePage,
      pageSize: filePageSize,
      total: filesTotal,
      totalPages: Math.max(1, Math.ceil(filesTotal / filePageSize))
    },
    releases
  });
}

async function handleAdminActivateSiteRelease(request, siteId, releaseId, env) {
  const session = await getSessionFromRequest(request, env);
  if (!session) return json({ error: 'Please sign in first' }, 401);
  if (!session.isAdmin) return json({ error: 'You do not have admin access' }, 403);
  await ensureSitesTables(env);
  const existing = await env.DB.prepare('SELECT id FROM sites WHERE id = ?').bind(siteId).first();
  if (!existing) return json({ error: 'Site not found' }, 404);
  const activated = await activateSiteRelease(siteId, releaseId, env);
  if (!activated) return json({ error: 'Site release not found' }, 404);
  return json({ success: true, ...activated });
}

async function handleAdminCreateSiteUpdateLink(request, siteId, env) {
  const session = await getSessionFromRequest(request, env);
  if (!session) return json({ error: 'Please sign in first' }, 401);
  if (!session.isAdmin) return json({ error: 'You do not have admin access' }, 403);
  await ensureSitesTables(env);
  const site = await env.DB.prepare(
    `SELECT id, site_hostname, site_url
     FROM sites WHERE id = ?`
  ).bind(siteId).first();
  if (!site) return json({ error: 'Site not found' }, 404);
  const rawToken = randomToken(24);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 10 * 60 * 1000).toISOString();
  await saveJsonObject(siteUpdateTokenKey(rawToken), {
    siteId,
    issuedBy: session.email || '',
    createdAt: now.toISOString(),
    expiresAt
  }, env);
  const publicOrigin = (await getConfiguredPublishOrigin(env)) || PUBLIC_SITE_EXAMPLE_ORIGIN;
  const uploadUrl = `${publicOrigin.replace(/\/+$/, '')}/en/upload/?siteId=${encodeURIComponent(siteId)}&siteUpdateToken=${encodeURIComponent(rawToken)}`;
  return json({
    success: true,
    siteId,
    uploadUrl,
    expiresAt
  });
}

async function handleAdminExpireSite(request, siteId, env) {
  const session = await getSessionFromRequest(request, env);
  if (!session) return json({ error: 'Please sign in first' }, 401);
  if (!session.isAdmin) return json({ error: 'You do not have admin access' }, 403);
  await ensureSitesTables(env);
  const existing = await env.DB.prepare('SELECT id FROM sites WHERE id = ?').bind(siteId).first();
  if (!existing) return json({ error: 'Site not found' }, 404);
  const now = new Date().toISOString();
  await env.DB.prepare(
    'UPDATE sites SET status = ?, expires_at = ? WHERE id = ?'
  ).bind('expired', now, siteId).run();
  return json({ success: true, siteId, expiresAt: now, status: 'expired' });
}

async function handleAdminDeleteSite(request, siteId, env) {
  const session = await getSessionFromRequest(request, env);
  if (!session) return json({ error: 'Please sign in first' }, 401);
  if (!session.isAdmin) return json({ error: 'You do not have admin access' }, 403);
  await ensureSitesTables(env);
  const existing = await env.DB.prepare('SELECT id FROM sites WHERE id = ?').bind(siteId).first();
  if (!existing) return json({ error: 'Site not found' }, 404);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM site_release_files WHERE release_id IN (SELECT id FROM site_releases WHERE site_id = ?)').bind(siteId),
    env.DB.prepare('DELETE FROM site_releases WHERE site_id = ?').bind(siteId),
    env.DB.prepare('DELETE FROM site_files WHERE site_id = ?').bind(siteId),
    env.DB.prepare('DELETE FROM sites WHERE id = ?').bind(siteId)
  ]);
  return json({ success: true, siteId, deleted: true });
}

async function handleAdminDestroySite(request, siteId, env) {
  const session = await getSessionFromRequest(request, env);
  if (!session) return json({ error: 'Please sign in first' }, 401);
  if (!session.isAdmin) return json({ error: 'You do not have admin access' }, 403);
  await ensureSitesTables(env);
  const existing = await env.DB.prepare('SELECT id, name FROM sites WHERE id = ?').bind(siteId).first();
  if (!existing) return json({ error: 'Site not found' }, 404);
  await ensureSiteReleaseBackfill(siteId, env);
  const fileIds = await listSiteStoredFileIds(siteId, env);
  const retained = await listRetainedFileIdsForDeletedSite(siteId, fileIds, env);
  const deletableObjectIds = fileIds.filter((fileId) => !retained.has(fileId));
  await env.DB.batch([
    env.DB.prepare('DELETE FROM site_release_files WHERE release_id IN (SELECT id FROM site_releases WHERE site_id = ?)').bind(siteId),
    env.DB.prepare('DELETE FROM site_releases WHERE site_id = ?').bind(siteId),
    env.DB.prepare('DELETE FROM site_files WHERE site_id = ?').bind(siteId),
    env.DB.prepare('DELETE FROM sites WHERE id = ?').bind(siteId)
  ]);
  await env.FILES.delete(siteSessionKey(siteId));
  for (const objectId of deletableObjectIds) {
    await deleteStoredObject(objectId, env);
  }
  return json({
    success: true,
    siteId,
    siteName: existing.name || siteId,
    deleted: true,
    deletedSiteMapping: true,
    deletedObjectCount: deletableObjectIds.length,
    retainedObjectCount: fileIds.length - deletableObjectIds.length,
    deletedObjectIds: deletableObjectIds
  });
}

async function handleAdminUpdateSiteExpiry(request, siteId, env) {
  const session = await getSessionFromRequest(request, env);
  if (!session) return json({ error: 'Please sign in first' }, 401);
  if (!session.isAdmin) return json({ error: 'You do not have admin access' }, 403);
  await ensureSitesTables(env);
  const existing = await env.DB.prepare('SELECT id FROM sites WHERE id = ?').bind(siteId).first();
  if (!existing) return json({ error: 'Site not found' }, 404);
  let body;
  try {
    body = await request.json();
  } catch (error) {
    return json({ error: `Request body must be JSON: ${error.message}` }, 400);
  }
  const expiresAt = normalizeExpiresAt(body?.expiresAt);
  if (Number.isNaN(expiresAt)) {
    return json({ error: 'expiresAt must be a valid ISO timestamp, or null to clear it' }, 400);
  }
  if (typeof expiresAt === 'string' && new Date(expiresAt).getTime() <= Date.now()) {
    return json({ error: 'Set a future time, or use the "Expire Now" button' }, 400);
  }
  await env.DB.prepare(
    'UPDATE sites SET status = ?, expires_at = ? WHERE id = ?'
  ).bind('active', expiresAt, siteId).run();
  return json({ success: true, siteId, expiresAt, status: 'active' });
}

async function runScheduledCleanup(env) {
  const expiredResult = await cleanupExpiredFiles(env, {
    limit: EXPIRED_CLEANUP_BATCH_LIMIT
  });
  const untrackedResult = await auditUntrackedBucketObjects(env, {
    cleanup: true,
    sampleLimit: 10,
    staleSessionThresholdMs: STALE_UPLOAD_SESSION_TTL_MS
  });
  const sizeBackfillResult = await backfillPublishedFileSizes(env, {
    limit: 100
  });
  console.log(`[admin-cleanup] expired checked=${expiredResult.checked} deleted=${expiredResult.deleted} truncated=${expiredResult.truncated}; untracked deleted=${untrackedResult.cleanedObjects} staleSessions=${untrackedResult.cleanedStaleSessionObjects} orphanObjects=${untrackedResult.orphanObjects}; size-backfill updated=${sizeBackfillResult.updated} remaining=${sizeBackfillResult.remaining}`);
  return {
    success: true,
    expired: expiredResult,
    untracked: untrackedResult,
    sizeBackfill: sizeBackfillResult
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400'
        }
      });
    }

    if (request.method === 'GET' && (url.pathname === '/favicon.ico' || url.pathname === '/favicon.svg')) {
      return svgResponse(FAVICON_SVG);
    }

    const adminPageByPath = {
      '/': 'overview',
      '/account': 'overview',
      '/overview': 'overview',
      '/storage': 'storage',
      '/users': 'users',
      '/files': 'files',
      '/publish-origin': 'config',
      '/config': 'config',
      '/sites': 'sites',
      '/api-keys': 'api-keys',
      '/cleanup': 'cleanup',
    };
    if (request.method === 'GET' && url.pathname === '/login') {
      const session = await getSessionFromRequest(request, env);
      const nextPath = sanitizeAdminNextPath(url.searchParams.get('next'), '/');
      if (session?.isAdmin) return redirect(nextPath);
      return htmlResponse(adminLoginPage(nextPath, session ? { signedInEmail: session.email } : {}));
    }
    if (request.method === 'GET' && adminPageByPath[url.pathname]) {
      const session = await getSessionFromRequest(request, env);
      const nextPath = sanitizeAdminNextPath(`${url.pathname}${url.search}${url.hash}`, '/');
      if (!session || !session.isAdmin) return redirect(`/login?next=${encodeURIComponent(nextPath)}`);
      return htmlResponse(adminHomePage(adminPageByPath[url.pathname], {}, session));
    }
    const userDetailPageMatch = url.pathname.match(/^\/users\/([^/]+)$/);
    if (request.method === 'GET' && userDetailPageMatch) {
      const session = await getSessionFromRequest(request, env);
      const nextPath = sanitizeAdminNextPath(`${url.pathname}${url.search}${url.hash}`, '/');
      if (!session || !session.isAdmin) return redirect(`/login?next=${encodeURIComponent(nextPath)}`);
      return htmlResponse(adminHomePage('user-detail', { userId: decodeURIComponent(userDetailPageMatch[1]) }, session));
    }
    if (url.pathname === '/auth/verify' && request.method === 'GET') return handleVerify(request, env);

    if (url.pathname === '/api/auth/request-link' && request.method === 'POST') return handleAuthRequestLink(request, env);
    if (url.pathname === '/api/auth/logout' && request.method === 'POST') return handleLogout(request, env);
    if (url.pathname === '/api/account/me' && request.method === 'GET') return handleAccountMe(request, env);
    if (url.pathname === '/api/admin/api-keys' && request.method === 'GET') return handleAdminApiKeys(request, env);
    if (url.pathname === '/api/admin/users' && request.method === 'GET') return handleAdminUsers(request, env);
    if (url.pathname === '/api/admin/files' && request.method === 'GET') return handleAdminFiles(request, env);
    if (url.pathname === '/api/admin/storage-stats' && request.method === 'GET') return handleAdminStorageStats(request, env);
    if (url.pathname === '/api/admin/audit-untracked-objects' && request.method === 'GET') return handleAdminAuditUntrackedObjects(request, env);
    if (url.pathname === '/api/admin/sites' && request.method === 'GET') return handleAdminSites(request, env);
    if (url.pathname === '/api/admin/publish-domain' && request.method === 'GET') return handleAdminGetPublishDomain(request, env);
    if (url.pathname === '/api/admin/publish-domain' && request.method === 'POST') return handleAdminSetPublishDomain(request, env);
    if (url.pathname === '/api/admin/cleanup-expired' && request.method === 'POST') return handleAdminCleanupExpired(request, env);
    if (url.pathname === '/api/admin/cleanup-untracked-objects' && request.method === 'POST') return handleAdminCleanupUntrackedObjects(request, env);
    if (url.pathname === '/api/admin/backfill-published-file-sizes' && request.method === 'POST') return handleAdminBackfillPublishedFileSizes(request, env);

    const adminKeyMatch = url.pathname.match(/^\/api\/admin\/api-keys\/([^/]+)$/);
    if (adminKeyMatch && request.method === 'POST') {
      return handleAdminUpdateApiKey(request, adminKeyMatch[1], env);
    }
    const adminSiteDetailMatch = url.pathname.match(/^\/api\/admin\/sites\/([^/]+)$/);
    if (adminSiteDetailMatch && request.method === 'GET') {
      return handleAdminSiteDetail(request, adminSiteDetailMatch[1], env);
    }
    const adminUserDetailMatch = url.pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
    if (adminUserDetailMatch && request.method === 'GET') {
      return handleAdminUserDetail(request, decodeURIComponent(adminUserDetailMatch[1]), env);
    }
    if (adminUserDetailMatch && request.method === 'POST') {
      return handleAdminUpdateUser(request, decodeURIComponent(adminUserDetailMatch[1]), env);
    }
    const adminSiteUpdateLinkMatch = url.pathname.match(/^\/api\/admin\/sites\/([^/]+)\/update-link$/);
    if (adminSiteUpdateLinkMatch && request.method === 'POST') {
      return handleAdminCreateSiteUpdateLink(request, adminSiteUpdateLinkMatch[1], env);
    }
    const adminSiteReleaseMatch = url.pathname.match(/^\/api\/admin\/sites\/([^/]+)\/releases\/([^/]+)\/activate$/);
    if (adminSiteReleaseMatch && request.method === 'POST') {
      return handleAdminActivateSiteRelease(request, adminSiteReleaseMatch[1], adminSiteReleaseMatch[2], env);
    }
    const adminSiteDestroyMatch = url.pathname.match(/^\/api\/admin\/sites\/([^/]+)\/destroy$/);
    if (adminSiteDestroyMatch && request.method === 'POST') {
      return handleAdminDestroySite(request, adminSiteDestroyMatch[1], env);
    }
    const adminSiteMatch = url.pathname.match(/^\/api\/admin\/sites\/([^/]+)\/(expire|delete|expiry)$/);
    if (adminSiteMatch && request.method === 'POST') {
      if (adminSiteMatch[2] === 'expire') return handleAdminExpireSite(request, adminSiteMatch[1], env);
      if (adminSiteMatch[2] === 'delete') return handleAdminDeleteSite(request, adminSiteMatch[1], env);
      if (adminSiteMatch[2] === 'expiry') return handleAdminUpdateSiteExpiry(request, adminSiteMatch[1], env);
    }

    return htmlResponse('<h1>Not Found</h1>', 404);
  },
  async scheduled(controller, env, ctx) {
    const job = runScheduledCleanup(env);
    if (ctx?.waitUntil) {
      ctx.waitUntil(job);
      return;
    }
    await job;
  }
};
