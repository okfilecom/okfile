const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const EXPIRED_CLEANUP_BATCH_LIMIT = 200;
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
  <rect width="64" height="64" rx="14" fill="#0a0a0a"/>
  <path d="M18 18h11c10.5 0 17 5.3 17 14s-6.5 14-17 14H18V18zm10.4 21.2c5.9 0 9.6-2.6 9.6-7.2s-3.7-7.2-9.6-7.2H26v14.4h2.4z" fill="#2563eb"/>
  <path d="M48 20 35 46h-8l13-26h8z" fill="#60a5fa"/>
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
  if (size >= 1024 * 1024 * 1024) return `${(size / 1024 / 1024 / 1024).toFixed(2)} GB`;
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  if (size >= 1024) return `${(size / 1024).toFixed(0)} KB`;
  return `${size} B`;
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
      api_key_id TEXT,
      user_id TEXT,
      created_at TEXT NOT NULL
    )`
  ).run();
  try {
    await env.DB.prepare('ALTER TABLE published_files ADD COLUMN size INTEGER NOT NULL DEFAULT 0').run();
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

async function collectBucketStorageStats(env) {
  let cursor;
  let totalObjects = 0;
  let totalBytes = 0;
  let internalObjects = 0;
  let internalBytes = 0;
  let userObjects = 0;
  let userBytes = 0;
  do {
    const listed = await env.FILES.list({ cursor, limit: R2_LIST_PAGE_LIMIT });
    for (const object of listed.objects || []) {
      const size = Number(object.size || 0);
      totalObjects += 1;
      totalBytes += size;
      if (isInternalBucketKey(object.key)) {
        internalObjects += 1;
        internalBytes += size;
      } else {
        userObjects += 1;
        userBytes += size;
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
    userBytes
  };
}

async function collectStorageStats(env) {
  await ensureSitesTables(env);
  await ensurePublishedFilesTable(env);
  const now = new Date().toISOString();
  const summaryRow = await env.DB.prepare(
    `WITH referenced_objects AS (
       SELECT file_id, MAX(size) AS size
       FROM (
         SELECT id AS file_id, size FROM published_files
         UNION ALL
         SELECT file_id, size FROM site_files
         UNION ALL
         SELECT file_id, size FROM site_release_files
       ) refs
       GROUP BY file_id
     )
     SELECT
       (SELECT COUNT(*) FROM published_files) AS published_file_count,
       (SELECT COALESCE(SUM(size), 0) FROM published_files) AS published_file_bytes,
       (SELECT COUNT(*) FROM sites) AS site_count,
       (SELECT COUNT(*) FROM sites WHERE NOT (status = 'expired' OR (expires_at IS NOT NULL AND expires_at <= ?))) AS active_site_count,
       (SELECT COALESCE(SUM(total_size), 0) FROM sites WHERE NOT (status = 'expired' OR (expires_at IS NOT NULL AND expires_at <= ?))) AS active_site_bytes,
       (SELECT COUNT(*) FROM site_releases) AS release_count,
       (SELECT COUNT(*) FROM referenced_objects) AS referenced_object_count,
       (SELECT COALESCE(SUM(size), 0) FROM referenced_objects) AS referenced_object_bytes`
  ).bind(now, now).first();
  const bucket = await collectBucketStorageStats(env);
  return {
    success: true,
    counts: {
      publishedFiles: Number(summaryRow?.published_file_count || 0),
      sites: Number(summaryRow?.site_count || 0),
      activeSites: Number(summaryRow?.active_site_count || 0),
      releases: Number(summaryRow?.release_count || 0),
      referencedObjects: Number(summaryRow?.referenced_object_count || 0)
    },
    bytes: {
      publishedFiles: Number(summaryRow?.published_file_bytes || 0),
      activeSites: Number(summaryRow?.active_site_bytes || 0),
      referencedObjects: Number(summaryRow?.referenced_object_bytes || 0),
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

async function getUserByEmail(email, env) {
  return env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(normalizeEmail(email)).first();
}

async function getUserById(id, env) {
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

async function sendMagicLink(email, request, env) {
  if (!env.RESEND_API_KEY) throw new Error('缺少 RESEND_API_KEY');
  if (!env.RESEND_FROM_EMAIL) throw new Error('缺少 RESEND_FROM_EMAIL');
  const user = await createOrGetUser(email, env);
  const rawToken = randomToken(32);
  const tokenHash = await sha256Hex(rawToken);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + MAGIC_LINK_TTL_MS).toISOString();
  await env.DB.prepare(
    'INSERT INTO magic_links (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)'
  ).bind(`ml_${generateId(16)}`, user.id, tokenHash, expiresAt, now.toISOString()).run();

  const verifyUrl = `${new URL(request.url).origin}/auth/verify?token=${encodeURIComponent(rawToken)}`;
  const payload = {
    from: env.RESEND_FROM_EMAIL,
    to: [normalizeEmail(email)],
    subject: 'OkFile 管理后台登录链接',
    html: `<div style="font-family:Arial,sans-serif;line-height:1.7;color:#111">
      <h2>登录 OkFile 管理后台</h2>
      <p>点击下面的链接完成邮箱验证并登录：</p>
      <p><a href="${verifyUrl}" style="display:inline-block;padding:12px 18px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px">验证并登录</a></p>
      <p>如果按钮无法点击，请复制这个链接到浏览器打开：</p>
      <p>${verifyUrl}</p>
      <p>链接有效期 15 分钟。</p>
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
    throw new Error(`发送邮件失败: ${errorText}`);
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
  if (!link) return { error: '验证链接不存在或已失效' };
  if (link.used_at) return { error: '验证链接已使用' };
  if (new Date(link.expires_at).getTime() < Date.now()) return { error: '验证链接已过期' };

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
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<meta name="robots" content="noindex,nofollow">
<meta name="theme-color" content="#0a0a0a">
<link rel="icon" href="/favicon.ico" type="image/svg+xml">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;background:#0a0a0a;color:#e5e5e5;min-height:100vh;padding:32px 16px}
.wrap{max-width:1080px;margin:0 auto}
.topbar{display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;gap:12px;flex-wrap:wrap}
.brand{font-size:24px;font-weight:700;color:#fff;text-decoration:none}
.brand span{color:#2563eb}
.nav{display:flex;gap:10px;flex-wrap:wrap}
.nav a,.nav button{padding:10px 16px;border-radius:10px;border:1px solid #2b2b2b;background:#111;color:#cfcfcf;text-decoration:none;cursor:pointer}
.nav a:hover,.nav button:hover{border-color:#2563eb;color:#fff}
.card{background:#111;border:1px solid #222;border-radius:16px;padding:24px;margin-bottom:18px}
.card h1,.card h2{font-size:22px;color:#fff;margin-bottom:8px}
.muted{color:#8a8a8a;font-size:14px;line-height:1.6}
.hidden{display:none}
.field{margin-top:14px}
.field label{display:block;font-size:13px;color:#aaa;margin-bottom:8px}
.field input,.field select{width:100%;padding:12px 14px;border-radius:10px;border:1px solid #2b2b2b;background:#0b0b0b;color:#f5f5f5}
.btn-primary{margin-top:14px;padding:12px 16px;border-radius:10px;border:none;background:#2563eb;color:#fff;cursor:pointer;font-weight:600}
.btn-primary:hover{background:#1d4ed8}
.btn-primary:disabled{opacity:.6;cursor:not-allowed}
.btn-secondary,.btn-danger{display:inline-flex;align-items:center;justify-content:center;padding:8px 12px;border-radius:8px;border:1px solid #2b2b2b;background:#111;color:#e5e5e5;cursor:pointer;text-decoration:none;font-size:12px}
.btn-secondary:hover{border-color:#2563eb;color:#fff}
.btn-danger{border-color:#4b1d1d;color:#fecaca;background:#1a0f0f}
.btn-danger:hover{border-color:#b91c1c;color:#fff}
.msg{margin-top:14px;font-size:14px;color:#86efac}
.err{margin-top:14px;font-size:14px;color:#f87171}
.note{margin-top:12px;padding:12px;border-radius:10px;background:#17255422;border:1px solid #1d4ed855;color:#bfdbfe;font-size:13px}
.mono{font-family:Consolas,'SF Mono',monospace;word-break:break-all}
table{width:100%;border-collapse:collapse;margin-top:14px}
th,td{border-bottom:1px solid #222;padding:10px 8px;text-align:left;font-size:13px;vertical-align:top}
th{color:#999}
td input,td select{width:100%;padding:8px 10px;border-radius:8px;border:1px solid #2b2b2b;background:#0b0b0b;color:#f5f5f5}
.action-row{display:flex;gap:8px;flex-wrap:wrap}
.inline-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.inline-row input,.inline-row select{width:auto;min-width:120px}
.pager{display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin-top:12px}
.pager-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.site-detail{margin-top:16px;padding:16px;border-radius:12px;background:#0d0d0d;border:1px solid #202020}
.site-detail h3{font-size:18px;margin-bottom:8px}
.site-detail-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin:12px 0}
.site-detail-grid .item{padding:10px 12px;border-radius:10px;background:#131313;border:1px solid #202020}
.site-detail-grid .item .k{font-size:12px;color:#909090}
.site-detail-grid .item .v{font-size:13px;color:#f2f2f2;margin-top:4px;word-break:break-word}
.file-path{font-family:Consolas,'SF Mono',monospace;font-size:12px;word-break:break-all}
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

function adminHomePage() {
  return accountShell(
    'OkFile 管理后台',
    `<div class="topbar">
      <a class="brand" href="${PUBLIC_SITE_EXAMPLE_ORIGIN}/" id="publicHomeLink">Ok<span>File</span></a>
      <div class="nav">
        <a href="${PUBLIC_SITE_EXAMPLE_ORIGIN}/zh/account/" id="publicAccountLink">主站账户中心</a>
        <a href="${PUBLIC_SITE_EXAMPLE_ORIGIN}/zh/upload/" id="publicUploadLink">人工上载</a>
        <button id="logoutBtn" class="hidden">退出登录</button>
      </div>
    </div>

    <div class="card" id="authCard">
      <h1>管理员登录</h1>
      <p class="muted">页面和文档里的链接示例仍保持 <code>${PUBLIC_SITE_EXAMPLE_ORIGIN}</code>。真正发布给外部用户的链接域名可在后台单独配置。后台继续使用 <code>admin.okfile.com</code> 独立部署。</p>
      <div class="field">
        <label for="email">邮箱地址</label>
        <input id="email" type="email" placeholder="you@example.com">
      </div>
      <button class="btn-primary" id="sendLinkBtn">发送登录链接</button>
      <div class="msg hidden" id="authMsg"></div>
      <div class="err hidden" id="authErr"></div>
    </div>

    <div class="card hidden" id="forbiddenCard">
      <h1>没有管理员权限</h1>
      <p class="muted">当前登录邮箱 <code id="forbiddenEmail"></code> 不在 <code>ADMIN_EMAILS</code> 白名单中。</p>
      <div class="err" id="forbiddenMsg">如需访问后台，请先把该邮箱加入管理员白名单后重新登录。</div>
    </div>

    <div class="card hidden" id="dashboardCard">
      <h1>管理员后台</h1>
      <p class="muted">这里可以管理发布域名、查看站点子域名、调整 API Key 限制，并查看系统存储占用、估算月度存储费用、清理过期文件。</p>
      <div class="note">当前登录邮箱：<span id="currentUser" class="mono"></span></div>
      <div class="msg hidden" id="adminMsg"></div>
      <div class="err hidden" id="adminErr"></div>
      <div class="card" style="margin-top:16px;margin-bottom:16px">
        <div class="inline-row" style="justify-content:space-between;align-items:flex-start">
          <div>
            <h2>系统存储概览</h2>
            <p class="muted">同时展示当前 R2 桶实际占用、业务文件对象占用，以及按标准存储单价估算的月度费用。</p>
          </div>
          <button class="btn-secondary" id="refreshStorageStatsBtn" type="button">刷新统计</button>
        </div>
        <div id="storageStatsWrap" class="muted" style="margin-top:12px">正在加载系统存储统计...</div>
      </div>
      <div class="card" style="margin-top:16px;margin-bottom:16px">
        <h2>发布域名</h2>
      <p class="muted">这里配置上传完成后 <code>url</code>、<code>downloadUrl</code>、<code>playUrl</code> 使用的对外域名，例如 <code>ok26.org</code>。页面和文档中的示例仍使用 <code>${PUBLIC_SITE_EXAMPLE_ORIGIN}</code>。</p>
        <div class="field">
          <label for="publishOrigin">发布域名或完整 Origin</label>
          <input id="publishOrigin" type="text" placeholder="例如：ok26.org 或 https://ok26.org">
        </div>
        <button class="btn-primary" id="savePublishOriginBtn">保存发布域名</button>
        <div class="note" id="publishOriginPreview">当前未配置，默认跟随实际上传接口所在域名。</div>
      </div>
      <div class="card" style="margin-top:16px;margin-bottom:16px">
        <h2>站点管理</h2>
        <p class="muted">支持搜索、分页、查看文件清单、设置过期时间，以及删除站点映射或彻底删除整个网站。彻底删除会尝试清理未被其它记录复用的底层文件对象。</p>
        <div class="note" id="siteManageHint">站点子域名会使用当前发布域名，例如 st-xxxx.ok26.org。</div>
        <div class="inline-row" style="margin-top:14px">
          <input id="siteQuery" type="text" placeholder="搜索站点名、子域名、邮箱或站点 ID">
          <select id="siteStatusFilter">
            <option value="all">全部状态</option>
            <option value="active">仅 active</option>
            <option value="expired">仅 expired</option>
          </select>
          <select id="sitePageSize">
            <option value="10">10 / 页</option>
            <option value="20" selected>20 / 页</option>
            <option value="50">50 / 页</option>
          </select>
          <button class="btn-primary" id="siteSearchBtn" style="margin-top:0">查询</button>
          <button class="btn-secondary" id="siteResetBtn" type="button">重置</button>
        </div>
        <div id="siteTableWrap" class="muted">正在加载站点...</div>
        <div id="siteDetailWrap" class="hidden"></div>
      </div>
      <div class="card" style="margin-top:16px;margin-bottom:16px">
        <h2>API Key 管理</h2>
        <p class="muted">查看注册用户、调整 API Key 状态和配额限制。</p>
        <div id="adminTableWrap" class="muted">正在加载...</div>
      </div>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:16px 0 18px">
        <label class="muted" for="cleanupLimit">本次检查数量</label>
        <input id="cleanupLimit" type="number" min="1" max="1000" value="${EXPIRED_CLEANUP_BATCH_LIMIT}" style="width:120px">
        <button class="btn-primary" id="cleanupBtn">立即清理过期文件</button>
        <span class="muted" id="cleanupResult">尚未执行清理</span>
      </div>
    </div>`,
    `const $=(id)=>document.getElementById(id);
const authCard=$('authCard');
const forbiddenCard=$('forbiddenCard');
const dashboardCard=$('dashboardCard');
const logoutBtn=$('logoutBtn');
const siteState={page:1,pageSize:20,q:'',status:'all',selectedSiteId:'',detailPage:1,detailPageSize:20,detailQ:''};
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
  $('publicAccountLink').href = base + '/zh/account/';
  $('publicUploadLink').href = base + '/zh/upload/';
}
function formatReleaseSummary(summary){
  if(!summary) return '首次发布或缺少变更摘要';
  const parts = [];
  if(Number.isFinite(summary.added)) parts.push('新增 ' + summary.added);
  if(Number.isFinite(summary.modified)) parts.push('修改 ' + summary.modified);
  if(Number.isFinite(summary.removed)) parts.push('删除 ' + summary.removed);
  if(Number.isFinite(summary.unchanged)) parts.push('未变 ' + summary.unchanged);
  return parts.length ? parts.join(' / ') : '首次发布或缺少变更摘要';
}
function show(el,msg){el.textContent=msg;el.classList.remove('hidden')}
function hide(el){el.textContent='';el.classList.add('hidden')}
function switchView(name){
  authCard.classList.toggle('hidden', name !== 'auth');
  forbiddenCard.classList.toggle('hidden', name !== 'forbidden');
  dashboardCard.classList.toggle('hidden', name !== 'dashboard');
  logoutBtn.classList.toggle('hidden', name === 'auth');
}
function formatTime(value){
  if(!value) return '-';
  const d=new Date(value);
  if(Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('zh-CN',{hour12:false});
}
function formatSize(size){
  if(!Number.isFinite(size) || size < 0) return 'Unknown';
  if(size >= 1024 * 1024 * 1024) return (size / 1024 / 1024 / 1024).toFixed(2) + ' GB';
  if(size >= 1024 * 1024) return (size / 1024 / 1024).toFixed(1) + ' MB';
  if(size >= 1024) return Math.round(size / 1024) + ' KB';
  return String(size) + ' B';
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
async function loadStorageStats(){
  hide($('adminErr'));
  const wrap = $('storageStatsWrap');
  wrap.textContent = '正在加载系统存储统计...';
  const data = await api('/api/admin/storage-stats');
  const counts = data.counts || {};
  const bytes = data.bytes || {};
  const objects = data.objects || {};
  const bucketCost = data.estimates?.bucketTotal || {};
  const userCost = data.estimates?.bucketUserObjects || {};
  wrap.innerHTML = '<div class="site-detail-grid">' +
    metricCard('桶总占用', formatSize(Number(bytes.bucketTotal || 0)), '对象 ' + String(objects.bucketTotal || 0) + ' 个') +
    metricCard('业务文件占用', formatSize(Number(bytes.bucketUserObjects || 0)), '对象 ' + String(objects.bucketUserObjects || 0) + ' 个') +
    metricCard('内部元数据占用', formatSize(Number(bytes.bucketInternalObjects || 0)), '对象 ' + String(objects.bucketInternalObjects || 0) + ' 个') +
    metricCard('当前单文件总量', formatSize(Number(bytes.publishedFiles || 0)), '记录 ' + String(counts.publishedFiles || 0) + ' 个') +
    metricCard('当前站点总量', formatSize(Number(bytes.activeSites || 0)), '站点 ' + String(counts.sites || 0) + ' 个，active ' + String(counts.activeSites || 0) + ' 个') +
    metricCard('历史引用对象', formatSize(Number(bytes.referencedObjects || 0)), '唯一对象 ' + String(counts.referencedObjects || 0) + ' 个，版本 ' + String(counts.releases || 0) + ' 个') +
    metricCard('预估月存储费', formatUsd(bucketCost.billableUsd || 0), '按桶总占用估算；总量 ' + Number(bucketCost.totalGb || 0).toFixed(3) + ' GB，免费额度 ' + Number(bucketCost.freeGb || 0).toFixed(0) + ' GB') +
    metricCard('业务文件月费参考', formatUsd(userCost.billableUsd || 0), '按业务对象估算；总量 ' + Number(userCost.totalGb || 0).toFixed(3) + ' GB') +
  '</div>' +
  '<div class="note">当前按标准存储单价 ' + formatUsd(bucketCost.unitUsdPerGbMonth || 0) + ' / GB-month 估算，仅包含存储，不包含请求类费用。</div>';
}
function row(item){
  if(!item.hasApiKey){
    return '<tr>' +
      '<td>' + item.ownerEmail + '</td>' +
      '<td>' + formatTime(item.userCreatedAt) + '</td>' +
      '<td><span class="muted">未生成 API Key</span></td>' +
      '<td><span class="muted">-</span></td>' +
      '<td><span class="muted">-</span></td>' +
      '<td><span class="muted">-</span></td>' +
      '<td><span class="muted">-</span></td>' +
      '<td><span class="muted">-</span></td>' +
      '<td><span class="muted">等待用户创建</span></td>' +
    '</tr>';
  }
  return '<tr>' +
    '<td>' + item.ownerEmail + '</td>' +
    '<td>' + formatTime(item.userCreatedAt) + '</td>' +
    '<td>' + item.name + '<div class="muted mono">' + item.keyPrefix + '...</div></td>' +
    '<td><select data-field="status" data-id="' + item.id + '"><option value="active"' + (item.status==='active'?' selected':'') + '>active</option><option value="disabled"' + (item.status==='disabled'?' selected':'') + '>disabled</option></select></td>' +
    '<td><input data-field="limitPreparePerWindow" data-id="' + item.id + '" type="number" min="1" value="' + item.limitPreparePerWindow + '"></td>' +
    '<td><input data-field="limitPrepareWindowSec" data-id="' + item.id + '" type="number" min="60" value="' + item.limitPrepareWindowSec + '"></td>' +
    '<td><input data-field="limitUploadCountTotal" data-id="' + item.id + '" type="number" min="1" value="' + item.limitUploadCountTotal + '"></td>' +
    '<td>' + item.uploadedCountTotal + '</td>' +
    '<td><button class="btn-primary" data-save="' + item.id + '">保存</button></td>' +
  '</tr>';
}
async function loadAdminTable(){
  hide($('adminErr'));
  const data=await api('/api/admin/api-keys');
  $('adminTableWrap').innerHTML = '<table><thead><tr><th>用户</th><th>注册时间</th><th>API Key</th><th>状态</th><th>频率次数</th><th>频率窗口(秒)</th><th>上载上限</th><th>已上载</th><th>操作</th></tr></thead><tbody>' + data.apiKeys.map(row).join('') + '</tbody></table>';
  document.querySelectorAll('[data-save]').forEach((btn)=>{
    btn.onclick = async () => {
      hide($('adminErr'));
      hide($('adminMsg'));
      const id = btn.getAttribute('data-save');
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
        show($('adminMsg'),'保存成功');
        await loadAdminTable();
      }catch(error){
        show($('adminErr'),error.message);
      }
    };
  });
}
async function loadPublishDomain(){
  const data = await api('/api/admin/publish-domain');
  $('publishOrigin').value = data.configuredOrigin || '';
  $('publishOriginPreview').textContent = data.configuredOrigin
    ? '当前对外发布域名：' + data.configuredOrigin
    : '当前未配置，默认跟随实际上传接口所在域名。页面和文档示例仍使用 ${PUBLIC_SITE_EXAMPLE_ORIGIN}。';
  $('siteManageHint').textContent = data.configuredOrigin
    ? '新发布的站点子域名将使用 ' + data.configuredOrigin + '，例如 st-xxxx.' + new URL(data.configuredOrigin).hostname
    : '站点子域名默认跟随当前上传接口所在域名。';
  syncPublicNav(effectivePublicOrigin(data));
}
function siteRow(item){
  const actions = [];
  if(item.siteUrl){
    actions.push('<a class="btn-secondary" href="' + esc(item.siteUrl) + '" target="_blank" rel="noopener">打开站点</a>');
  }
  actions.push('<button class="btn-secondary" data-update-site="' + esc(item.id) + '">更新网站</button>');
  actions.push('<button class="btn-secondary" data-view-site="' + esc(item.id) + '">详情</button>');
  actions.push('<button class="btn-secondary" data-extend-site="' + esc(item.id) + '">延长 7 天</button>');
  actions.push('<button class="btn-secondary" data-expire-site="' + esc(item.id) + '">立即失效</button>');
  actions.push('<button class="btn-danger" data-delete-site="' + esc(item.id) + '">删除映射</button>');
  actions.push('<button class="btn-danger" data-destroy-site="' + esc(item.id) + '">彻底删除</button>');
  return '<tr>' +
    '<td><div>' + esc(item.name || item.id) + '</div><div class="muted mono">' + esc(item.id) + '</div></td>' +
    '<td><div class="mono">' + esc(item.siteHostname || '-') + '</div><div class="muted">' + esc(item.siteUrl || '-') + '</div></td>' +
    '<td>' + esc(siteStatus(item)) + '</td>' +
    '<td>' + esc(item.entryPath || '-') + '</td>' +
    '<td>' + esc(String(item.fileCount || 0)) + '<div class="muted">' + esc(formatSize(Number(item.totalSize || 0))) + '</div></td>' +
    '<td><div>' + esc(item.ownerEmail || '匿名') + '</div><div class="muted">' + esc(item.publishOrigin || '-') + '</div></td>' +
    '<td><div>' + formatTime(item.createdAt) + '</div><div class="muted">完成：' + formatTime(item.completedAt) + '</div><div class="muted">过期：' + formatTime(item.expiresAt) + '</div></td>' +
    '<td><div class="action-row">' + actions.join('') + '</div></td>' +
  '</tr>';
}
function renderSitePager(meta){
  if(!meta) return '';
  return '<div class="pager">' +
    '<div class="muted">共 ' + meta.total + ' 个站点，第 ' + meta.page + ' / ' + meta.totalPages + ' 页</div>' +
    '<div class="pager-actions">' +
      '<button class="btn-secondary" id="sitePrevPage"' + (meta.page <= 1 ? ' disabled' : '') + '>上一页</button>' +
      '<button class="btn-secondary" id="siteNextPage"' + (meta.page >= meta.totalPages ? ' disabled' : '') + '>下一页</button>' +
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
  wrap.innerHTML = '<div class="site-detail muted">正在加载站点详情...</div>';
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
    '<td><a class="btn-secondary" href="' + esc(site.siteUrl + item.relativePath) + '" target="_blank" rel="noopener">打开</a></td>' +
  '</tr>').join('');
  const releaseRows = releases.map((release)=>{
    const isActive = site.activeReleaseId && site.activeReleaseId === release.id;
    const actions = isActive
      ? '<span class="muted">当前线上版本</span>'
      : '<button class="btn-secondary" data-activate-release="' + esc(release.id) + '">切换到此版本</button>';
    return '<tr>' +
      '<td><div>V' + esc(String(release.versionNo || 0)) + '</div><div class="muted mono">' + esc(release.id) + '</div></td>' +
      '<td>' + esc(release.status || 'ready') + '</td>' +
      '<td>' + esc(release.entryPath || '-') + '</td>' +
      '<td>' + esc(String(release.fileCount || 0)) + '<div class="muted">' + esc(formatSize(Number(release.totalSize || 0))) + '</div></td>' +
      '<td><div>' + formatTime(release.completedAt) + '</div><div class="muted">' + esc(formatReleaseSummary(release.changeSummary)) + '</div></td>' +
      '<td><div class="action-row">' + actions + '</div></td>' +
    '</tr>';
  }).join('');
  wrap.innerHTML = '<div class="site-detail">' +
    '<h3>站点详情</h3>' +
    '<div class="site-detail-grid">' +
      '<div class="item"><div class="k">站点</div><div class="v">' + esc(site.name || site.id) + '</div></div>' +
      '<div class="item"><div class="k">站点 ID</div><div class="v mono">' + esc(site.id) + '</div></div>' +
      '<div class="item"><div class="k">子域名</div><div class="v mono">' + esc(site.siteHostname || '-') + '</div></div>' +
      '<div class="item"><div class="k">入口文件</div><div class="v">' + esc(site.entryPath || '-') + '</div></div>' +
      '<div class="item"><div class="k">状态</div><div class="v">' + esc(siteStatus(site)) + '</div></div>' +
      '<div class="item"><div class="k">归属</div><div class="v">' + esc(site.ownerEmail || '匿名') + '</div></div>' +
      '<div class="item"><div class="k">当前版本</div><div class="v">' + esc(site.activeReleaseId || '-') + '</div></div>' +
    '</div>' +
    '<div class="inline-row" style="margin:10px 0 14px">' +
      '<input id="siteExpiryInput" type="datetime-local" value="' + esc(expiresValue) + '">' +
      '<button class="btn-primary" id="siteSaveExpiryBtn" style="margin-top:0">保存过期时间</button>' +
      '<button class="btn-secondary" id="siteClearExpiryBtn" type="button">清除过期时间</button>' +
      (site.siteUrl ? '<a class="btn-secondary" href="' + esc(site.siteUrl) + '" target="_blank" rel="noopener">打开站点</a>' : '') +
      '<button class="btn-secondary" id="siteOpenUpdateBtn" type="button">更新网站</button>' +
      '<button class="btn-danger" id="siteDestroyBtn" type="button">彻底删除网站</button>' +
    '</div>' +
    '<div class="note">更新方式：点击“更新网站”后会跳转到上传页，并以当前站点 ID 创建新版本。全部文件上传完成后，站点会原子切换到新版本；这里也可以直接切回历史版本。</div>' +
    '<table><thead><tr><th>版本</th><th>状态</th><th>入口</th><th>文件数/大小</th><th>时间 / 摘要</th><th>操作</th></tr></thead><tbody>' + (releaseRows || '<tr><td colspan="6" class="muted">当前还没有版本记录。</td></tr>') + '</tbody></table>' +
    '<div class="inline-row" style="margin:10px 0 14px">' +
      '<input id="siteDetailQuery" type="text" placeholder="搜索文件路径或文件名" value="' + esc(siteState.detailQ) + '">' +
      '<select id="siteDetailPageSize">' +
        '<option value="20"' + (siteState.detailPageSize === 20 ? ' selected' : '') + '>20 / 页</option>' +
        '<option value="50"' + (siteState.detailPageSize === 50 ? ' selected' : '') + '>50 / 页</option>' +
        '<option value="100"' + (siteState.detailPageSize === 100 ? ' selected' : '') + '>100 / 页</option>' +
      '</select>' +
      '<button class="btn-secondary" id="siteDetailSearchBtn" type="button">查询文件</button>' +
    '</div>' +
    '<table><thead><tr><th>相对路径</th><th>文件名</th><th>类型</th><th>大小</th><th>操作</th></tr></thead><tbody>' + (rows || '<tr><td colspan="5" class="muted">当前没有匹配文件。</td></tr>') + '</tbody></table>' +
    '<div class="pager">' +
      '<div class="muted">文件 ' + meta.total + ' 个，第 ' + meta.page + ' / ' + meta.totalPages + ' 页</div>' +
      '<div class="pager-actions">' +
        '<button class="btn-secondary" id="siteDetailPrevPage"' + (meta.page <= 1 ? ' disabled' : '') + '>上一页</button>' +
        '<button class="btn-secondary" id="siteDetailNextPage"' + (meta.page >= meta.totalPages ? ' disabled' : '') + '>下一页</button>' +
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
      show($('adminMsg'),'站点过期时间已更新');
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
      show($('adminMsg'),'站点过期时间已清除');
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
      if(!confirm('确认切换到这个历史版本吗？当前线上站点会立即切换。')) return;
      try{
        await api('/api/admin/sites/' + encodeURIComponent(site.id) + '/releases/' + encodeURIComponent(releaseId) + '/activate',{method:'POST'});
        show($('adminMsg'),'站点版本已切换');
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
    if(!confirm('确认彻底删除这个网站吗？会删除站点映射、版本记录，并尽量清理未被其它记录引用的底层文件对象。')) return;
    try{
      const result = await api('/api/admin/sites/' + encodeURIComponent(site.id) + '/destroy',{method:'POST'});
      siteState.selectedSiteId = '';
      $('siteDetailWrap').innerHTML = '';
      $('siteDetailWrap').classList.add('hidden');
      show($('adminMsg'),'站点已彻底删除，删除对象 ' + String(result.deletedObjectCount || 0) + ' 个，保留复用对象 ' + String(result.retainedObjectCount || 0) + ' 个');
      await loadSitesTable();
      await loadStorageStats();
    }catch(error){
      show($('adminErr'),error.message);
    }
  };
}
async function loadSitesTable(){
  hide($('adminErr'));
  const data = await api('/api/admin/sites' + buildQuery({
    q: siteState.q,
    status: siteState.status,
    page: siteState.page,
    pageSize: siteState.pageSize
  }));
  if(!data.sites || !data.sites.length){
    $('siteTableWrap').innerHTML = '<div class="muted">当前没有匹配站点。</div>';
    if(siteState.selectedSiteId) await loadSiteDetail(siteState.selectedSiteId);
    return;
  }
  $('siteTableWrap').innerHTML = '<table><thead><tr><th>站点</th><th>子域名</th><th>状态</th><th>入口</th><th>文件数/大小</th><th>归属</th><th>时间</th><th>操作</th></tr></thead><tbody>' + data.sites.map(siteRow).join('') + '</tbody></table>' + renderSitePager(data.meta);
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
        show($('adminMsg'),'站点已延长 7 天');
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
      if(!confirm('确认立即失效这个站点吗？')) return;
      try{
        await api('/api/admin/sites/' + encodeURIComponent(siteId) + '/expire',{method:'POST'});
        show($('adminMsg'),'站点已立即失效');
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
      if(!confirm('确认删除这个站点映射吗？删除后子域名将无法访问，但底层文件不会被删除。')) return;
      try{
        await api('/api/admin/sites/' + encodeURIComponent(siteId) + '/delete',{method:'POST'});
        if(siteState.selectedSiteId === siteId){
          siteState.selectedSiteId = '';
          $('siteDetailWrap').innerHTML = '';
          $('siteDetailWrap').classList.add('hidden');
        }
        show($('adminMsg'),'站点映射已删除');
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
      if(!confirm('确认彻底删除这个网站吗？这会删除站点映射、历史版本，以及未被其它记录复用的底层文件对象。')) return;
      try{
        const result = await api('/api/admin/sites/' + encodeURIComponent(siteId) + '/destroy',{method:'POST'});
        if(siteState.selectedSiteId === siteId){
          siteState.selectedSiteId = '';
          $('siteDetailWrap').innerHTML = '';
          $('siteDetailWrap').classList.add('hidden');
        }
        show($('adminMsg'),'站点已彻底删除，删除对象 ' + String(result.deletedObjectCount || 0) + ' 个，保留复用对象 ' + String(result.retainedObjectCount || 0) + ' 个');
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
function setCleanupBusy(busy){
  $('cleanupBtn').disabled = busy;
  $('cleanupBtn').textContent = busy ? '清理中...' : '立即清理过期文件';
}
async function runCleanup(){
  hide($('adminErr'));
  hide($('adminMsg'));
  const rawLimit = Number($('cleanupLimit').value || ${EXPIRED_CLEANUP_BATCH_LIMIT});
  const limit = Math.max(1, Math.min(rawLimit, 1000));
  $('cleanupLimit').value = String(limit);
  setCleanupBusy(true);
  $('cleanupResult').textContent = '正在执行清理...';
  try{
    const data = await api('/api/admin/cleanup-expired',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({limit})
    });
    const extra = data.truncated && data.cursor ? '，还有下一批待处理' : '';
    $('cleanupResult').textContent = '已检查 ' + data.checked + ' 个，删除 ' + data.deleted + ' 个' + extra;
    show($('adminMsg'),'过期文件清理完成');
    await loadAdminTable();
    await loadStorageStats();
  }catch(error){
    $('cleanupResult').textContent = '清理失败';
    show($('adminErr'),error.message);
  }finally{
    setCleanupBusy(false);
  }
}
async function loadMe(){
  hide($('authErr'));
  hide($('authMsg'));
  hide($('adminErr'));
  hide($('adminMsg'));
  try{
    const me=await api('/api/account/me');
    if(!me.isAdmin){
      $('forbiddenEmail').textContent = me.email || '-';
      switchView('forbidden');
      return;
    }
    $('currentUser').textContent = me.email;
    switchView('dashboard');
    await loadStorageStats();
    await loadPublishDomain();
    await loadSitesTable();
    await loadAdminTable();
  }catch(error){
    switchView('auth');
    if(error.message && !error.message.includes('请先登录')){
      show($('authErr'),error.message);
    }
  }
}
$('sendLinkBtn').onclick = async () => {
  hide($('authMsg'));
  hide($('authErr'));
  try{
    await api('/api/auth/request-link',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:$('email').value})});
    show($('authMsg'),'验证链接已发送，请检查邮箱。');
  }catch(error){
    show($('authErr'),error.message);
  }
};
$('savePublishOriginBtn').onclick = async () => {
  hide($('adminErr'));
  hide($('adminMsg'));
  try{
    const data = await api('/api/admin/publish-domain',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({publishOrigin:$('publishOrigin').value})
    });
    $('publishOrigin').value = data.configuredOrigin || '';
    $('publishOriginPreview').textContent = data.configuredOrigin
      ? '当前对外发布域名：' + data.configuredOrigin
      : '当前未配置，默认跟随实际上传接口所在域名。页面和文档示例仍使用 ${PUBLIC_SITE_EXAMPLE_ORIGIN}。';
    $('siteManageHint').textContent = data.configuredOrigin
      ? '新发布的站点子域名将使用 ' + data.configuredOrigin + '，例如 st-xxxx.' + new URL(data.configuredOrigin).hostname
      : '站点子域名默认跟随当前上传接口所在域名。';
    syncPublicNav(effectivePublicOrigin(data));
    show($('adminMsg'),'发布域名已保存');
  }catch(error){
    show($('adminErr'),error.message);
  }
};
$('siteSearchBtn').onclick = async () => {
  siteState.q = $('siteQuery').value.trim();
  siteState.status = $('siteStatusFilter').value;
  siteState.pageSize = Number($('sitePageSize').value || 20);
  siteState.page = 1;
  await loadSitesTable();
};
$('siteResetBtn').onclick = async () => {
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
$('cleanupBtn').onclick = runCleanup;
$('refreshStorageStatsBtn').onclick = loadStorageStats;
logoutBtn.onclick = async () => {
  await fetch('/api/auth/logout',{method:'POST',credentials:'same-origin'});
  location.reload();
};
loadMe();`
  );
}

async function handleAuthRequestLink(request, env) {
  let body;
  try {
    body = await request.json();
  } catch (error) {
    return json({ error: `请求体必须是 JSON: ${error.message}` }, 400);
  }
  const email = normalizeEmail(body?.email);
  if (!isEmail(email)) return json({ error: '请输入有效的邮箱地址' }, 400);
  try {
    await sendMagicLink(email, request, env);
    return json({ success: true, message: '验证链接已发送，请检查邮箱' });
  } catch (error) {
    return json({ error: error.message || '发送邮件失败' }, 500);
  }
}

async function handleVerify(request, env) {
  const url = new URL(request.url);
  const token = String(url.searchParams.get('token') || '').trim();
  if (!token) return htmlResponse('<h1>验证链接无效</h1>', 400);
  const result = await consumeMagicLink(token, env);
  if (result.error) return htmlResponse(`<h1>${escapeHtml(result.error)}</h1>`, 400);
  const sessionToken = await createSession(result.userId, env);
  return redirect('/', { 'Set-Cookie': buildSessionCookie(sessionToken, request) });
}

async function handleAccountMe(request, env) {
  const session = await getSessionFromRequest(request, env);
  if (!session) return json({ error: '请先登录' }, 401);
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
  if (!session) return json({ error: '请先登录' }, 401);
  if (!session.isAdmin) return json({ error: '没有管理员权限' }, 403);
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

async function handleAdminUpdateApiKey(request, keyId, env) {
  const session = await getSessionFromRequest(request, env);
  if (!session) return json({ error: '请先登录' }, 401);
  if (!session.isAdmin) return json({ error: '没有管理员权限' }, 403);
  let body;
  try {
    body = await request.json();
  } catch (error) {
    return json({ error: `请求体必须是 JSON: ${error.message}` }, 400);
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
  if (!session) return json({ error: '请先登录' }, 401);
  if (!session.isAdmin) return json({ error: '没有管理员权限' }, 403);
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

async function handleAdminStorageStats(request, env) {
  const session = await getSessionFromRequest(request, env);
  if (!session) return json({ error: '请先登录' }, 401);
  if (!session.isAdmin) return json({ error: '没有管理员权限' }, 403);
  return json(await collectStorageStats(env));
}

async function handleAdminGetPublishDomain(request, env) {
  const session = await getSessionFromRequest(request, env);
  if (!session) return json({ error: '请先登录' }, 401);
  if (!session.isAdmin) return json({ error: '没有管理员权限' }, 403);
  const configuredOrigin = await getConfiguredPublishOrigin(env);
  return json({
    success: true,
    configuredOrigin,
    exampleOrigin: PUBLIC_SITE_EXAMPLE_ORIGIN
  });
}

async function handleAdminSetPublishDomain(request, env) {
  const session = await getSessionFromRequest(request, env);
  if (!session) return json({ error: '请先登录' }, 401);
  if (!session.isAdmin) return json({ error: '没有管理员权限' }, 403);
  let body;
  try {
    body = await request.json();
  } catch (error) {
    return json({ error: `请求体必须是 JSON: ${error.message}` }, 400);
  }
  const rawValue = String(body?.publishOrigin || '').trim();
  if (!rawValue) {
    await ensureAppSettingsTable(env);
    await env.DB.prepare('DELETE FROM app_settings WHERE key = ?').bind(PUBLISH_DOMAIN_SETTING_KEY).run();
    return json({ success: true, configuredOrigin: null, exampleOrigin: PUBLIC_SITE_EXAMPLE_ORIGIN });
  }
  const normalized = normalizePublishOrigin(rawValue);
  if (Number.isNaN(normalized)) {
    return json({ error: '发布域名必须是域名或不带路径的完整 Origin，例如 ok26.org 或 https://ok26.org' }, 400);
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
  if (!session) return json({ error: '请先登录' }, 401);
  if (!session.isAdmin) return json({ error: '没有管理员权限' }, 403);
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
  if (!session) return json({ error: '请先登录' }, 401);
  if (!session.isAdmin) return json({ error: '没有管理员权限' }, 403);
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
  if (!site) return json({ error: '站点不存在' }, 404);
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
  if (!session) return json({ error: '请先登录' }, 401);
  if (!session.isAdmin) return json({ error: '没有管理员权限' }, 403);
  await ensureSitesTables(env);
  const existing = await env.DB.prepare('SELECT id FROM sites WHERE id = ?').bind(siteId).first();
  if (!existing) return json({ error: '站点不存在' }, 404);
  const activated = await activateSiteRelease(siteId, releaseId, env);
  if (!activated) return json({ error: '站点版本不存在' }, 404);
  return json({ success: true, ...activated });
}

async function handleAdminCreateSiteUpdateLink(request, siteId, env) {
  const session = await getSessionFromRequest(request, env);
  if (!session) return json({ error: '请先登录' }, 401);
  if (!session.isAdmin) return json({ error: '没有管理员权限' }, 403);
  await ensureSitesTables(env);
  const site = await env.DB.prepare(
    `SELECT id, site_hostname, site_url
     FROM sites WHERE id = ?`
  ).bind(siteId).first();
  if (!site) return json({ error: '站点不存在' }, 404);
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
  const uploadUrl = `${publicOrigin.replace(/\/+$/, '')}/zh/upload/?siteId=${encodeURIComponent(siteId)}&siteUpdateToken=${encodeURIComponent(rawToken)}`;
  return json({
    success: true,
    siteId,
    uploadUrl,
    expiresAt
  });
}

async function handleAdminExpireSite(request, siteId, env) {
  const session = await getSessionFromRequest(request, env);
  if (!session) return json({ error: '请先登录' }, 401);
  if (!session.isAdmin) return json({ error: '没有管理员权限' }, 403);
  await ensureSitesTables(env);
  const existing = await env.DB.prepare('SELECT id FROM sites WHERE id = ?').bind(siteId).first();
  if (!existing) return json({ error: '站点不存在' }, 404);
  const now = new Date().toISOString();
  await env.DB.prepare(
    'UPDATE sites SET status = ?, expires_at = ? WHERE id = ?'
  ).bind('expired', now, siteId).run();
  return json({ success: true, siteId, expiresAt: now, status: 'expired' });
}

async function handleAdminDeleteSite(request, siteId, env) {
  const session = await getSessionFromRequest(request, env);
  if (!session) return json({ error: '请先登录' }, 401);
  if (!session.isAdmin) return json({ error: '没有管理员权限' }, 403);
  await ensureSitesTables(env);
  const existing = await env.DB.prepare('SELECT id FROM sites WHERE id = ?').bind(siteId).first();
  if (!existing) return json({ error: '站点不存在' }, 404);
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
  if (!session) return json({ error: '请先登录' }, 401);
  if (!session.isAdmin) return json({ error: '没有管理员权限' }, 403);
  await ensureSitesTables(env);
  const existing = await env.DB.prepare('SELECT id, name FROM sites WHERE id = ?').bind(siteId).first();
  if (!existing) return json({ error: '站点不存在' }, 404);
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
  if (!session) return json({ error: '请先登录' }, 401);
  if (!session.isAdmin) return json({ error: '没有管理员权限' }, 403);
  await ensureSitesTables(env);
  const existing = await env.DB.prepare('SELECT id FROM sites WHERE id = ?').bind(siteId).first();
  if (!existing) return json({ error: '站点不存在' }, 404);
  let body;
  try {
    body = await request.json();
  } catch (error) {
    return json({ error: `请求体必须是 JSON: ${error.message}` }, 400);
  }
  const expiresAt = normalizeExpiresAt(body?.expiresAt);
  if (Number.isNaN(expiresAt)) {
    return json({ error: '过期时间必须是有效的 ISO 时间，或者传 null 清除' }, 400);
  }
  if (typeof expiresAt === 'string' && new Date(expiresAt).getTime() <= Date.now()) {
    return json({ error: '请设置未来时间，或使用“立即失效”按钮' }, 400);
  }
  await env.DB.prepare(
    'UPDATE sites SET status = ?, expires_at = ? WHERE id = ?'
  ).bind('active', expiresAt, siteId).run();
  return json({ success: true, siteId, expiresAt, status: 'active' });
}

async function runScheduledCleanup(env) {
  const result = await cleanupExpiredFiles(env, {
    limit: EXPIRED_CLEANUP_BATCH_LIMIT
  });
  console.log(`[admin-cleanup] checked=${result.checked} deleted=${result.deleted} truncated=${result.truncated}`);
  return result;
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

    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/account')) {
      return htmlResponse(adminHomePage());
    }
    if (url.pathname === '/auth/verify' && request.method === 'GET') return handleVerify(request, env);

    if (url.pathname === '/api/auth/request-link' && request.method === 'POST') return handleAuthRequestLink(request, env);
    if (url.pathname === '/api/auth/logout' && request.method === 'POST') return handleLogout(request, env);
    if (url.pathname === '/api/account/me' && request.method === 'GET') return handleAccountMe(request, env);
    if (url.pathname === '/api/admin/api-keys' && request.method === 'GET') return handleAdminApiKeys(request, env);
    if (url.pathname === '/api/admin/storage-stats' && request.method === 'GET') return handleAdminStorageStats(request, env);
    if (url.pathname === '/api/admin/sites' && request.method === 'GET') return handleAdminSites(request, env);
    if (url.pathname === '/api/admin/publish-domain' && request.method === 'GET') return handleAdminGetPublishDomain(request, env);
    if (url.pathname === '/api/admin/publish-domain' && request.method === 'POST') return handleAdminSetPublishDomain(request, env);
    if (url.pathname === '/api/admin/cleanup-expired' && request.method === 'POST') return handleAdminCleanupExpired(request, env);

    const adminKeyMatch = url.pathname.match(/^\/api\/admin\/api-keys\/([^/]+)$/);
    if (adminKeyMatch && request.method === 'POST') {
      return handleAdminUpdateApiKey(request, adminKeyMatch[1], env);
    }
    const adminSiteDetailMatch = url.pathname.match(/^\/api\/admin\/sites\/([^/]+)$/);
    if (adminSiteDetailMatch && request.method === 'GET') {
      return handleAdminSiteDetail(request, adminSiteDetailMatch[1], env);
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
