import { AwsClient } from 'aws4fetch';

const MAX_SIZE = 500 * 1024 * 1024;
const MULTIPART_THRESHOLD = 25 * 1024 * 1024;
const PART_SIZE = 10 * 1024 * 1024;
const QUICK_UPLOAD_MAX_SIZE = 5 * 1024 * 1024;
const DEFAULT_CACHE = 'public, max-age=31536000, immutable';
const PRESIGNED_EXPIRES = 3600;
const PREPARE_RATE_LIMIT = 80;
const PREPARE_RATE_WINDOW_MS = 10 * 60 * 1000;
const ANONYMOUS_RESOURCE_TTL_MS = 24 * 60 * 60 * 1000;
const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_API_KEY_PREPARE_LIMIT = 120;
const DEFAULT_API_KEY_WINDOW_SEC = 3600;
const DEFAULT_API_KEY_UPLOAD_LIMIT = 1000;
const STATIC_PAGE_BROWSER_TTL = 300;
const STATIC_PAGE_EDGE_TTL = 3600;
const STATIC_PAGE_CACHE_VERSION = 'v29';
const UPLOAD_NOTIFY_TO_EMAIL = 'sungz@163.com';
const UPLOAD_NOTIFY_DAILY_LIMIT = 10;
const UPLOAD_NOTIFY_SUBJECT_PREFIX = 'OkFile New Upload';
const EXPIRED_CLEANUP_BATCH_LIMIT = 200;
const ADMIN_PANEL_ORIGIN = 'https://admin.okfile.com';
const PUBLISH_DOMAIN_SETTING_KEY = 'publish_origin';
const META_PREFIX = '__meta__/';
const SESSION_PREFIX = '__upload_sessions__/';
const SITE_SESSION_PREFIX = '__site_sessions__/';
const SITE_UPDATE_TOKEN_PREFIX = '__site_update_tokens__/';
const BUCKET_NAME = 'okfile-files';
const SESSION_COOKIE = 'okfile_session';
const BAIDU_VERIFY_PATH = '/baidu_verify_codeva-BoYaYTJN00.html';
const BAIDU_VERIFY_CONTENT = '80b9870da59a4334909987183760b183';
const SITE_DEFAULT_ENTRY = 'index.html';
const SITE_MAX_FILES = 300;
const SITE_MAX_TOTAL_SIZE = 1024 * 1024 * 1024;
const SITE_SUBDOMAIN_PREFIX = '';
const RESERVED_SITE_SUBDOMAINS = new Set(['www', 'admin', 'api', 'send', 'smtp', 'imap', 'pop', 'mail', 'autodiscover']);

const prepareRateBuckets = new Map();

const EXT_MAP = {
  html: 'text/html; charset=utf-8',
  htm: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8',
  js: 'application/javascript; charset=utf-8',
  mjs: 'application/javascript; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
  md: 'text/markdown; charset=utf-8',
  xml: 'application/xml; charset=utf-8',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  avi: 'video/x-msvideo',
  mkv: 'video/x-matroska',
  pdf: 'application/pdf',
  json: 'application/json',
  txt: 'text/plain',
  zip: 'application/zip',
  rar: 'application/vnd.rar',
  '7z': 'application/x-7z-compressed'
};

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

function localizedHomePath(lang) {
  return lang === 'en' ? '/en/' : '/zh/';
}

function localizedUploadPath(lang) {
  return lang === 'en' ? '/en/upload/' : '/zh/upload/';
}

function localizedAccountPath(lang) {
  return lang === 'en' ? '/en/account/' : '/zh/account/';
}

function localizedAccountLoginPath(lang) {
  return localizedAccountPath(lang).replace(/\/$/, '') + '/login';
}

function textResponse(text, status = 200, extraHeaders = {}) {
  return new Response(text, {
    status,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      ...extraHeaders
    }
  });
}

function xmlResponse(xml, status = 200, extraHeaders = {}) {
  return new Response(xml, {
    status,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      ...extraHeaders
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

function pageSeoConfig(lang, pageType) {
  if (pageType === 'upload') {
    return {
      title: 'OkFile - Manual Upload',
      description: 'Manual upload page for OkFile. Upload images, videos, PDFs, common files, or a full static site folder and publish it to a dedicated subdomain. API integration remains the recommended path for agents.',
      robots: 'noindex,follow'
    };
  }
  return {
    title: 'OkFile - Agent-First File Upload and Publish Service',
    description: 'OkFile provides agent-first file upload and publish APIs with anonymous access, API keys, direct links, preview URLs, multipart uploads up to 500MB, and static site folder publishing to dedicated subdomains.',
    robots: 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1'
  };
}

function buildStructuredData(origin, currentPagePath, lang, pageType) {
  const inLanguage = 'en';
  if (pageType === 'upload') {
    return {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: 'OkFile Manual Upload and Site Publish Page',
      url: `${origin}${currentPagePath}`,
      inLanguage,
      isPartOf: {
        '@type': 'WebSite',
        name: 'OkFile',
        url: `${origin}${localizedHomePath(lang)}`
      }
    };
  }
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'OkFile',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    url: `${origin}${currentPagePath}`,
    inLanguage,
    description: 'Agent-first file upload and publish service with direct links, preview URLs, anonymous access, API key support, and static site publishing to dedicated subdomains.',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD'
    }
  };
}

function buildSeoHeadMarkup(origin, currentPagePath, lang, pageType, title, description, robots) {
  const locale = 'en_US';
  const currentUrl = `${origin}${currentPagePath}`;
  const structuredData = JSON.stringify(buildStructuredData(origin, currentPagePath, lang, pageType))
    .replace(/</g, '\\u003c');
  return (
    `  <meta name="robots" content="${escapeHtml(robots)}">\n` +
    `  <meta name="theme-color" content="#0a0a0a">\n` +
    `  <meta property="og:type" content="website">\n` +
    `  <meta property="og:site_name" content="OkFile">\n` +
    `  <meta property="og:locale" content="${locale}">\n` +
    `  <meta property="og:title" content="${escapeHtml(title)}">\n` +
    `  <meta property="og:description" content="${escapeHtml(description)}">\n` +
    `  <meta property="og:url" content="${currentUrl}">\n` +
    `  <meta name="twitter:card" content="summary">\n` +
    `  <meta name="twitter:title" content="${escapeHtml(title)}">\n` +
    `  <meta name="twitter:description" content="${escapeHtml(description)}">\n` +
    `  <link rel="canonical" href="${currentUrl}">\n` +
    `  <link rel="alternate" hreflang="en" href="${currentUrl}">\n` +
    `  <link rel="alternate" hreflang="x-default" href="${origin}${localizedHomePath('en')}">\n` +
    `  <script type="application/ld+json">${structuredData}</script>\n`
  );
}

function renderRobotsTxt(request) {
  const origin = new URL(request.url).origin;
  return textResponse(
    [
      'User-agent: *',
      'Allow: /',
      'Disallow: /api/',
      'Disallow: /account',
      'Disallow: /zh/account/',
      'Disallow: /en/account/',
      'Disallow: /admin',
      'Disallow: /auth/',
      `Sitemap: ${origin}/sitemap.xml`
    ].join('\n') + '\n'
  );
}

function renderSitemapXml(request) {
  const origin = new URL(request.url).origin;
  const pages = [
    { loc: `${origin}${localizedHomePath('en')}`, alternates: { en: `${origin}${localizedHomePath('en')}` } }
  ];
  const body = pages.map((page) => (
    '  <url>\n' +
    `    <loc>${escapeHtml(page.loc)}</loc>\n` +
    `    <xhtml:link rel="alternate" hreflang="en" href="${escapeHtml(page.alternates.en)}"/>\n` +
    `    <xhtml:link rel="alternate" hreflang="x-default" href="${escapeHtml(page.alternates.en)}"/>\n` +
    '  </url>'
  )).join('\n');
  return xmlResponse(
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' +
    `${body}\n` +
    '</urlset>\n'
  );
}

function stripLanguageSpans(html, lang) {
  if (lang === 'en') {
    return html
      .replace(/<span class="zh">[\s\S]*?<\/span>/g, '')
      .replace(/<span class="en">([\s\S]*?)<\/span>/g, '$1');
  }
  return html
    .replace(/<span class="en">[\s\S]*?<\/span>/g, '')
    .replace(/<span class="zh">([\s\S]*?)<\/span>/g, '$1');
}

async function renderLocalizedStaticPage(request, env, assetPath, lang, pageType) {
  const requestUrl = new URL(request.url);
  const currentLang = 'en';
  const currentPagePath = pageType === 'upload' ? localizedUploadPath('en') : localizedHomePath('en');
  const cache = caches.default;
  const cacheKeyUrl = new URL(request.url);
  cacheKeyUrl.pathname = `/__localized_static__/${STATIC_PAGE_CACHE_VERSION}${currentPagePath}`;
  cacheKeyUrl.search = '';
  const cacheKey = new Request(cacheKeyUrl.toString(), { method: 'GET' });
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const assetUrl = new URL(request.url);
  assetUrl.pathname = assetPath;
  // Bust stale ASSETS cache between Pages deployments for localized pages.
  assetUrl.search = '?__assetv=' + encodeURIComponent(STATIC_PAGE_CACHE_VERSION);

  let assetResponse = await env.ASSETS.fetch(new Request(assetUrl.toString(), request));
  if (assetResponse.status >= 300 && assetResponse.status < 400) {
    const location = assetResponse.headers.get('Location');
    if (location) {
      const redirectedAssetUrl = new URL(location, assetUrl.origin);
      assetResponse = await env.ASSETS.fetch(new Request(redirectedAssetUrl.toString(), request));
    }
  }
  if (!assetResponse.ok) return assetResponse;

  const origin = new URL(request.url).origin;
  const seo = pageSeoConfig(lang, pageType);

  let html = await assetResponse.text();
  html = stripLanguageSpans(html, lang);
  html = html.replace(/<html lang="[^"]+">/, `<html lang="${currentLang}">`);

  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${seo.title}</title>`);
  if (/<meta name="description" id="metaDesc" content="[^"]*">/.test(html)) {
    html = html.replace(/<meta name="description" id="metaDesc" content="[^"]*">/, `<meta name="description" id="metaDesc" content="${escapeHtml(seo.description)}">`);
  } else {
    html = html.replace('</head>', `  <meta name="description" id="metaDesc" content="${escapeHtml(seo.description)}">\n</head>`);
  }

  if (pageType === 'home') {
    html = html.replace(/href="\/upload\.html"/g, `href="${localizedUploadPath(lang)}"`);
  } else {
    html = html.replace(/href="\/">/g, `href="${localizedHomePath(lang)}">`);
  }
  html = html.replace(/href="\/account"/g, `href="${localizedAccountPath(lang)}"`);

  html = html.replace(
    /<a href="#" id="langToggle"[^>]*>[\s\S]*?<\/a>/,
    ''
  );
  html = html.replace(
    /let currentLang = localStorage\.getItem\('okfile_lang'\) \|\| 'zh-CN';/,
    `let currentLang = 'en';`
  );
  html = html.replace(
    /langToggle\.addEventListener\('click',[\s\S]*?\}\);/,
    ''
  );
  html = html.replace(
    '</head>',
    buildSeoHeadMarkup(origin, currentPagePath, lang, pageType, seo.title, seo.description, seo.robots) + '</head>'
  );

  const extraHeaders = {
    'Cache-Control': `public, max-age=${STATIC_PAGE_BROWSER_TTL}, s-maxage=${STATIC_PAGE_EDGE_TTL}`
  };
  if (pageType === 'upload') extraHeaders['X-Robots-Tag'] = 'noindex, follow';
  const response = htmlResponse(html, assetResponse.status, extraHeaders);
  await cache.put(cacheKey, response.clone());
  return response;
}

function corsPreflight() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Range, X-API-Key',
      'Access-Control-Max-Age': '86400'
    }
  });
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
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function sanitizeFilename(name, options = {}) {
  const { fallback = null } = options;
  const raw = String(name ?? '');
  if (/[\u0000-\u001f\u007f]/.test(raw)) return fallback;
  const trimmed = raw.trim();
  if (!trimmed) return fallback;
  const normalized = trimmed.replace(/\\/g, '/');
  if (normalized.includes('/')) return fallback;
  if (normalized === '.' || normalized === '..') return fallback;
  return trimmed.slice(0, 200);
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
}

function contentTypeFromName(filename, providedType) {
  if (providedType && providedType !== 'application/octet-stream') return providedType;
  const ext = filename.includes('.') ? filename.split('.').pop().toLowerCase() : '';
  return (ext && EXT_MAP[ext]) || 'application/octet-stream';
}

function isImage(contentType) {
  return contentType.startsWith('image/');
}

function isVideo(contentType) {
  return contentType.startsWith('video/');
}

function isPDF(contentType) {
  return contentType === 'application/pdf';
}

function classifyContent(contentType) {
  if (isVideo(contentType)) return 'video';
  if (isPDF(contentType)) return 'pdf';
  if (isImage(contentType)) return 'image';
  return 'file';
}

function fileExtension(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized || !normalized.includes('.')) return '';
  return normalized.split('.').pop() || '';
}

function siteListingNaturalCompare(a, b) {
  return String(a || '').localeCompare(String(b || ''), 'zh-CN', {
    numeric: true,
    sensitivity: 'base'
  });
}

function siteListingParentPath(path = '') {
  const normalized = String(path || '').replace(/^\/+/, '').replace(/\/+$/, '');
  if (!normalized) return '';
  const parts = normalized.split('/').filter(Boolean);
  parts.pop();
  return parts.join('/');
}

function formatSiteListingTime(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '-';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  const pad = (input) => String(input).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function siteListingVisual(kind, contentType = '', name = '') {
  if (kind === 'directory') {
    return { icon: 'DIR', className: 'directory', label: 'Directory' };
  }
  const ext = fileExtension(name);
  if (isImage(contentType)) return { icon: 'IMG', className: 'image', label: 'Image' };
  if (isVideo(contentType)) return { icon: 'VID', className: 'video', label: 'Video' };
  if (isPDF(contentType)) return { icon: 'PDF', className: 'pdf', label: 'PDF' };
  if (contentType.startsWith('text/html') || ext === 'html' || ext === 'htm') {
    return { icon: 'HTML', className: 'code', label: 'HTML' };
  }
  if (contentType.startsWith('text/css') || ext === 'css') {
    return { icon: 'CSS', className: 'code', label: 'CSS' };
  }
  if (
    contentType.includes('javascript') ||
    contentType.includes('ecmascript') ||
    ['js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx'].includes(ext)
  ) {
    return { icon: 'JS', className: 'code', label: 'Script' };
  }
  if (contentType.startsWith('audio/')) return { icon: 'AUD', className: 'audio', label: 'Audio' };
  if (
    contentType.includes('zip') ||
    contentType.includes('compressed') ||
    ['zip', 'rar', '7z', 'tar', 'gz', 'tgz', 'bz2'].includes(ext)
  ) {
    return { icon: 'ZIP', className: 'archive', label: 'Archive' };
  }
  if (
    contentType.startsWith('text/') ||
    ['txt', 'md', 'json', 'yml', 'yaml', 'xml', 'csv', 'log'].includes(ext)
  ) {
    return { icon: 'TXT', className: 'text', label: 'Text' };
  }
  return { icon: 'FILE', className: 'file', label: 'File' };
}

function siteListingFilterCategory(kind, contentType = '', name = '') {
  if (kind === 'directory') return 'directory';
  const ext = fileExtension(name);
  if (isImage(contentType)) return 'image';
  if (isVideo(contentType)) return 'video';
  if (
    isPDF(contentType) ||
    contentType.startsWith('text/html') ||
    contentType.startsWith('text/css') ||
    contentType.includes('javascript') ||
    contentType.includes('ecmascript') ||
    ['html', 'htm', 'css', 'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx'].includes(ext)
  ) {
    return 'document';
  }
  if (
    contentType.startsWith('text/') ||
    ['txt', 'md', 'json', 'yml', 'yaml', 'xml', 'csv', 'log'].includes(ext)
  ) {
    return 'text';
  }
  return 'other';
}

function escapeHtml(value = '') {
  return value
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

function mediaUrl(id) {
  return `/raw/${id}`;
}

function controlledDownloadUrl(id) {
  return `/d/${id}`;
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

function sanitizeSiteName(name) {
  const raw = String(name || '');
  const cleaned = raw
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/[<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned ? cleaned.slice(0, 120) : 'site';
}

function methodNotAllowed(request, allowedMethods) {
  const allow = Array.isArray(allowedMethods) ? allowedMethods.join(', ') : String(allowedMethods || 'GET');
  return json({
    error: `Method ${request.method} not allowed`,
    allow
  }, 405, {
    Allow: allow
  });
}

function normalizeRelativePath(value) {
  const raw = String(value || '').replace(/\\/g, '/').trim();
  if (!raw) return NaN;
  const normalized = raw.replace(/^\.?\//, '').replace(/\/+/g, '/');
  if (!normalized || normalized.startsWith('/') || normalized.endsWith('/')) return NaN;
  const segments = normalized.split('/');
  if (!segments.length) return NaN;
  for (const segment of segments) {
    if (!segment || segment === '.' || segment === '..') return NaN;
  }
  return normalized.slice(0, 500);
}

function chooseSiteEntryPath(paths) {
  const normalized = Array.from(new Set(
    (paths || [])
      .map((value) => normalizeRelativePath(value))
      .filter((value) => typeof value === 'string')
  ));
  if (!normalized.length) return '';
  if (normalized.includes(SITE_DEFAULT_ENTRY)) return SITE_DEFAULT_ENTRY;
  return '';
}

function detectCommonTopLevelDir(paths) {
  const normalized = Array.from(new Set(
    (paths || [])
      .map((value) => normalizeRelativePath(value))
      .filter((value) => typeof value === 'string')
  ));
  if (!normalized.length) return '';
  const firstSegments = normalized.map((value) => value.split('/')[0]).filter(Boolean);
  const sharedRoot = firstSegments[0] || '';
  if (!sharedRoot) return '';
  if (!firstSegments.every((segment) => segment === sharedRoot)) return '';
  if (!normalized.every((value) => value.startsWith(`${sharedRoot}/`))) return '';
  return sharedRoot;
}

function stripCommonTopLevelDir(paths) {
  const normalized = (paths || [])
    .map((value) => normalizeRelativePath(value))
    .filter((value) => typeof value === 'string');
  const sharedRoot = detectCommonTopLevelDir(normalized);
  if (!sharedRoot) {
    return {
      sharedRoot: '',
      paths: normalized
    };
  }
  return {
    sharedRoot,
    paths: normalized.map((value) => value.slice(sharedRoot.length + 1))
  };
}

function siteSubdomainForId(siteId) {
  const suffix = String(siteId || '').toLowerCase().replace(/^st_/, '').replace(/[^a-z0-9-]/g, '');
  return `${SITE_SUBDOMAIN_PREFIX}${suffix || generateId(8)}`;
}

function siteBaseHostnameFromOrigin(origin) {
  try {
    const hostname = new URL(origin).hostname.toLowerCase();
    if (hostname.startsWith('www.') && hostname.split('.').length >= 3) {
      return hostname.slice(4);
    }
    return hostname;
  } catch {
    return 'ok26.org';
  }
}

function buildPublishedSiteLinks(origin, siteSubdomain, entryPath = SITE_DEFAULT_ENTRY) {
  const requestUrl = new URL(origin);
  const baseHostname = siteBaseHostnameFromOrigin(origin);
  const siteHostname = `${siteSubdomain}.${baseHostname}`;
  const baseUrl = `${requestUrl.protocol}//${siteHostname}/`;
  const normalizedEntryPath = normalizeRelativePath(entryPath);
  const entryUrl = !normalizedEntryPath || normalizedEntryPath === SITE_DEFAULT_ENTRY
    ? baseUrl
    : `${baseUrl}${normalizedEntryPath}`;
  return {
    siteHostname,
    siteSubdomain,
    siteUrl: baseUrl,
    entryUrl
  };
}

function siteFileContentType(relativePath, declaredType, fileName = '') {
  return contentTypeFromName(fileName || relativePath, declaredType);
}

function siteEntryDirectory(entryPath = SITE_DEFAULT_ENTRY) {
  const normalized = normalizeRelativePath(entryPath);
  if (typeof normalized !== 'string' || !normalized.includes('/')) return '';
  return normalized.slice(0, normalized.lastIndexOf('/'));
}

function decodeSitePath(value) {
  const normalized = String(value || '').replace(/\/+/g, '/');
  if (!normalized) return '';
  try {
    return normalized
      .split('/')
      .map((segment) => decodeURIComponent(segment))
      .join('/');
  } catch {
    return normalized;
  }
}

function encodeSitePath(path = '') {
  return String(path || '')
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function siteFileHref(relativePath, options = {}) {
  const encoded = encodeSitePath(relativePath);
  const suffix = options.download ? '?download=1' : '';
  return encoded ? `/${encoded}${suffix}` : `/${suffix}`;
}

function siteDirectoryHref(relativePath = '') {
  const encoded = encodeSitePath(relativePath);
  return encoded ? `/${encoded}/` : '/';
}

function sitePathCandidates(requestedPath, entryPath = SITE_DEFAULT_ENTRY) {
  const raw = String(requestedPath || '');
  if (!raw) return [entryPath];
  const normalized = decodeSitePath(raw.replace(/^\/+/, '').replace(/\/+/g, '/'));
  if (!normalized) return [entryPath];
  const entryDir = siteEntryDirectory(entryPath);
  const prefixedCandidate = (value) => {
    const normalizedValue = normalizeRelativePath(value);
    if (typeof normalizedValue !== 'string' || !entryDir) return normalizedValue;
    if (normalizedValue === entryDir || normalizedValue.startsWith(`${entryDir}/`)) {
      return normalizedValue;
    }
    return normalizeRelativePath(`${entryDir}/${normalizedValue}`);
  };
  if (normalized.endsWith('/')) {
    const candidate = normalizeRelativePath(`${normalized}index.html`);
    const scopedCandidate = prefixedCandidate(candidate);
    return Array.from(new Set([candidate, scopedCandidate].filter((value) => typeof value === 'string')));
  }
  const exact = normalizeRelativePath(normalized);
  const indexCandidate = normalizeRelativePath(`${normalized}/index.html`);
  return Array.from(new Set([
    exact,
    indexCandidate,
    prefixedCandidate(exact),
    prefixedCandidate(indexCandidate)
  ].filter((value) => typeof value === 'string')));
}

function canResolveSiteFromHostname(hostname) {
  const normalized = String(hostname || '').toLowerCase();
  if (!normalized || normalized === 'okfile.com' || normalized === 'ok26.org') return false;
  if (normalized.endsWith('.pages.dev')) return false;
  const parts = normalized.split('.');
  if (parts.length < 3) return false;
  return !RESERVED_SITE_SUBDOMAINS.has(parts[0]);
}

function getClientIp(request) {
  return request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';
}

function getClientRegion(request) {
  const cf = request?.cf || {};
  const parts = [];
  if (cf.country) parts.push(String(cf.country));
  if (cf.regionCode && String(cf.regionCode) !== String(cf.country || '')) {
    parts.push(String(cf.regionCode));
  } else if (cf.region && String(cf.region) !== String(cf.country || '')) {
    parts.push(String(cf.region));
  }
  if (cf.colo) parts.push(String(cf.colo));
  return parts.length ? parts.join(' / ') : 'Unknown';
}

function takeRateLimit(bucketMap, key, limit, windowMs) {
  const now = Date.now();
  const list = bucketMap.get(key) || [];
  const recent = list.filter((value) => now - value < windowMs);
  if (recent.length >= limit) {
    bucketMap.set(key, recent);
    return { success: false, remaining: 0, resetInMs: windowMs - (now - recent[0]) };
  }
  recent.push(now);
  bucketMap.set(key, recent);
  return { success: true, remaining: Math.max(limit - recent.length, 0), resetInMs: windowMs };
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

function accountShell(title, body, script = '', options = {}) {
  const lang = options.lang === 'en' ? 'en' : 'zh-CN';
  const robots = options.robots || 'noindex,follow';
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<meta name="robots" content="${escapeHtml(robots)}">
<meta name="theme-color" content="#f5f7fb">
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
.nav a:hover,.nav button:hover{border-color:#bccadd;background:#f8fafc;color:#0f172a}
.card{background:#fff;border:1px solid #dce4ee;border-radius:18px;padding:24px;margin-bottom:18px;box-shadow:0 12px 30px rgba(15,23,42,.06)}
.card h1,.card h2{font-size:22px;color:#0f172a;margin-bottom:8px}
.muted{color:#64748b;font-size:14px;line-height:1.6}
.hidden{display:none !important}
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
.cf-topbar-title .eyebrow{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#f48120}
.cf-topbar-title strong{color:#0f172a;font-size:18px}
.cf-topbar-title span{color:#64748b;font-size:13px}
.cf-topbar-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.cf-account-chip{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:999px;background:#fff;border:1px solid #d7dee8;color:#334155;font-size:12px;font-weight:600}
.cf-content{padding:18px 20px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px}
.field{margin-top:14px}
.field label{display:block;font-size:13px;color:#334155;margin-bottom:8px}
.field input,.field select,.field textarea{width:100%;padding:12px 14px;border-radius:12px;border:1px solid #cfd8e3;background:#fff;color:#0f172a}
.field input:focus,.field select:focus,.field textarea:focus{outline:none;border-color:#6b8ecf;box-shadow:0 0 0 3px rgba(59,130,246,.14)}
.field button,.btn-primary,.btn-secondary,.btn-ghost,.btn-danger{display:inline-flex;align-items:center;justify-content:center;gap:8px;font-weight:600;cursor:pointer;transition:.18s}
.field button,.btn-primary{margin-top:12px;padding:10px 14px;border-radius:12px;border:1px solid #1d4ed8;background:#1d4ed8;color:#fff;box-shadow:0 8px 18px rgba(29,78,216,.16)}
.field button:hover,.btn-primary:hover{background:#1e40af;border-color:#1e40af}
.btn-secondary{padding:8px 12px;border-radius:12px;border:1px solid #d7dee8;background:#fff;color:#334155}
.btn-secondary:hover{border-color:#bccadd;background:#f8fafc;color:#0f172a}
.btn-ghost{padding:8px 12px;border-radius:12px;border:1px solid transparent;background:transparent;color:#1d4ed8}
.btn-ghost:hover{background:#eff6ff;border-color:#c7d7f7;color:#1e3a8a}
.btn-danger{padding:8px 12px;border-radius:12px;border:1px solid #fecaca;background:#fff5f5;color:#b91c1c}
.btn-danger:hover{background:#fee2e2;border-color:#fca5a5;color:#991b1b}
.btn-primary:disabled,.btn-secondary:disabled,.btn-ghost:disabled,.btn-danger:disabled{opacity:.55;cursor:not-allowed}
.msg{margin-top:14px;font-size:14px;color:#15803d}
.err{margin-top:14px;font-size:14px;color:#b91c1c}
.key-list{display:grid;gap:12px;margin-top:18px}
.key-item{border:1px solid #dce4ee;border-radius:12px;padding:16px;background:#fff}
.row{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap}
.badge{display:inline-block;padding:4px 10px;border-radius:999px;background:#eff6ff;color:#1d4ed8;font-size:12px;border:1px solid #dbeafe}
.mono{font-family:Consolas,'SF Mono',monospace;word-break:break-all}
.note{margin-top:10px;padding:10px 12px;border-radius:12px;background:#f8fbff;border:1px solid #d7e6fb;color:#1d4ed8;font-size:12px}
table{width:100%;border-collapse:collapse}
th,td{border-bottom:1px solid #e7edf4;padding:11px 10px;text-align:left;font-size:13px;vertical-align:top}
th{padding:9px 10px;color:#64748b;font-size:11px;font-weight:600;letter-spacing:.02em;background:#fbfcfe}
td input,td select{width:100%;padding:8px 10px;border-radius:8px;border:1px solid #cfd8e3;background:#fff;color:#0f172a}
.hero-card{padding:22px;border-radius:20px;background:linear-gradient(135deg,#ffffff,#f8fbff);border:1px solid #dce4ee}
.hero-top{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;flex-wrap:wrap}
.hero-copy h1{font-size:30px;line-height:1.2;margin-bottom:10px}
.hero-copy p{max-width:760px}
.hero-actions{display:flex;gap:10px;flex-wrap:wrap}
.meta-line{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}
.meta-pill{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:999px;background:#f8fafc;border:1px solid #dce4ee;color:#334155;font-size:12px}
.stats-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin:18px 0}
.stat-card{padding:14px 16px;border-radius:16px;background:#fff;border:1px solid #dce4ee}
.stat-label{font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.05em}
.stat-value{margin-top:8px;font-size:28px;font-weight:700;color:#0f172a}
.stack{display:grid;gap:14px}
.section-card{padding:0;overflow:hidden}
.section-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:22px 24px 0 24px;flex-wrap:wrap}
.section-head h2{margin-bottom:6px}
.section-head p{max-width:760px}
.section-actions{display:flex;gap:10px;flex-wrap:wrap}
.section-body{padding:18px 20px 20px}
.create-panel{display:none;padding:16px 20px;border-top:1px solid #e7edf4;background:#fbfdff}
.create-panel.show{display:block}
.inline-grid{display:grid;grid-template-columns:minmax(260px,1fr) auto;gap:12px;align-items:end}
.table-wrap{overflow-x:auto;border-top:1px solid #e7edf4}
.table-toolbar{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:14px 20px;border-top:1px solid #e7edf4;flex-wrap:wrap}
.table-toolbar .toolbar-copy{max-width:720px}
.token-name{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.token-name strong{font-size:14px;color:#0f172a}
.status-pill{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:600;border:1px solid transparent}
.status-pill.active{background:#ecfdf3;color:#166534;border-color:#bbf7d0}
.status-pill.disabled{background:#f8fafc;color:#475569;border-color:#e2e8f0}
.perm-summary{max-width:360px}
.perm-summary strong{display:block;color:#334155;margin-bottom:4px}
.subtle{font-size:12px;color:#64748b;line-height:1.55}
.cell-stack{display:grid;gap:6px}
.actions-cell{display:flex;gap:8px;flex-wrap:wrap;min-width:220px}
.account-actions{position:relative;display:flex;justify-content:flex-end}
.account-actions-toggle{margin:0;padding:0;width:30px;height:30px;border-radius:9px;border:1px solid #d7dee8;background:#fff;color:#334155;cursor:pointer;font-size:16px;font-weight:700;line-height:1;transition:.18s}
.account-actions-toggle:hover{border-color:#bccadd;background:#f8fafc;color:#0f172a}
.account-actions-toggle:focus-visible{outline:none;border-color:#6b8ecf;box-shadow:0 0 0 3px rgba(59,130,246,.14)}
.account-actions.open .account-actions-toggle{border-color:#bccadd;background:#f8fafc;color:#0f172a}
.account-actions-menu{position:absolute;top:calc(100% + 6px);right:0;z-index:80;display:none;min-width:200px;padding:6px 0;border-radius:13px;border:1px solid #d7dee8;background:#fff;box-shadow:0 16px 32px rgba(15,23,42,.12)}
.account-actions.open .account-actions-menu{display:block}
.account-actions.drop-up .account-actions-menu{top:auto;bottom:calc(100% + 6px)}
.account-action-item{display:flex;align-items:center;width:100%;padding:9px 12px;border:none;background:transparent;color:#334155;text-decoration:none;text-align:left;font-size:12px;font-weight:600;cursor:pointer}
.account-action-item:hover{background:#f8fafc;color:#0f172a}
.account-action-item.danger{color:#b91c1c}
.account-action-item.danger:hover{background:#fff5f5;color:#991b1b}
.account-actions-divider{margin:6px 0;border-top:1px solid #eef2f7}
.empty-state{padding:28px 24px;color:#64748b}
.empty-state strong{display:block;color:#0f172a;font-size:16px;margin-bottom:8px}
.secret-callout{margin-top:14px;padding:14px 16px;border-radius:14px;background:#eff6ff;border:1px solid #c7d7f7}
.secret-callout strong{display:block;color:#1d4ed8;margin-bottom:8px}
.helper-list{display:grid;gap:10px}
.helper-item{padding:14px 16px;border:1px solid #dce4ee;border-radius:14px;background:#fff}
.helper-item strong{display:block;color:#0f172a;margin-bottom:6px}
.helper-item code{font-family:Consolas,'SF Mono',monospace;color:#1d4ed8}
.page-view{display:none}
.page-view.active{display:block}
.metric-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}
.metric-card{padding:16px 18px;border-radius:16px;background:#fff;border:1px solid #dce4ee}
.metric-card .k{font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.05em}
.metric-card .v{margin-top:8px;font-size:18px;font-weight:700;color:#0f172a;word-break:break-all}
.metric-card .s{margin-top:6px;font-size:12px;color:#64748b;line-height:1.55}
.overview-links{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px}
.overview-link{display:block;padding:13px 14px;border-radius:14px;border:1px solid #dce4ee;background:#fff;text-decoration:none;color:#334155}
.overview-link:hover{border-color:#c7d6ea;background:#f8fafc;color:#0f172a}
.overview-link strong{display:block;font-size:14px;color:#0f172a}
.overview-link span{display:block;font-size:12px;color:#64748b;line-height:1.5;margin-top:4px}
.inline-link{color:#1d4ed8;text-decoration:none}
.inline-link:hover{text-decoration:underline}
@media (max-width: 860px){
  .cf-shell{grid-template-columns:1fr}
  .cf-sidebar{position:static;height:auto;border-right:none;border-bottom:1px solid #dde6f0}
  .cf-topbar{padding:12px 16px}
  .cf-content{padding:14px 16px}
  .inline-grid{grid-template-columns:1fr}
  .hero-copy h1{font-size:26px}
  .actions-cell{min-width:0}
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

function localizedAccountPagePath(lang, pageKey = 'overview') {
  const base = localizedAccountPath(lang).replace(/\/$/, '');
  return pageKey === 'overview' ? `${base}/` : `${base}/${pageKey}`;
}

function sanitizeRelativeNextPath(rawValue, fallback, isAllowed) {
  const raw = String(rawValue || '').trim();
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return fallback;
  try {
    const parsed = new URL(raw, 'https://okfile.local');
    if (parsed.origin !== 'https://okfile.local') return fallback;
    const candidate = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    const basePath = parsed.pathname;
    return isAllowed(basePath, candidate) ? candidate : fallback;
  } catch {
    return fallback;
  }
}

function sanitizeAccountNextPath(rawValue, fallback = localizedAccountPagePath('en', 'overview')) {
  return sanitizeRelativeNextPath(rawValue, fallback, (basePath) => {
    if (basePath === localizedAccountLoginPath('en') || basePath === `${localizedAccountLoginPath('en')}/`) return false;
    return basePath === '/en/account'
      || basePath === '/en/account/'
      || basePath.startsWith('/en/account/');
  });
}

const ACCOUNT_PAGE_CONFIGS = {
  overview: {
    key: 'overview',
    title: 'Overview',
    subtitle: 'Personal summary across profile, storage, files, sites, and API Keys',
    eyebrow: 'Account',
  },
  profile: {
    key: 'profile',
    title: 'Profile',
    subtitle: 'Email, account ID, verification, and access level',
    eyebrow: 'Account',
  },
  storage: {
    key: 'storage',
    title: 'Storage',
    subtitle: 'Personal file and site storage totals',
    eyebrow: 'Account',
  },
  files: {
    key: 'files',
    title: 'Files',
    subtitle: 'Review uploaded files, direct links, and deletion actions',
    eyebrow: 'Files',
  },
  sites: {
    key: 'sites',
    title: 'Sites',
    subtitle: 'Review published sites, hostnames, status, and deletion actions',
    eyebrow: 'Sites',
  },
  'api-keys': {
    key: 'api-keys',
    title: 'API Keys',
    subtitle: 'Review, disable, and delete your OkFile API Keys',
    eyebrow: 'API Keys',
  },
};

let accountIndexesEnsured = false;
let publishedFilesTableEnsured = false;
let sitesTablesEnsured = false;

function getAccountPageConfig(pageKey) {
  return ACCOUNT_PAGE_CONFIGS[pageKey] || ACCOUNT_PAGE_CONFIGS.overview;
}

function accountNavLink(page, lang, key, title, desc) {
  const activeClass = page.key === key ? ' active' : '';
  return `<a class="cf-nav-link${activeClass}" href="${localizedAccountPagePath(lang, key)}"><div><strong>${escapeHtml(title)}</strong><span>${escapeHtml(desc)}</span></div></a>`;
}

function accountBreadcrumb(page) {
  return '';
}

function accountContentForPage(page, copy, lang) {
  if (page.key === 'overview') {
    return `<div class="card section-card">
      <div class="section-body">
        <div class="subtle" style="margin-bottom:14px">Use the left navigation to open a dedicated page for each account capability. Overview stays focused on summary metrics and quick entry points.</div>
      </div>
    </div>
    <div class="stats-grid" id="overviewStats"></div>
    <div class="overview-grid">
      <a class="overview-link" href="${localizedAccountPagePath(lang, 'profile')}">
        <strong>${copy.overviewManageProfile}</strong>
        <span>${copy.navProfileDesc}</span>
      </a>
      <a class="overview-link" href="${localizedAccountPagePath(lang, 'storage')}">
        <strong>${copy.navStorage}</strong>
        <span>${copy.navStorageDesc}</span>
      </a>
      <a class="overview-link" href="${localizedAccountPagePath(lang, 'files')}">
        <strong>${copy.overviewManageFiles}</strong>
        <span>${copy.navFilesDesc}</span>
      </a>
      <a class="overview-link" href="${localizedAccountPagePath(lang, 'sites')}">
        <strong>${copy.overviewManageSites}</strong>
        <span>${copy.navSitesDesc}</span>
      </a>
      <a class="overview-link" href="${localizedAccountPagePath(lang, 'api-keys')}">
        <strong>${copy.overviewManageKeys}</strong>
        <span>${copy.navKeysDesc}</span>
      </a>
    </div>`;
  }

  if (page.key === 'profile') {
    return `<div class="card section-card">
      <div class="section-body">
        <div class="metric-grid" id="profileGrid"></div>
      </div>
    </div>`;
  }

  if (page.key === 'storage') {
    return `<div class="card section-card">
      <div class="section-body">
        <div class="metric-grid" id="storageGrid"></div>
      </div>
    </div>`;
  }

  if (page.key === 'files') {
    return `<div class="card section-card">
      <div class="table-wrap" id="fileList"><div class="empty-state"><strong>Loading files...</strong><div>Please wait while OkFile loads your uploaded file records.</div></div></div>
    </div>`;
  }

  if (page.key === 'sites') {
    return `<div class="card section-card">
      <div class="table-wrap" id="siteList"><div class="empty-state"><strong>Loading sites...</strong><div>Please wait while OkFile loads your published sites.</div></div></div>
    </div>`;
  }

  if (page.key === 'api-keys') {
    return `<div class="card section-card">
      <div class="table-toolbar">
        <div class="section-actions">
          <button class="btn-primary" id="openCreateKeyBtn" type="button">${copy.openCreate}</button>
        </div>
      </div>
      <div class="create-panel" id="createKeyPanel">
        <div class="section-body">
          <div class="field" style="margin-top:0;max-width:520px">
            <label for="keyName">${copy.keyNameLabel}</label>
            <input id="keyName" type="text" placeholder="${copy.keyNamePlaceholder}" />
          </div>
          <div class="inline-row" style="margin-top:14px">
            <button class="btn-primary" id="createKeyBtn" type="button">${copy.createKey}</button>
            <button class="btn-secondary" id="cancelCreateKeyBtn" type="button">${copy.cancelCreate}</button>
          </div>
          <div class="secret-callout hidden" id="newKeyCallout" style="margin-top:18px">
            <strong>${copy.createSuccessLabel}</strong>
            <div class="mono" id="newKeyBox"></div>
          </div>
        </div>
      </div>
      <div class="table-wrap" id="keyList"><div class="empty-state"><strong>Loading API Keys...</strong><div>Please wait while OkFile loads your account keys.</div></div></div>
    </div>`;
  }

  return '';
}

function accountLoginPage(lang = 'en', nextPath = localizedAccountPagePath(lang, 'overview')) {
  const copy = {
    title: 'OkFile Sign In',
    heading: 'Sign in to OkFile',
    desc: 'Enter your email and OkFile will send a magic link from `no-reply@okfile.com`. Opening the link signs you in automatically.',
    emailLabel: 'Email',
    emailPlaceholder: 'you@example.com',
    sendLink: 'Send Magic Link',
    sendSuccess: 'Magic link sent. Please check your email.',
    home: 'Home',
    upload: 'Manual Upload'
  };
  return accountShell(
    copy.title,
    `<div class="topbar">
      <a class="brand" href="${localizedHomePath(lang)}">OkFile</a>
      <div class="nav">
        <a href="${localizedHomePath(lang)}">${copy.home}</a>
        <a href="${localizedUploadPath(lang)}">${copy.upload}</a>
      </div>
    </div>
    <div style="max-width:720px;margin:56px auto;padding:0 20px 48px">
      <div class="card" style="max-width:560px;margin:0 auto">
        <h1>${copy.heading}</h1>
        <p class="muted">${copy.desc.replace('`', '<code>').replace('`', '</code>')}</p>
        <div class="field">
          <label for="email">${copy.emailLabel}</label>
          <input id="email" type="email" placeholder="${copy.emailPlaceholder}" />
        </div>
        <button class="btn-primary" id="sendLinkBtn">${copy.sendLink}</button>
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
const sendLinkBtn=$('sendLinkBtn');
if(sendLinkBtn) sendLinkBtn.onclick = async () => {
  hide($('authMsg')); hide($('authErr'));
  try{
    await api('/api/auth/request-link',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({email:$('email').value,next:NEXT_PATH})
    });
    show($('authMsg'),${JSON.stringify(copy.sendSuccess)});
  }catch(error){
    show($('authErr'),error.message);
  }
};`,
    { lang: 'en', robots: 'noindex,follow' }
  );
}

function accountPage(lang = 'en', pageKey = 'overview', session = null, initialAccountData = null) {
  const page = getAccountPageConfig(pageKey);
  const breadcrumb = accountBreadcrumb(page);
  const copy = {
    title: 'OkFile Account',
    manualUpload: 'Manual Upload',
    adminPanel: 'Admin',
    logout: 'Logout',
    authTitle: 'Register / Login via Email',
    authDesc: 'Enter your email and OkFile will send a magic link from `no-reply@okfile.com`. Opening the link signs you in automatically.',
    emailLabel: 'Email',
    emailPlaceholder: 'you@example.com',
    sendLink: 'Send Magic Link',
    dashboardTitle: 'Account Console',
    dashboardDesc: 'Review your personal profile, storage usage, uploaded files, published sites, and API Keys from one account workspace.',
    createKeyTitle: 'Create API Key',
    keyNameLabel: 'Name',
    keyNamePlaceholder: 'Example: Desktop Client / Python Script',
    createKey: 'Create API Key',
    openCreate: 'Create Key',
    cancelCreate: 'Cancel',
    usageTitle: 'Recommended Usage',
    noKeys: 'No API Keys yet.',
    rateLimit: 'Rate limit',
    uploadQuota: 'Upload quota',
    createdAt: 'Created at',
    lastUsedAt: 'Last used',
    permissions: 'Permissions',
    tokenPrefix: 'Token prefix',
    status: 'Status',
    actions: 'Actions',
    created: 'Created',
    docsLabel: 'Docs',
    docsUrl: '/SKILL.md',
    consoleLabel: 'OkFile',
    navWorkspace: 'Overview',
    navAccess: 'Workspace',
    navContent: 'Content',
    navResources: 'Resources',
    navOverview: 'Overview',
    navOverviewDesc: 'High-level summary across profile, storage, files, sites, and keys',
    navProfile: 'Profile',
    navProfileDesc: 'Email, account ID, verification, and access level',
    navStorage: 'Storage',
    navStorageDesc: 'Personal file and site storage totals',
    navFiles: 'Files',
    navFilesDesc: 'Review your uploaded files and direct links',
    navSites: 'Sites',
    navSitesDesc: 'Review your published sites and hostnames',
    navKeys: 'API Keys',
    navKeysDesc: 'Review, disable, and delete keys',
    navUpload: 'Manual Upload',
    navUploadDesc: 'Open the browser upload workspace',
    navAdmin: 'Admin Console',
    navAdminDesc: 'Open the admin control plane',
    navDocsDesc: 'Open SKILL and integration docs',
    topbarSection: 'Account',
    guestLabel: 'Guest',
    activityNever: 'Never used',
    createPanelDesc: 'Create a named API Key for scripts, local apps, or agents. The full token is shown once only right after creation.',
    createSuccessLabel: 'New API Key',
    adminSuffix: ' (Admin)',
    sendSuccess: 'Magic link sent. Please check your email.',
    createSuccess: 'API Key created. Copy and save it now.',
    toggleDisable: 'Disable',
    toggleEnable: 'Enable',
    toggleBusy: 'Updating...',
    toggleSuccess: 'API Key status updated.',
    deleteKey: 'Delete API Key',
    deleteConfirm: 'Delete this API Key? Existing clients using it will stop working immediately.',
    deleteSuccess: 'API Key deleted.',
    deleteBusy: 'Deleting...',
    lastActiveNow: 'just now',
    filesEmpty: 'No uploaded files yet.',
    sitesEmpty: 'No published sites yet.',
    openFile: 'Open',
    downloadFile: 'Download',
    openSite: 'Open Site',
    deleteFile: 'Delete File',
    deleteSite: 'Delete Site',
    deleteFileConfirm: 'Delete this file? Its public links will stop working immediately.',
    deleteSiteConfirm: 'Delete this site? Its hostname and published content will stop working immediately.',
    deleteFileSuccess: 'File deleted.',
    deleteSiteSuccess: 'Site deleted.',
    deleteFileBusy: 'Deleting file...',
    deleteSiteBusy: 'Deleting site...',
    fileStorage: 'File Storage',
    siteStorage: 'Site Storage',
    accountRole: 'Role',
    registeredAt: 'Registered',
    verifiedAt: 'Verified',
    lastLoginAt: 'Last Login',
    userId: 'User ID',
    overviewManageFiles: 'Manage Files',
    overviewManageSites: 'Manage Sites',
    overviewManageKeys: 'Manage API Keys',
    overviewManageProfile: 'View Personal Info',
    roleAdmin: 'Admin',
    roleUser: 'User',
    manualHome: localizedHomePath(lang),
    uploadPath: localizedUploadPath(lang),
  };
  const initialEmail = session?.email || copy.guestLabel;
  const initialChip = escapeHtml(session?.email ? `${session.email}${session.isAdmin ? copy.adminSuffix : ''}` : copy.guestLabel);
  const adminLinkClass = session?.isAdmin ? 'btn-secondary' : 'btn-secondary hidden';
  const logoutClass = session ? 'btn-secondary' : 'btn-secondary hidden';
  return accountShell(
    copy.title,
    `<div class="cf-shell">
      <aside class="cf-sidebar">
        <div class="cf-sidebar-header">
          <a class="cf-sidebar-brand" href="${copy.manualHome}">
            <span class="cf-logo">O</span>
            <span class="cf-brand-copy">
              <strong>${copy.consoleLabel}</strong>
              <span id="sidebarWorkspaceLabel">${escapeHtml(initialEmail)}</span>
            </span>
          </a>
        </div>
        <nav class="cf-nav-group">
          <div class="cf-nav-title">${copy.navWorkspace}</div>
          ${accountNavLink(page, lang, 'overview', copy.navOverview, copy.navOverviewDesc)}
        </nav>
        <nav class="cf-nav-group">
          <div class="cf-nav-title">${copy.navAccess}</div>
          ${accountNavLink(page, lang, 'profile', copy.navProfile, copy.navProfileDesc)}
          ${accountNavLink(page, lang, 'storage', copy.navStorage, copy.navStorageDesc)}
          ${accountNavLink(page, lang, 'api-keys', copy.navKeys, copy.navKeysDesc)}
        </nav>
        <nav class="cf-nav-group">
          <div class="cf-nav-title">${copy.navContent}</div>
          ${accountNavLink(page, lang, 'files', copy.navFiles, copy.navFilesDesc)}
          ${accountNavLink(page, lang, 'sites', copy.navSites, copy.navSitesDesc)}
        </nav>
        <nav class="cf-nav-group">
          <div class="cf-nav-title">${copy.navResources}</div>
          <a class="cf-nav-link" href="${copy.docsUrl}" target="_blank" rel="noopener">
            <div>
              <strong>${copy.docsLabel}</strong>
              <span>${copy.navDocsDesc}</span>
            </div>
          </a>
        </nav>
      </aside>
      <main class="cf-main">
        <div class="cf-topbar">
          <div class="cf-topbar-title">
            ${breadcrumb ? `<div class="cf-breadcrumb">${breadcrumb}</div>` : ''}
            <strong>${escapeHtml(page.title)}</strong>
          </div>
          <div class="cf-topbar-actions">
            <span class="cf-account-chip" id="topAccountChip">${initialChip}</span>
            <a class="${adminLinkClass}" href="${ADMIN_PANEL_ORIGIN}/" id="adminLinkTop">${copy.adminPanel}</a>
            <button id="logoutBtn" class="${logoutClass}">${copy.logout}</button>
          </div>
        </div>
        <div class="cf-content">
          <div class="stack" id="dashboardCard">
            <div>
              <div class="msg hidden" id="accountMsg"></div>
              <div class="err hidden" id="accountErr"></div>
            </div>
            ${accountContentForPage(page, copy, lang)}
          </div>
        </div>
      </main>
    </div>`,
    `const PAGE_KEY=${JSON.stringify(page.key)};
const LOGIN_PATH=${JSON.stringify(localizedAccountLoginPath(lang))};
const INITIAL_ACCOUNT_DATA=${JSON.stringify(initialAccountData || null)};
const $=(id)=>document.getElementById(id);
const i18n=${JSON.stringify({
      noKeys: copy.noKeys,
      rateLimit: copy.rateLimit,
      uploadQuota: copy.uploadQuota,
      createdAt: copy.createdAt,
      lastUsedAt: copy.lastUsedAt,
      permissions: copy.permissions,
      tokenPrefix: copy.tokenPrefix,
      status: copy.status,
      actions: copy.actions,
      created: copy.created,
      activityNever: copy.activityNever,
      adminSuffix: copy.adminSuffix,
      sendSuccess: copy.sendSuccess,
      createSuccess: copy.createSuccess,
      createSuccessLabel: copy.createSuccessLabel,
      cancelCreate: copy.cancelCreate,
      toggleDisable: copy.toggleDisable,
      toggleEnable: copy.toggleEnable,
      toggleBusy: copy.toggleBusy,
      toggleSuccess: copy.toggleSuccess,
      deleteKey: copy.deleteKey,
      deleteConfirm: copy.deleteConfirm,
      deleteSuccess: copy.deleteSuccess,
      deleteBusy: copy.deleteBusy,
      lastActiveNow: copy.lastActiveNow,
      guestLabel: copy.guestLabel,
      filesEmpty: copy.filesEmpty,
      sitesEmpty: copy.sitesEmpty,
      openFile: copy.openFile,
      downloadFile: copy.downloadFile,
      openSite: copy.openSite,
      deleteFile: copy.deleteFile,
      deleteSite: copy.deleteSite,
      deleteFileConfirm: copy.deleteFileConfirm,
      deleteSiteConfirm: copy.deleteSiteConfirm,
      deleteFileSuccess: copy.deleteFileSuccess,
      deleteSiteSuccess: copy.deleteSiteSuccess,
      deleteFileBusy: copy.deleteFileBusy,
      deleteSiteBusy: copy.deleteSiteBusy,
      fileStorage: copy.fileStorage,
      siteStorage: copy.siteStorage,
      accountRole: copy.accountRole,
      registeredAt: copy.registeredAt,
      verifiedAt: copy.verifiedAt,
      lastLoginAt: copy.lastLoginAt,
      userId: copy.userId,
      roleAdmin: copy.roleAdmin,
      roleUser: copy.roleUser
    })};
const dashboardCard=$('dashboardCard'),logoutBtn=$('logoutBtn');
const adminLinkTop=$('adminLinkTop');
const topAccountChip=$('topAccountChip'),sidebarWorkspaceLabel=$('sidebarWorkspaceLabel');
const accountMsg=$('accountMsg'),accountErr=$('accountErr');
const newKeyBox=$('newKeyBox'),newKeyCallout=$('newKeyCallout');
const createKeyPanel=$('createKeyPanel'),openCreateKeyBtn=$('openCreateKeyBtn'),cancelCreateKeyBtn=$('cancelCreateKeyBtn');
let initialAccountDataUsed = false;
let latestCreatedApiKey = '';
function show(el,msg){ if(!el) return; el.textContent=msg; el.classList.remove('hidden'); }
function hide(el){ if(!el) return; el.textContent=''; el.classList.add('hidden'); }
function syncNewKeyCallout(){
  if(!newKeyCallout || !newKeyBox) return;
  if(latestCreatedApiKey){
    newKeyBox.textContent = latestCreatedApiKey;
    newKeyCallout.classList.remove('hidden');
    return;
  }
  newKeyBox.textContent = '';
  newKeyCallout.classList.add('hidden');
}
function applyAccountIdentity(me){
  if(!me) return;
  topAccountChip.textContent = me.email + (me.isAdmin ? i18n.adminSuffix : '');
  setSidebarWorkspaceLabel(me.email);
  if(me.isAdmin){
    if(adminLinkTop) adminLinkTop.classList.remove('hidden');
  }else{
    if(adminLinkTop) adminLinkTop.classList.add('hidden');
  }
}
function setSidebarWorkspaceLabel(value){
  if(!sidebarWorkspaceLabel) return;
  sidebarWorkspaceLabel.textContent = value || i18n.guestLabel || 'Guest';
}
function setCreateKeyPanelOpen(open){
  if(!createKeyPanel) return;
  createKeyPanel.classList.toggle('show', !!open);
  if(open){
    const input = $('keyName');
    if(input) input.focus();
  }
}
function escapeHtml(value){
  return String(value ?? '').replace(/[&<>"']/g,(char)=>({
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    '"':'&quot;',
    "'":'&#39;'
  }[char]));
}
async function api(path,init){
  const res=await fetch(path,{credentials:'same-origin',...init});
  const data=await res.json().catch(()=>null);
  if(!res.ok) throw new Error(data?.error||('HTTP '+res.status));
  return data;
}
function accountMePath(){
  if(PAGE_KEY === 'overview' || PAGE_KEY === 'storage') return '/api/account/me?detail=summary';
  if(PAGE_KEY === 'api-keys') return '/api/account/me?detail=api-keys';
  return '/api/account/me?detail=basic';
}
function formatNumber(value){
  return new Intl.NumberFormat('en-US').format(Number(value||0));
}
function formatSize(value){
  const size = Number(value || 0);
  if(!Number.isFinite(size) || size <= 0) return '0 B';
  if(size >= 1024 * 1024 * 1024) return (size / 1024 / 1024 / 1024).toFixed(2) + ' GB';
  if(size >= 1024 * 1024) return (size / 1024 / 1024).toFixed(2) + ' MB';
  if(size >= 1024) return (size / 1024).toFixed(2) + ' KB';
  return size + ' B';
}
function formatDate(value){
  if(!value) return '-';
  const date = new Date(value);
  if(Number.isNaN(date.getTime())) return escapeHtml(value);
  return date.toLocaleString('en-US',{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false});
}
function formatRelative(value){
  if(!value) return i18n.activityNever;
  const date = new Date(value);
  if(Number.isNaN(date.getTime())) return escapeHtml(value);
  const diffMs = Date.now() - date.getTime();
  if(diffMs < 60 * 1000) return i18n.lastActiveNow;
  const diffMin = Math.floor(diffMs / (60 * 1000));
  if(diffMin < 60) return diffMin + ' min ago';
  const diffHour = Math.floor(diffMin / 60);
  if(diffHour < 24) return diffHour + ' hr ago';
  const diffDay = Math.floor(diffHour / 24);
  if(diffDay < 30) return diffDay + ' day' + (diffDay === 1 ? '' : 's') + ' ago';
  const diffMonth = Math.floor(diffDay / 30);
  if(diffMonth < 12) return diffMonth + ' month' + (diffMonth === 1 ? '' : 's') + ' ago';
  const diffYear = Math.floor(diffMonth / 12);
  return diffYear + ' year' + (diffYear === 1 ? '' : 's') + ' ago';
}
function statusClass(status){
  return status === 'disabled' ? 'disabled' : 'active';
}
function metricCard(label, value, subtle){
  return '<div class="metric-card"><div class="k">' + escapeHtml(label) + '</div><div class="v">' + value + '</div>' + (subtle ? '<div class="s">' + subtle + '</div>' : '') + '</div>';
}
function renderOverview(me){
  const el = $('overviewStats');
  if(!el) return;
  const summary = me.summary || {};
  el.innerHTML =
    '<div class="stat-card"><div class="stat-label">API Keys</div><div class="stat-value">' + formatNumber(summary.apiKeyCount) + '</div><div class="muted">active ' + formatNumber(summary.activeApiKeyCount) + '</div></div>' +
    '<div class="stat-card"><div class="stat-label">Files</div><div class="stat-value">' + formatNumber(summary.fileCount) + '</div><div class="muted">' + formatSize(summary.fileBytes) + '</div></div>' +
    '<div class="stat-card"><div class="stat-label">Sites</div><div class="stat-value">' + formatNumber(summary.siteCount) + '</div><div class="muted">active ' + formatNumber(summary.activeSiteCount) + '</div></div>' +
    '<div class="stat-card"><div class="stat-label">Uploads</div><div class="stat-value">' + formatNumber(summary.uploadedCountTotal) + '</div><div class="muted">from your API Keys</div></div>';
}
function renderProfile(me){
  const el = $('profileGrid');
  if(!el) return;
  el.innerHTML =
    metricCard('Email', escapeHtml(me.email || '-'), 'Primary sign-in address') +
    metricCard(i18n.userId, '<code>' + escapeHtml(me.userId || '-') + '</code>', 'Stable account identifier') +
    metricCard(i18n.accountRole, escapeHtml(me.isAdmin ? i18n.roleAdmin : i18n.roleUser), 'Derived from current account access') +
    metricCard(i18n.registeredAt, escapeHtml(formatDate(me.createdAt)), escapeHtml(formatRelative(me.createdAt))) +
    metricCard(i18n.verifiedAt, escapeHtml(formatDate(me.verifiedAt)), me.verifiedAt ? 'Email verification completed' : 'Not verified yet') +
    metricCard(i18n.lastLoginAt, escapeHtml(formatDate(me.lastLoginAt)), escapeHtml(formatRelative(me.lastLoginAt)));
}
function renderStorage(me){
  const el = $('storageGrid');
  if(!el) return;
  const summary = me.summary || {};
  el.innerHTML =
    metricCard(i18n.fileStorage, formatSize(summary.fileBytes), formatNumber(summary.fileCount) + ' files') +
    metricCard(i18n.siteStorage, formatSize(summary.siteBytes), formatNumber(summary.siteCount) + ' sites') +
    metricCard('Uploaded via API Keys', formatNumber(summary.uploadedCountTotal), 'Successful uploads recorded on your keys') +
    metricCard('Active Keys', formatNumber(summary.activeApiKeyCount), formatNumber(summary.disabledApiKeyCount) + ' disabled');
}
function renderKeys(keys){
  const el = $('keyList');
  if(!el) return;
  if(!keys.length){
    el.innerHTML = '<div class="empty-state"><strong>' + i18n.noKeys + '</strong><div>Create your first key to start using the OkFile API from scripts, agents, or local tools.</div></div>';
    return;
  }
  el.innerHTML = \`
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>\${i18n.permissions}</th>
          <th>\${i18n.tokenPrefix}</th>
          <th>\${i18n.created}</th>
          <th>\${i18n.lastUsedAt}</th>
          <th>\${i18n.status}</th>
          <th>\${i18n.actions}</th>
        </tr>
      </thead>
      <tbody>
        \${keys.map((item)=>\`
          <tr>
            <td>
              <div class="cell-stack">
                <div class="token-name">
                  <strong>\${escapeHtml(item.name || 'Default API Key')}</strong>
                </div>
                <div class="subtle">\${i18n.rateLimit}: \${formatNumber(item.limitPreparePerWindow)} / \${formatNumber(item.limitPrepareWindowSec)}s</div>
                <div class="subtle">\${i18n.uploadQuota}: \${formatNumber(item.uploadedCountTotal)} / \${formatNumber(item.limitUploadCountTotal)}</div>
              </div>
            </td>
            <td>
              <div class="perm-summary">
                <strong>OkFile API</strong>
                <div class="subtle">Scoped for OkFile upload, quick upload, complete, status, and site publish flows</div>
              </div>
            </td>
            <td>
              <div class="cell-stack">
                <div class="mono">\${escapeHtml(item.keyPrefix)}...</div>
                <div class="subtle">Visible prefix only</div>
              </div>
            </td>
            <td>
              <div class="cell-stack">
                <div>\${formatDate(item.createdAt)}</div>
                <div class="subtle">\${formatRelative(item.createdAt)}</div>
              </div>
            </td>
            <td>
              <div class="cell-stack">
                <div>\${item.lastUsedAt ? formatDate(item.lastUsedAt) : i18n.activityNever}</div>
                <div class="subtle">\${formatRelative(item.lastUsedAt)}</div>
              </div>
            </td>
            <td><span class="status-pill \${statusClass(item.status)}">\${escapeHtml(item.status === 'disabled' ? 'Disabled' : 'Active')}</span></td>
            <td>
              \${renderKeyActionsMenu(item)}
            </td>
          </tr>
        \`).join('')}
      </tbody>
    </table>\`;
  document.querySelectorAll('[data-toggle-key]').forEach((btn)=>{
    btn.onclick = async () => {
      closeAccountActionMenus();
      hide(accountMsg); hide(accountErr);
      const originalText = btn.textContent;
      btn.disabled = true;
      btn.textContent = i18n.toggleBusy;
      try{
        await api('/api/account/api-keys/' + btn.getAttribute('data-toggle-key'),{
          method:'PATCH',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({status:btn.getAttribute('data-next-status')})
        });
        show(accountMsg,i18n.toggleSuccess);
        await loadMe();
      }catch(error){
        show(accountErr,error.message);
      }finally{
        btn.disabled = false;
        btn.textContent = originalText;
      }
    };
  });
  document.querySelectorAll('[data-delete-key]').forEach((btn)=>{
    btn.onclick = async () => {
      closeAccountActionMenus();
      if(!confirm(i18n.deleteConfirm)) return;
      hide(accountMsg); hide(accountErr);
      const originalText = btn.textContent;
      btn.disabled = true;
      btn.textContent = i18n.deleteBusy;
      try{
        await api('/api/account/api-keys/' + btn.getAttribute('data-delete-key'),{method:'DELETE'});
        show(accountMsg,i18n.deleteSuccess);
        await loadMe();
      }catch(error){
        show(accountErr,error.message);
      }finally{
        btn.disabled = false;
        btn.textContent = originalText;
      }
    };
  });
}
function renderAccountActionsMenu(items){
  return '<div class="account-actions" data-account-actions>' +
    '<button class="account-actions-toggle" type="button" data-account-menu-toggle aria-label="Open actions menu">...</button>' +
    '<div class="account-actions-menu">' + items.join('') + '</div>' +
  '</div>';
}
function renderKeyActionsMenu(item){
  return renderAccountActionsMenu([
    '<button class="account-action-item" type="button" data-toggle-key="' + escapeHtml(item.id) + '" data-next-status="' + escapeHtml(item.status === 'disabled' ? 'active' : 'disabled') + '">' + escapeHtml(item.status === 'disabled' ? i18n.toggleEnable : i18n.toggleDisable) + '</button>',
    '<div class="account-actions-divider"></div>',
    '<button class="account-action-item danger" type="button" data-delete-key="' + escapeHtml(item.id) + '">' + escapeHtml(i18n.deleteKey) + '</button>'
  ]);
}
function renderFileActionsMenu(item){
  const openUrl = item.viewUrl || item.playUrl || '';
  const items = [];
  if(openUrl) items.push('<a class="account-action-item" href="' + escapeHtml(openUrl) + '" target="_blank" rel="noopener">' + escapeHtml(i18n.openFile) + '</a>');
  if(item.downloadUrl) items.push('<a class="account-action-item" href="' + escapeHtml(item.downloadUrl) + '" target="_blank" rel="noopener">' + escapeHtml(i18n.downloadFile) + '</a>');
  if(items.length) items.push('<div class="account-actions-divider"></div>');
  items.push('<button class="account-action-item danger" type="button" data-delete-file="' + escapeHtml(item.id) + '">' + escapeHtml(i18n.deleteFile) + '</button>');
  return renderAccountActionsMenu(items);
}
function renderSiteActionsMenu(item){
  const items = [];
  if(item.siteUrl){
    items.push('<a class="account-action-item" href="' + escapeHtml(item.siteUrl) + '" target="_blank" rel="noopener">' + escapeHtml(i18n.openSite) + '</a>');
    items.push('<div class="account-actions-divider"></div>');
  }
  items.push('<button class="account-action-item danger" type="button" data-delete-site="' + escapeHtml(item.id) + '">' + escapeHtml(i18n.deleteSite) + '</button>');
  return renderAccountActionsMenu(items);
}
function closeAccountActionMenus(exceptMenu){
  document.querySelectorAll('[data-account-actions].open').forEach((menu)=>{
    if(exceptMenu && menu === exceptMenu) return;
    menu.classList.remove('open');
    menu.classList.remove('drop-up');
  });
}
function syncAccountActionMenuDirection(menu){
  if(!menu) return;
  const popup = menu.querySelector('.account-actions-menu');
  if(!popup) return;
  menu.classList.remove('drop-up');
  const hostCard = menu.closest('.section-card');
  const cardRect = hostCard ? hostCard.getBoundingClientRect() : null;
  const toggleRect = menu.getBoundingClientRect();
  const popupHeight = popup.offsetHeight || 0;
  const availableBottom = Math.min(window.innerHeight, cardRect ? cardRect.bottom : window.innerHeight);
  const availableTop = Math.max(0, cardRect ? cardRect.top : 0);
  const spaceBelow = availableBottom - toggleRect.bottom - 12;
  const spaceAbove = toggleRect.top - availableTop - 12;
  if(popupHeight > spaceBelow && spaceAbove > spaceBelow){
    menu.classList.add('drop-up');
  }
}
function renderFiles(files){
  const el = $('fileList');
  if(!el) return;
  if(!files.length){
    el.innerHTML = '<div class="empty-state"><strong>' + i18n.filesEmpty + '</strong><div>Upload a file from the browser or API and it will appear here.</div></div>';
    return;
  }
  el.innerHTML = '<table><thead><tr><th>File</th><th>Type</th><th>Size</th><th>Published / Source</th><th>Actions</th></tr></thead><tbody>' + files.map((item)=>{
    const sourceParts = [];
    if (item.clientIp) sourceParts.push('IP ' + item.clientIp);
    if (item.clientRegion) sourceParts.push('Region ' + item.clientRegion);
    const fileLabel = item.fileName || item.id;
    const fileTitle = item.viewUrl
      ? '<a href="' + escapeHtml(item.viewUrl) + '" target="_blank" rel="noopener"><strong>' + escapeHtml(fileLabel) + '</strong></a>'
      : '<strong>' + escapeHtml(fileLabel) + '</strong>';
    return '<tr>' +
      '<td><div class="cell-stack">' + fileTitle + '<div class="subtle mono">' + escapeHtml(item.id) + '</div></div></td>' +
      '<td>' + escapeHtml(item.contentType || '-') + '</td>' +
      '<td>' + escapeHtml(formatSize(item.size)) + '</td>' +
      '<td><div class="cell-stack"><div>' + escapeHtml(formatDate(item.createdAt)) + '</div><div class="subtle">' + escapeHtml(sourceParts.join(' | ') || '-') + '</div></div></td>' +
      '<td>' + renderFileActionsMenu(item) + '</td>' +
    '</tr>';
  }).join('') + '</tbody></table>';
}
function renderSites(sites){
  const el = $('siteList');
  if(!el) return;
  if(!sites.length){
    el.innerHTML = '<div class="empty-state"><strong>' + i18n.sitesEmpty + '</strong><div>Publish a folder as a site and it will appear here.</div></div>';
    return;
  }
  el.innerHTML = '<table><thead><tr><th>Site</th><th>Hostname</th><th>Status</th><th>Files / Size</th><th>Updated</th><th>Actions</th></tr></thead><tbody>' + sites.map((item)=>{
    const nowExpired = item.expiresAt && new Date(item.expiresAt).getTime() <= Date.now();
    const status = nowExpired ? 'Expired' : (item.status === 'disabled' ? 'Disabled' : 'Active');
    const siteNameLink = item.siteUrl
      ? '<a href="' + escapeHtml(item.siteUrl) + '" target="_blank" rel="noopener"><strong>' + escapeHtml(item.name || item.id) + '</strong></a>'
      : '<strong>' + escapeHtml(item.name || item.id) + '</strong>';
    const siteLabel = item.siteHostname || item.subdomain || '-';
    const siteLink = item.siteUrl
      ? '<a class="mono" href="' + escapeHtml(item.siteUrl) + '" target="_blank" rel="noopener">' + escapeHtml(siteLabel) + '</a>'
      : '<div class="mono">' + escapeHtml(siteLabel) + '</div>';
    return '<tr>' +
      '<td><div class="cell-stack">' + siteNameLink + '<div class="subtle mono">' + escapeHtml(item.id) + '</div></div></td>' +
      '<td><div class="cell-stack">' + siteLink + '<div class="subtle">' + escapeHtml(item.siteUrl || '-') + '</div></div></td>' +
      '<td><span class="status-pill ' + (status === 'Expired' ? 'disabled' : 'active') + '">' + escapeHtml(status) + '</span></td>' +
      '<td><div class="cell-stack"><div>' + formatNumber(item.fileCount) + '</div><div class="subtle">' + escapeHtml(formatSize(item.totalSize)) + '</div></div></td>' +
      '<td><div class="cell-stack"><div>' + escapeHtml(formatDate(item.updatedAt || item.completedAt || item.createdAt)) + '</div><div class="subtle">' + escapeHtml(item.publishOrigin || '-') + '</div></div></td>' +
      '<td>' + renderSiteActionsMenu(item) + '</td>' +
    '</tr>';
  }).join('') + '</tbody></table>';
  document.querySelectorAll('[data-delete-site]').forEach((btn)=>{
    btn.onclick = async () => {
      closeAccountActionMenus();
      if(!confirm(i18n.deleteSiteConfirm)) return;
      hide(accountMsg); hide(accountErr);
      const originalText = btn.textContent;
      btn.disabled = true;
      btn.textContent = i18n.deleteSiteBusy;
      try{
        await api('/api/account/sites/' + btn.getAttribute('data-delete-site'),{method:'DELETE'});
        show(accountMsg,i18n.deleteSiteSuccess);
        await loadMe();
      }catch(error){
        show(accountErr,error.message);
      }finally{
        btn.disabled = false;
        btn.textContent = originalText;
      }
    };
  });
}
document.addEventListener('click',(event)=>{
  const toggle = event.target.closest('[data-account-menu-toggle]');
  if(toggle){
    const menu = toggle.closest('[data-account-actions]');
    const willOpen = !menu.classList.contains('open');
    closeAccountActionMenus(menu);
    menu.classList.toggle('open', willOpen);
    if(willOpen) syncAccountActionMenuDirection(menu);
    return;
  }
  const btn = event.target.closest('[data-delete-file]');
  if(btn){
    event.preventDefault();
    closeAccountActionMenus();
    (async ()=>{
      if(!confirm(i18n.deleteFileConfirm)) return;
      hide(accountMsg); hide(accountErr);
      const originalText = btn.textContent;
      btn.disabled = true;
      btn.textContent = i18n.deleteFileBusy;
      try{
        await api('/api/account/files/' + btn.getAttribute('data-delete-file'),{method:'DELETE'});
        show(accountMsg,i18n.deleteFileSuccess);
        await loadMe();
      }catch(error){
        show(accountErr,error.message);
      }finally{
        btn.disabled = false;
        btn.textContent = originalText;
      }
    })();
    return;
  }
  if(!event.target.closest('[data-account-actions]')){
    closeAccountActionMenus();
  }
});
async function loadFiles(){
  try{
    const data = await api('/api/account/files');
    renderFiles(data.files || []);
  }catch(error){
    const el = $('fileList');
    if(el) el.innerHTML = '<div class="empty-state"><strong>Failed to load files</strong><div>' + escapeHtml(error.message) + '</div></div>';
  }
}
async function loadSites(){
  try{
    const data = await api('/api/account/sites');
    renderSites(data.sites || []);
  }catch(error){
    const el = $('siteList');
    if(el) el.innerHTML = '<div class="empty-state"><strong>Failed to load sites</strong><div>' + escapeHtml(error.message) + '</div></div>';
  }
}
async function loadMe(){
  try{
    const me = (!initialAccountDataUsed && INITIAL_ACCOUNT_DATA)
      ? (initialAccountDataUsed = true, INITIAL_ACCOUNT_DATA)
      : await api(accountMePath());
    applyAccountIdentity(me);
    if(PAGE_KEY === 'overview') renderOverview(me);
    if(PAGE_KEY === 'profile') renderProfile(me);
    if(PAGE_KEY === 'storage') renderStorage(me);
    if(PAGE_KEY === 'api-keys') renderKeys(me.apiKeys || []);
    if(PAGE_KEY === 'files') await loadFiles();
    if(PAGE_KEY === 'sites') await loadSites();
  }catch(error){
    if(String(error?.message || '').includes('Please sign in first')){
      location.href = LOGIN_PATH + '?next=' + encodeURIComponent(location.pathname + location.search + location.hash);
      return;
    }
    if(adminLinkTop) adminLinkTop.classList.add('hidden');
    show(accountErr,error?.message || 'Failed to load account data');
  }
}
if(openCreateKeyBtn) openCreateKeyBtn.onclick = () => {
  hide(accountMsg); hide(accountErr);
  latestCreatedApiKey = '';
  syncNewKeyCallout();
  setCreateKeyPanelOpen(true);
};
if(cancelCreateKeyBtn) cancelCreateKeyBtn.onclick = () => {
  hide(accountMsg); hide(accountErr);
  latestCreatedApiKey = '';
  syncNewKeyCallout();
  if($('keyName')) $('keyName').value='';
  setCreateKeyPanelOpen(false);
};
const createKeyBtn = $('createKeyBtn');
if(createKeyBtn) createKeyBtn.onclick = async () => {
  hide(accountMsg); hide(accountErr);
  latestCreatedApiKey = '';
  syncNewKeyCallout();
  try{
    const data=await api('/api/account/api-keys',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:$('keyName').value})});
    show(accountMsg,i18n.createSuccess);
    latestCreatedApiKey = String(data?.apiKey || '');
    syncNewKeyCallout();
    if($('keyName')) $('keyName').value='';
    setCreateKeyPanelOpen(true);
    await loadMe();
  }catch(error){
    show(accountErr,error.message);
  }
};
if(logoutBtn) logoutBtn.onclick = async () => {
  await fetch('/api/auth/logout',{method:'POST',credentials:'same-origin'});
  location.href = LOGIN_PATH;
};
if(INITIAL_ACCOUNT_DATA && (PAGE_KEY === 'files' || PAGE_KEY === 'sites')){
  applyAccountIdentity(INITIAL_ACCOUNT_DATA);
}
loadMe();`,
    { lang: 'en' }
  );
}

function adminPage() {
  return accountShell(
    'OkFile Admin',
    `<div class="topbar">
      <a class="brand" href="/">Ok<span>File</span></a>
      <div class="nav">
        <a href="/account">Account</a>
        <a href="/en/upload/">Manual Upload</a>
      </div>
    </div>
    <div class="stack">
      <div class="card hero-card">
        <div class="hero-top">
          <div class="hero-copy">
            <h1>Admin Console</h1>
            <p class="muted">Review registered users, manage API Key status and quotas, and run cleanup for expired files. This page follows the same control-plane layout as the account key manager, with summary cards, direct actions, and a management table.</p>
            <div class="meta-line">
              <span class="meta-pill">Admin access required</span>
              <span class="meta-pill">Configured by <code>ADMIN_EMAILS</code></span>
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
        <div class="msg hidden" id="adminMsg"></div>
        <div class="err hidden" id="adminErr"></div>
      </div>

      <div class="card section-card">
        <div class="section-head">
          <div>
            <h2>Expired File Cleanup</h2>
            <p class="muted">Run a bounded cleanup batch against expired file metadata and delete any matching R2 objects that are already past their expiration time.</p>
          </div>
        </div>
        <div class="section-body">
          <div class="inline-grid">
            <div class="field" style="margin-top:0">
              <label for="cleanupLimit">Batch size</label>
              <input id="cleanupLimit" type="number" min="1" max="1000" value="200">
            </div>
            <button class="btn-primary" id="cleanupBtn">Clean Up Expired Files</button>
          </div>
          <div class="note" id="cleanupResult" style="margin-top:16px">Cleanup has not run yet</div>
        </div>
      </div>

      <div class="card section-card">
        <div class="section-head">
          <div>
            <h2>Account API Keys</h2>
            <p class="muted">Inspect every registered user and API Key in one table. Adjust status, prepare limits, window size, and upload quota, then save changes inline.</p>
          </div>
      </div>
        <div class="table-toolbar">
          <div class="toolbar-copy subtle">Each row represents either a user without a key yet or an existing API Key that can be activated, disabled, or quota-adjusted.</div>
        </div>
        <div class="table-wrap" id="adminTableWrap"><div class="empty-state"><strong>Loading admin data...</strong><div>Please wait while OkFile loads account and API Key records.</div></div></div>
      </div>
    </div>`,
    `const $=(id)=>document.getElementById(id);
function show(el,msg){el.textContent=msg;el.classList.remove('hidden')}
function hide(el){el.textContent='';el.classList.add('hidden')}
function escapeHtml(value){
  return String(value ?? '').replace(/[&<>"']/g,(char)=>({
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    '"':'&quot;',
    "'":'&#39;'
  }[char]));
}
function formatTime(value){
  if(!value) return '-';
  const d=new Date(value);
  if(Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('en-US',{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false});
}
function formatNumber(value){
  return new Intl.NumberFormat('en-US').format(Number(value||0));
}
async function api(path,init){
  const res=await fetch(path,{credentials:'same-origin',...init});
  const data=await res.json().catch(()=>null);
  if(!res.ok) throw new Error(data?.error||('HTTP '+res.status));
  return data;
}
function setSummary(items){
  const rows = items.length;
  const keyed = items.filter((item)=>item.hasApiKey);
  const active = keyed.filter((item)=>item.status === 'active').length;
  const disabled = keyed.filter((item)=>item.status === 'disabled').length;
  $('adminStatRows').textContent = formatNumber(rows);
  $('adminStatKeys').textContent = formatNumber(keyed.length);
  $('adminStatActive').textContent = formatNumber(active);
  $('adminStatDisabled').textContent = formatNumber(disabled);
}
function setCleanupBusy(busy){
  $('cleanupBtn').disabled = busy;
  $('cleanupBtn').textContent = busy ? 'Cleaning...' : 'Clean Up Expired Files';
}
async function runCleanup(){
  hide($('adminErr')); hide($('adminMsg'));
  const rawLimit = Number($('cleanupLimit').value || 200);
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
    const extra = data.truncated && data.cursor ? ', more batches remain' : '';
    $('cleanupResult').textContent = 'Checked ' + data.checked + ', deleted ' + data.deleted + extra;
    show($('adminMsg'),'Expired file cleanup completed');
    await load();
  }catch(error){
    $('cleanupResult').textContent = 'Cleanup failed';
    show($('adminErr'),error.message);
  }finally{
    setCleanupBusy(false);
  }
}
function row(item){
  if(!item.hasApiKey){
    return '<tr>' +
      '<td><div class="cell-stack"><strong>' + escapeHtml(item.ownerEmail) + '</strong><div class="subtle">Registered ' + formatTime(item.userCreatedAt) + '</div></div></td>' +
      '<td><div class="perm-summary"><strong>No API Key yet</strong><div class="subtle">This user has an account but has not created any personal API Key.</div></div></td>' +
      '<td><span class="subtle">-</span></td>' +
      '<td><span class="subtle">-</span></td>' +
      '<td><span class="subtle">-</span></td>' +
      '<td><span class="subtle">-</span></td>' +
      '<td><span class="subtle">Waiting for user action</span></td>' +
    '</tr>';
  }
  return '<tr>' +
    '<td><div class="cell-stack"><strong>' + escapeHtml(item.ownerEmail) + '</strong><div class="subtle">Registered ' + formatTime(item.userCreatedAt) + '</div></div></td>' +
    '<td><div class="cell-stack"><div class="token-name"><strong>' + escapeHtml(item.name) + '</strong><span class="status-pill ' + (item.status === 'disabled' ? 'disabled' : 'active') + '">' + escapeHtml(item.status === 'disabled' ? 'Disabled' : 'Active') + '</span></div><div class="mono">' + escapeHtml(item.keyPrefix) + '...</div></div></td>' +
    '<td><select data-field="status" data-id="' + item.id + '"><option value="active"' + (item.status==='active'?' selected':'') + '>active</option><option value="disabled"' + (item.status==='disabled'?' selected':'') + '>disabled</option></select></td>' +
    '<td><div class="cell-stack"><input data-field="limitPreparePerWindow" data-id="' + item.id + '" type="number" min="1" value="' + item.limitPreparePerWindow + '"><div class="subtle">requests / window</div></div></td>' +
    '<td><div class="cell-stack"><input data-field="limitPrepareWindowSec" data-id="' + item.id + '" type="number" min="60" value="' + item.limitPrepareWindowSec + '"><div class="subtle">window seconds</div></div></td>' +
    '<td><div class="cell-stack"><input data-field="limitUploadCountTotal" data-id="' + item.id + '" type="number" min="1" value="' + item.limitUploadCountTotal + '"><div class="subtle">uploaded ' + formatNumber(item.uploadedCountTotal) + '</div></div></td>' +
    '<td><div class="actions-cell"><button class="btn-primary" data-save="' + item.id + '">Save Changes</button></div></td>' +
  '</tr>';
}
async function load(){
  hide($('adminErr')); hide($('adminMsg'));
  try{
    const data=await api('/api/admin/api-keys');
    setSummary(data.apiKeys || []);
    $('adminTableWrap').innerHTML = '<table><thead><tr><th>User</th><th>API Key</th><th>Status</th><th>Prepare Limit</th><th>Window</th><th>Upload Quota</th><th>Action</th></tr></thead><tbody>' + (data.apiKeys || []).map(row).join('') + '</tbody></table>';
    document.querySelectorAll('[data-save]').forEach((btn)=>{
      btn.onclick = async () => {
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
          await load();
        }catch(error){
          show($('adminErr'),error.message);
        }finally{
          btn.disabled = false;
          btn.textContent = originalText;
        }
      };
    });
  }catch(error){
    $('adminTableWrap').innerHTML = '<div class="empty-state"><strong>Failed to load admin data</strong><div>' + escapeHtml(error.message) + '</div></div>';
    show($('adminErr'),error.message);
  }
}
$('cleanupBtn').onclick = runCleanup;
load();`
  );
}

function publicInfoPageHTML({ title, icon, heading, body, tone = 'danger' }) {
  const toneClass = escapeHtml(tone);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title)} - OkFile</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#f5f7fb">
<style>*{box-sizing:border-box;margin:0;padding:0}html{background:#f5f7fb}body{font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:linear-gradient(180deg,#f7f9fc 0%,#eef3f9 100%);color:#0f172a;min-height:100vh}.topbar{position:sticky;top:0;z-index:20;background:rgba(247,249,252,.92);backdrop-filter:blur(14px);border-bottom:1px solid #dde6f0}.topbar-inner{width:min(1120px,100%);margin:0 auto;padding:14px 24px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}.brand{display:inline-flex;align-items:center;gap:10px;text-decoration:none}.brand-logo{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:10px;background:linear-gradient(135deg,#f48120,#ffb347);color:#fff;font-weight:800;box-shadow:0 8px 18px rgba(244,129,32,.2)}.brand-copy strong{display:block;font-size:16px;color:#0f172a}.brand-copy span{display:block;font-size:12px;color:#64748b}.top-actions{display:flex;gap:10px;flex-wrap:wrap}.top-actions a{padding:8px 14px;border-radius:999px;border:1px solid #dce4ee;background:#fff;color:#475569;text-decoration:none;font-size:12px;box-shadow:0 1px 2px rgba(15,23,42,.04)}.top-actions a:hover{border-color:#c7d6ea;background:#f8fafc;color:#0f172a}.wrap{width:100%;max-width:720px;margin:0 auto;padding:28px 24px}.crumbs{display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap;font-size:12px;color:#94a3b8;margin-bottom:16px}.crumbs a{color:#1d4ed8;text-decoration:none}.panel{background:#fff;border:1px solid #dce4ee;border-radius:24px;padding:36px 32px;text-align:center;box-shadow:0 18px 44px rgba(15,23,42,.08)}.badge{display:inline-flex;align-items:center;gap:8px;padding:7px 14px;border-radius:999px;background:#eff6ff;border:1px solid #dbeafe;color:#1d4ed8;font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase}.icon{font-size:52px;margin:18px 0 14px}.heading{font-size:28px;font-weight:800;line-height:1.15;margin-bottom:10px}.heading.danger{color:#b91c1c}.heading.warning{color:#c2410c}.desc{font-size:15px;line-height:1.8;color:#475569}.desc p{margin-bottom:12px}.desc code{font-family:Consolas,"SF Mono",monospace;color:#1d4ed8;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:2px 8px}.actions{margin-top:24px;display:flex;justify-content:center;gap:12px;flex-wrap:wrap}.btn{display:inline-flex;align-items:center;justify-content:center;padding:10px 18px;border-radius:12px;text-decoration:none;font-size:14px;font-weight:600;border:1px solid #dce4ee;background:#fff;color:#334155;transition:.18s}.btn:hover{border-color:#c7d6ea;background:#f8fafc;color:#0f172a}.btn-primary{background:#1d4ed8;border-color:#1d4ed8;color:#fff;box-shadow:0 10px 24px rgba(29,78,216,.14)}.btn-primary:hover{background:#1e40af;border-color:#1e40af;color:#fff}@media (max-width:640px){.topbar-inner{padding:12px 16px}.wrap{padding:20px 16px}.panel{padding:28px 20px}.heading{font-size:24px}}</style></head>
<body><div class="topbar"><div class="topbar-inner"><a class="brand" href="/en/"><span class="brand-logo">O</span><span class="brand-copy"><strong>OkFile Console</strong><span>Status Page</span></span></a><div class="top-actions"><a href="/en/">Home</a><a href="/en/upload/">Manual Upload</a><a href="/en/account/">Account</a></div></div></div><div class="wrap"><div class="crumbs"><a href="/en/">Home</a><span>/</span><span>${escapeHtml(title)}</span></div><div class="panel"><div class="badge">OkFile Notice</div><div class="icon">${icon}</div><h1 class="heading ${toneClass}">${heading}</h1><div class="desc">${body}</div><div class="actions"><a class="btn btn-primary" href="/">Back to OkFile Home</a><a class="btn" href="/en/account/">Open Account</a></div></div></div></body></html>`;
}

function notFoundHTML(id) {
  return publicInfoPageHTML({
    title: '404',
    icon: '📭',
    heading: 'File Not Found',
    body: `<p>File <code>${escapeHtml(id)}</code> was not found.</p>`,
    tone: 'danger',
  });
}

function downloadLimitExceededHTML(meta) {
  const name = escapeHtml(meta?.name || meta?.id || 'unknown');
  const id = escapeHtml(meta?.id || 'unknown');
  const maxDownloads = Number.isInteger(meta?.maxDownloads) ? meta.maxDownloads : 0;
  return publicInfoPageHTML({
    title: 'Download Limit Reached',
    icon: '🔒',
    heading: 'Download Limit Reached',
    body: `<p>File <code>${name}</code> (ID: <code>${id}</code>) has reached its download limit${maxDownloads > 0 ? ` (${maxDownloads} downloads)` : ''}.</p>`,
    tone: 'warning',
  });
}

function expiredFileHTML(meta) {
  const name = escapeHtml(meta?.name || meta?.id || 'unknown');
  const id = escapeHtml(meta?.id || 'unknown');
  const expiresAt = meta?.expiresAt ? `<p>Expired at: <code>${escapeHtml(meta.expiresAt)}</code></p>` : '';
  return publicInfoPageHTML({
    title: 'File Expired',
    icon: '⏳',
    heading: 'File Expired',
    body: `<p>File <code>${name}</code> (ID: <code>${id}</code>) is no longer available.</p>${expiresAt}`,
    tone: 'warning',
  });
}

function viewerShell(title, body, extraHead = '') {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${title}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="icon" href="/favicon.ico" type="image/svg+xml">
${extraHead}
<style>
*{box-sizing:border-box;margin:0;padding:0}
html{background:#f5f7fb}
body{font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;background:linear-gradient(180deg,#f7f9fc 0%,#eef3f9 100%);color:#334155;min-height:100vh}
.topbar{position:sticky;top:0;z-index:20;background:rgba(247,249,252,.92);backdrop-filter:blur(14px);border-bottom:1px solid #dde6f0}
.topbar-inner{width:min(1120px,100%);margin:0 auto;padding:14px 24px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
.brand{display:inline-flex;align-items:center;gap:10px;text-decoration:none}
.brand-logo{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:10px;background:linear-gradient(135deg,#f48120,#ffb347);color:#fff;font-weight:800;box-shadow:0 8px 18px rgba(244,129,32,.2)}
.brand-copy strong{display:block;font-size:16px;color:#0f172a}
.brand-copy span{display:block;font-size:12px;color:#64748b}
.top-actions{display:flex;gap:10px;flex-wrap:wrap}
.top-actions a{padding:8px 14px;border-radius:999px;border:1px solid #dce4ee;background:#fff;color:#475569;text-decoration:none;font-size:12px;box-shadow:0 1px 2px rgba(15,23,42,.04)}
.top-actions a:hover{border-color:#c7d6ea;background:#f8fafc;color:#0f172a}
.wrap{width:100%;max-width:960px;text-align:center;margin:0 auto;padding:28px 16px}
.crumbs{display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap;font-size:12px;color:#94a3b8;margin-bottom:16px}
.crumbs a{color:#1d4ed8;text-decoration:none}
.panel{position:relative;width:100%;background:#fff;border-radius:18px;overflow:hidden;margin-bottom:20px;box-shadow:0 14px 34px rgba(15,23,42,.08);border:1px solid #dce4ee}
.panel img,.panel video,.panel iframe{width:100%;display:block;border:0;background:#000;max-height:80vh}
.panel img{height:auto;object-fit:contain}
.tag{display:inline-block;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:.05em;margin-bottom:12px}
.tag.image{background:#ecfdf3;color:#166534;border:1px solid #bbf7d0}
.tag.video{background:#eff6ff;color:#1d4ed8;border:1px solid #dbeafe}
.tag.pdf,.tag.file{background:#fff7ed;color:#c2410c;border:1px solid #fed7aa}
.info{display:flex;gap:12px;justify-content:center;color:#64748b;font-size:13px;margin-top:8px;flex-wrap:wrap}
.info span{background:#fff;padding:4px 12px;border-radius:999px;border:1px solid #dce4ee}
.actions{margin-top:18px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap}
.btn{display:inline-flex;align-items:center;gap:6px;padding:8px 18px;border-radius:12px;font-size:13px;font-weight:600;text-decoration:none;border:1px solid #dce4ee;color:#334155;background:#fff;transition:all .15s;cursor:pointer}
.btn:hover{border-color:#c7d6ea;color:#0f172a;background:#f8fafc}
.btn-primary{background:#1d4ed8;border-color:#1d4ed8;color:#fff;box-shadow:0 10px 24px rgba(29,78,216,.14)}
.btn-primary:hover{background:#1e40af;border-color:#1e40af;color:#fff}
.btn-disabled{opacity:.45;pointer-events:none;cursor:not-allowed}
.name{font-size:18px;font-weight:700;margin:8px 0 6px;color:#0f172a;word-break:break-word}
.hint{color:#64748b;font-size:13px;line-height:1.6}
.warn{margin-top:12px;padding:12px 14px;border-radius:14px;background:#fff7ed;border:1px solid #fed7aa;color:#c2410c;font-size:13px;line-height:1.7;text-align:left}
@media (max-width:640px){.topbar-inner{padding:12px 16px}.wrap{padding:20px 16px}}
</style></head><body><div class="topbar"><div class="topbar-inner"><a class="brand" href="/en/"><span class="brand-logo">O</span><span class="brand-copy"><strong>OkFile Console</strong><span>Preview</span></span></a><div class="top-actions"><a href="/en/">Home</a><a href="/en/upload/">Manual Upload</a><a href="/en/account/">Account</a></div></div></div><div class="crumbs"><a href="/en/">Home</a><span>/</span><span>${escapeHtml(title)}</span></div>${body}</body></html>`;
}

function downloadLimitHint(meta) {
  if (!meta?.downloadLimitEnabled) return '';
  if ((meta.remainingDownloads || 0) <= 0) {
    return '<div class="hint" style="margin-top:12px">Download limits are enabled. No downloads remain.</div>';
  }
  return `<div class="hint" style="margin-top:12px">Download limits are enabled. Remaining: ${meta.remainingDownloads} / ${meta.maxDownloads}.</div>`;
}

function viewerDownloadAction(meta, label) {
  const href = escapeHtml(meta?.downloadUrl || controlledDownloadUrl(meta?.id || ''));
  if (meta?.downloadLimitEnabled && (meta.remainingDownloads || 0) <= 0) {
    return `<span class="btn btn-primary btn-disabled">${escapeHtml(label)} (limit reached)</span>`;
  }
  return `<a class="btn btn-primary" href="${href}">${escapeHtml(label)}</a>`;
}

function viewerInfoMarkup(meta) {
  const items = [
    formatSize(meta.size),
    escapeHtml(meta.contentType),
    escapeHtml(meta.id),
    `IP: ${escapeHtml(meta.clientIp || 'Unknown')}`,
    `Region: ${escapeHtml(meta.clientRegion || 'Unknown')}`
  ];
  return `<div class="info">${items.map((item) => `<span>${item}</span>`).join('')}</div>`;
}

function imageViewerPage(meta) {
  const src = mediaUrl(meta.id);
  return viewerShell(
    `OkFile - ${escapeHtml(meta.name || meta.id)}`,
    `<div class="wrap">
      <div class="panel"><img src="${src}" alt="${escapeHtml(meta.name || meta.id)}" loading="lazy"></div>
      <span class="tag image">IMAGE</span>
      <div class="name">${escapeHtml(meta.name || meta.id)}</div>
      ${viewerInfoMarkup(meta)}
      ${downloadLimitHint(meta)}
      <div class="actions">
        ${viewerDownloadAction(meta, 'Download Image')}
        <a class="btn" href="${src}" target="_blank">Direct File URL</a>
        <a class="btn" href="/">Back to Home</a>
      </div>
    </div>`,
    `<meta property="og:image" content="${src}"><meta name="twitter:card" content="summary_large_image">`
  );
}

function videoViewerPage(meta) {
  const src = mediaUrl(meta.id);
  return viewerShell(
    `OkFile - ${escapeHtml(meta.name || meta.id)}`,
    `<div class="wrap">
      <div class="panel"><video id="videoPlayer" controls playsinline preload="metadata" src="${src}"></video></div>
      <span class="tag video">VIDEO</span>
      <div class="name">${escapeHtml(meta.name || meta.id)}</div>
      ${viewerInfoMarkup(meta)}
      <div class="warn" id="videoCompatHint">If the player is blank or audio plays without video, the current browser probably does not support this MP4 video codec. Try downloading the file or using the direct file URL. For reliable browser playback, re-encode to H.264 + AAC MP4.</div>
      ${downloadLimitHint(meta)}
      <div class="actions">
        ${viewerDownloadAction(meta, 'Download Video')}
        <a class="btn" href="${src}" target="_blank">Direct File URL</a>
        <a class="btn" href="/">Back to Home</a>
      </div>
    </div>`,
    `<script>
document.addEventListener('DOMContentLoaded', function () {
  var video = document.getElementById('videoPlayer');
  var hint = document.getElementById('videoCompatHint');
  if (!video || !hint) return;
  function showHint(extra) {
    if (extra) hint.textContent = extra;
    hint.style.display = 'block';
  }
  function maybeHideHint() {
    if ((video.videoWidth || 0) > 0 && (video.videoHeight || 0) > 0) {
      hint.style.display = 'none';
    }
  }
  hint.style.display = 'block';
  video.addEventListener('loadedmetadata', function () {
    setTimeout(function () {
      if ((video.videoWidth || 0) === 0 && Number.isFinite(video.duration) && video.duration > 0) {
        showHint('The browser loaded the video duration but could not decode any visible frames. This usually means the codec is not compatible. Download the video or use the direct file URL. For reliable preview support, re-encode to H.264 + AAC MP4.');
        return;
      }
      maybeHideHint();
    }, 800);
  });
  video.addEventListener('error', function () {
    showHint('The current browser cannot play this video. Download it first, or re-encode it to H.264 + AAC MP4 before previewing again.');
  });
  video.addEventListener('playing', maybeHideHint);
});
</script>`
  );
}

function pdfViewerPage(meta) {
  const src = mediaUrl(meta.id);
  return viewerShell(
    `OkFile - ${escapeHtml(meta.name || meta.id)}`,
    `<div class="wrap">
      <div class="panel"><iframe src="${src}" title="${escapeHtml(meta.name || meta.id)}" style="height:80vh"></iframe></div>
      <span class="tag pdf">PDF</span>
      <div class="name">${escapeHtml(meta.name || meta.id)}</div>
      ${viewerInfoMarkup(meta)}
      ${downloadLimitHint(meta)}
      <div class="actions">
        ${viewerDownloadAction(meta, 'Download PDF')}
        <a class="btn" href="${src}" target="_blank">Direct File URL</a>
        <a class="btn" href="/">Back to Home</a>
      </div>
    </div>`
  );
}

function genericViewerPage(meta) {
  const src = mediaUrl(meta.id);
  return viewerShell(
    `OkFile - ${escapeHtml(meta.name || meta.id)}`,
    `<div class="wrap">
      <div class="panel" style="padding:48px 24px">
        <div class="hint">This file type is not supported for inline preview yet. Download it to inspect the contents.</div>
      </div>
      <span class="tag file">FILE</span>
      <div class="name">${escapeHtml(meta.name || meta.id)}</div>
      ${viewerInfoMarkup(meta)}
      ${downloadLimitHint(meta)}
      <div class="actions">
        ${viewerDownloadAction(meta, 'Download File')}
        <a class="btn" href="${src}" target="_blank">Direct File URL</a>
        <a class="btn" href="/">Back to Home</a>
      </div>
    </div>`
  );
}

function requirePresignEnv(env) {
  const missing = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'].filter((key) => !env[key]);
  if (missing.length) throw new Error(`Missing presign configuration: ${missing.join(', ')}`);
}

function createR2Signer(env) {
  requirePresignEnv(env);
  return new AwsClient({
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    service: 's3',
    region: 'auto'
  });
}

async function createSingleUploadUrl(id, env, signer = createR2Signer(env)) {
  const base = `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${BUCKET_NAME}/${id}`;
  const signed = await signer.sign(new Request(`${base}?X-Amz-Expires=${PRESIGNED_EXPIRES}`, { method: 'PUT' }), {
    aws: { signQuery: true }
  });
  return signed.url.toString();
}

async function createPartUploadUrl(id, uploadId, partNumber, env, signer = createR2Signer(env)) {
  const params = new URLSearchParams({
    partNumber: String(partNumber),
    uploadId,
    'X-Amz-Expires': String(PRESIGNED_EXPIRES)
  });
  const base = `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${BUCKET_NAME}/${id}?${params.toString()}`;
  const signed = await signer.sign(new Request(base, { method: 'PUT' }), {
    aws: { signQuery: true }
  });
  return signed.url.toString();
}

async function createPartUploadUrls(id, uploadId, totalParts, env, signer = createR2Signer(env)) {
  const partNumbers = Array.from({ length: totalParts }, (_, index) => index + 1);
  const uploadUrls = await Promise.all(
    partNumbers.map((partNumber) => createPartUploadUrl(id, uploadId, partNumber, env, signer))
  );
  return partNumbers.map((partNumber, index) => ({
    partNumber,
    uploadUrl: uploadUrls[index]
  }));
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

async function readUploadSession(id, env) {
  return readJsonObject(uploadSessionKey(id), env);
}

async function saveUploadSession(id, payload, env) {
  await saveJsonObject(uploadSessionKey(id), payload, env);
}

async function deleteUploadSession(id, env) {
  await env.FILES.delete(uploadSessionKey(id));
}

async function readSiteSession(id, env) {
  return readJsonObject(siteSessionKey(id), env);
}

async function saveSiteSession(id, payload, env) {
  await saveJsonObject(siteSessionKey(id), payload, env);
}

async function deleteSiteSession(id, env) {
  await env.FILES.delete(siteSessionKey(id));
}

async function readSiteUpdateToken(token, env) {
  if (!token) return null;
  return readJsonObject(siteUpdateTokenKey(token), env);
}

async function deleteSiteUpdateToken(token, env) {
  if (!token) return;
  await env.FILES.delete(siteUpdateTokenKey(token));
}

async function readFileMeta(id, env) {
  const sidecar = await readSidecarMeta(id, env);
  const r2Object = await env.FILES.head(id);
  if (!r2Object) return null;
  const maxDownloads = normalizeMaxDownloads(sidecar?.maxDownloads);
  const expiresAt = normalizeExpiresAt(sidecar?.expiresAt);
  const downloadCount = Number.isInteger(Number(sidecar?.downloadCount))
    ? Math.max(0, Number(sidecar.downloadCount))
    : 0;
  const downloadLimitEnabled = Number.isInteger(maxDownloads) && maxDownloads > 0;
  return {
    id,
    size: r2Object.size,
    contentType: sidecar?.contentType || r2Object.httpMetadata?.contentType || r2Object.customMetadata?.contentType || 'application/octet-stream',
    name: sidecar?.name || r2Object.customMetadata?.name || id,
    uploadedAt: sidecar?.uploadedAt || r2Object.customMetadata?.uploadedAt || '',
    etag: r2Object.httpEtag || r2Object.etag || null,
    expiresAt: typeof expiresAt === 'string' ? expiresAt : null,
    expired: typeof expiresAt === 'string' ? isExpiredAt(expiresAt) : false,
    maxDownloads: downloadLimitEnabled ? maxDownloads : null,
    downloadCount,
    remainingDownloads: downloadLimitEnabled ? Math.max(maxDownloads - downloadCount, 0) : null,
    downloadLimitEnabled,
    lastDownloadedAt: sidecar?.lastDownloadedAt || '',
    downloadUrl: controlledDownloadUrl(id),
    clientIp: sidecar?.clientIp || r2Object.customMetadata?.clientIp || '',
    clientRegion: sidecar?.clientRegion || r2Object.customMetadata?.clientRegion || ''
  };
}

function parseRangeHeader(rangeHeader, size) {
  if (!rangeHeader) return { ok: true, partial: false };
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match) return { ok: false };
  let start;
  let end;
  const [, rawStart, rawEnd] = match;
  if (rawStart === '' && rawEnd === '') return { ok: false };
  if (rawStart === '') {
    const suffix = Number(rawEnd);
    if (!Number.isFinite(suffix) || suffix <= 0) return { ok: false };
    start = Math.max(size - suffix, 0);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === '' ? size - 1 : Number(rawEnd);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) return { ok: false };
  }
  if (start >= size || end < 0) return { ok: false };
  start = Math.max(0, start);
  end = Math.min(size - 1, end);
  return { ok: true, partial: true, start, end, length: end - start + 1 };
}

async function serveR2File(id, request, env, meta, options = {}) {
  const { forceAttachment = false, cacheControl = DEFAULT_CACHE } = options;
  const head = await env.FILES.head(id);
  if (!head) return null;
  const range = parseRangeHeader(request.headers.get('range'), head.size);
  if (!range.ok) {
    return new Response(null, {
      status: 416,
      headers: {
        'Content-Range': `bytes */${head.size}`,
        'Accept-Ranges': 'bytes'
      }
    });
  }
  const object = await env.FILES.get(id, range.partial ? { range: { offset: range.start, length: range.length } } : undefined);
  if (!object) return null;
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Cache-Control', cacheControl);
  headers.set(
    'Content-Disposition',
    `${forceAttachment ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(meta?.name || object.customMetadata?.name || id)}`
  );
  if (head.httpEtag || head.etag) headers.set('ETag', head.httpEtag || head.etag);
  headers.set('Content-Type', meta?.contentType || head.httpMetadata?.contentType || object.customMetadata?.contentType || 'application/octet-stream');
  if (range.partial) {
    headers.set('Content-Range', `bytes ${range.start}-${range.end}/${head.size}`);
    headers.set('Content-Length', String(range.length));
    return new Response(object.body, { status: 206, headers });
  }
  headers.set('Content-Length', String(head.size));
  return new Response(object.body, { headers });
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
    subject: 'OkFile Sign-In Link',
    html: `<div style="font-family:Arial,sans-serif;line-height:1.7;color:#111">
      <h2>Sign in to OkFile</h2>
      <p>Use the link below to verify your email address and sign in:</p>
      <p><a href="${verifyUrl}" style="display:inline-block;padding:12px 18px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px">Verify and Sign In</a></p>
      <p>If the button does not work, copy this URL into your browser:</p>
      <p>${verifyUrl}</p>
      <p>This link expires in 15 minutes.</p>
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
  if (!link) return { error: 'Verification link does not exist or is no longer valid' };
  if (link.used_at) return { error: 'Verification link has already been used' };
  if (new Date(link.expires_at).getTime() < Date.now()) return { error: 'Verification link has expired' };

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
  await ensureAccountDataIndexes(env);
  const token = parseCookies(request)[SESSION_COOKIE];
  if (!token) return null;
  const sessionHash = await sha256Hex(token);
  const record = await env.DB.prepare(
    `SELECT sessions.id AS session_id, sessions.expires_at, sessions.last_seen_at, users.*
     FROM sessions
     JOIN users ON users.id = sessions.user_id
     WHERE sessions.session_hash = ?`
  ).bind(sessionHash).first();
  if (!record) return null;
  if (new Date(record.expires_at).getTime() < Date.now()) return null;
  const nowIso = new Date().toISOString();
  const lastSeenAt = Date.parse(record.last_seen_at || '');
  if (!Number.isFinite(lastSeenAt) || (Date.now() - lastSeenAt) >= 5 * 60 * 1000) {
    await env.DB.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?').bind(nowIso, record.session_id).run();
  }
  return {
    sessionId: record.session_id,
    userId: record.id,
    email: record.email,
    verifiedAt: record.verified_at,
    createdAt: record.created_at,
    lastLoginAt: record.last_login_at,
    isAdmin: adminEmailSet(env).has(normalizeEmail(record.email))
  };
}

async function logoutSession(request, env) {
  const token = parseCookies(request)[SESSION_COOKIE];
  if (!token) return;
  const sessionHash = await sha256Hex(token);
  await env.DB.prepare('DELETE FROM sessions WHERE session_hash = ?').bind(sessionHash).run();
}

async function listApiKeysForUser(userId, env) {
  await ensureAccountDataIndexes(env);
  const result = await env.DB.prepare(
    `SELECT id, name, key_prefix, status, limit_prepare_per_window, limit_prepare_window_sec,
            limit_upload_count_total, uploaded_count_total, created_at, last_used_at
     FROM api_keys WHERE user_id = ? ORDER BY created_at DESC`
  ).bind(userId).all();
  return (result.results || []).map((item) => ({
    id: item.id,
    name: item.name,
    keyPrefix: item.key_prefix,
    status: item.status,
    limitPreparePerWindow: item.limit_prepare_per_window,
    limitPrepareWindowSec: item.limit_prepare_window_sec,
    limitUploadCountTotal: item.limit_upload_count_total,
    uploadedCountTotal: item.uploaded_count_total,
    createdAt: item.created_at,
    lastUsedAt: item.last_used_at
  }));
}

async function getAccountSummary(userId, env) {
  await ensureAccountDataIndexes(env);
  await ensurePublishedFilesTable(env);
  await ensureSitesTables(env);
  const now = new Date().toISOString();
  const row = await env.DB.prepare(
    `SELECT
        (SELECT COUNT(*) FROM api_keys WHERE user_id = ?1) AS api_key_count,
        (SELECT COUNT(*) FROM api_keys WHERE user_id = ?1 AND status = 'active') AS active_api_key_count,
        (SELECT COUNT(*) FROM api_keys WHERE user_id = ?1 AND status = 'disabled') AS disabled_api_key_count,
        (SELECT COALESCE(SUM(uploaded_count_total), 0) FROM api_keys WHERE user_id = ?1) AS uploaded_count_total,
        (SELECT COUNT(*) FROM published_files WHERE user_id = ?1) AS file_count,
        (SELECT COALESCE(SUM(size), 0) FROM published_files WHERE user_id = ?1) AS file_bytes,
        (SELECT COUNT(*) FROM sites WHERE user_id = ?1) AS site_count,
        (SELECT COALESCE(SUM(total_size), 0) FROM sites WHERE user_id = ?1) AS site_bytes,
        (SELECT COUNT(*) FROM sites WHERE user_id = ?1 AND NOT (status = 'expired' OR (expires_at IS NOT NULL AND expires_at <= ?2))) AS active_site_count`
  ).bind(userId, now).first();
  return {
    apiKeyCount: Number(row?.api_key_count || 0),
    activeApiKeyCount: Number(row?.active_api_key_count || 0),
    disabledApiKeyCount: Number(row?.disabled_api_key_count || 0),
    uploadedCountTotal: Number(row?.uploaded_count_total || 0),
    fileCount: Number(row?.file_count || 0),
    fileBytes: Number(row?.file_bytes || 0),
    siteCount: Number(row?.site_count || 0),
    siteBytes: Number(row?.site_bytes || 0),
    activeSiteCount: Number(row?.active_site_count || 0)
  };
}

async function listFilesForUser(userId, env, limit = 100) {
  await ensureAccountDataIndexes(env);
  await ensurePublishedFilesTable(env);
  const result = await env.DB.prepare(
    `SELECT id, file_name, content_type, size, publish_origin, view_url, download_url, play_url, client_ip, client_region, created_at
     FROM published_files
     WHERE user_id = ?
     ORDER BY created_at DESC
     LIMIT ?`
  ).bind(userId, limit).all();
  return (result.results || []).map((item) => ({
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
  }));
}

async function listSitesForUser(userId, env, limit = 100) {
  await ensureAccountDataIndexes(env);
  await ensureSitesTables(env);
  const result = await env.DB.prepare(
    `SELECT id, name, publish_origin, site_url, site_hostname, subdomain, entry_path, status, file_count, total_size, expires_at,
            active_release_id, created_at, completed_at, updated_at
     FROM sites
     WHERE user_id = ?
     ORDER BY updated_at DESC
     LIMIT ?`
  ).bind(userId, limit).all();
  return (result.results || []).map((item) => ({
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
    activeReleaseId: item.active_release_id || '',
    createdAt: item.created_at || null,
    completedAt: item.completed_at || null,
    updatedAt: item.updated_at || null
  }));
}

function accountDetailForPage(pageKey) {
  if (pageKey === 'overview' || pageKey === 'storage') return 'summary';
  if (pageKey === 'api-keys') return 'api-keys';
  return 'basic';
}

async function buildAccountPayload(session, detail, env) {
  const payload = {
    success: true,
    userId: session.userId,
    email: session.email,
    createdAt: session.createdAt,
    verifiedAt: session.verifiedAt,
    lastLoginAt: session.lastLoginAt,
    isAdmin: session.isAdmin
  };
  if (detail === 'full' || detail === 'summary') {
    payload.summary = await getAccountSummary(session.userId, env);
  }
  if (detail === 'full' || detail === 'api-keys') {
    payload.apiKeys = await listApiKeysForUser(session.userId, env);
  }
  return payload;
}

function sqlPlaceholders(count) {
  return Array.from({ length: count }, () => '?').join(', ');
}

function chunkArray(values, size = 100) {
  const result = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
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
    const inClause = sqlPlaceholders(chunk.length);
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

async function createApiKey(userId, name, env) {
  const rawKey = `okf_${generateId(10)}${generateId(10)}${generateId(10)}`;
  const keyHash = await sha256Hex(rawKey);
  const now = new Date().toISOString();
  const id = `key_${generateId(16)}`;
  await env.DB.prepare(
    `INSERT INTO api_keys (
      id, user_id, name, key_prefix, key_hash, status,
      limit_prepare_per_window, limit_prepare_window_sec, limit_upload_count_total,
      uploaded_count_total, created_at
    ) VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, 0, ?)`
  ).bind(
    id,
    userId,
    String(name || 'Default API Key').trim().slice(0, 80) || 'Default API Key',
    rawKey.slice(0, 12),
    keyHash,
    DEFAULT_API_KEY_PREPARE_LIMIT,
    DEFAULT_API_KEY_WINDOW_SEC,
    DEFAULT_API_KEY_UPLOAD_LIMIT,
    now
  ).run();
  return rawKey;
}

async function getApiKeyByRaw(rawKey, env) {
  const keyHash = await sha256Hex(rawKey);
  const record = await env.DB.prepare(
    `SELECT api_keys.*, users.email
     FROM api_keys
     JOIN users ON users.id = api_keys.user_id
     WHERE api_keys.key_hash = ?`
  ).bind(keyHash).first();
  if (!record) return null;
  return {
    id: record.id,
    userId: record.user_id,
    ownerEmail: record.email,
    name: record.name,
    keyPrefix: record.key_prefix,
    status: record.status,
    limitPreparePerWindow: record.limit_prepare_per_window,
    limitPrepareWindowSec: record.limit_prepare_window_sec,
    limitUploadCountTotal: record.limit_upload_count_total,
    uploadedCountTotal: record.uploaded_count_total
  };
}

async function consumeApiKeyPrepare(apiKey, env) {
  if (apiKey.status !== 'active') return { ok: false, status: 403, error: 'API key is disabled' };
  if (apiKey.uploadedCountTotal >= apiKey.limitUploadCountTotal) {
    return { ok: false, status: 403, error: 'API key upload quota has been exhausted' };
  }
  const windowSec = Math.max(Number(apiKey.limitPrepareWindowSec || 0), 60);
  const windowStartedAt = Math.floor(Date.now() / 1000 / windowSec) * windowSec;
  await env.DB.prepare(
    `INSERT INTO api_key_usage_windows (api_key_id, window_started_at, prepare_count)
     VALUES (?, ?, 1)
     ON CONFLICT(api_key_id, window_started_at)
     DO UPDATE SET prepare_count = prepare_count + 1`
  ).bind(apiKey.id, windowStartedAt).run();
  const usage = await env.DB.prepare(
    'SELECT prepare_count FROM api_key_usage_windows WHERE api_key_id = ? AND window_started_at = ?'
  ).bind(apiKey.id, windowStartedAt).first();
  if (Number(usage?.prepare_count || 0) > apiKey.limitPreparePerWindow) {
    return { ok: false, status: 429, error: 'API key rate limit exceeded. Please retry later' };
  }
  return { ok: true };
}

async function incrementApiKeyUploadCount(apiKeyId, env) {
  await env.DB.prepare(
    'UPDATE api_keys SET uploaded_count_total = uploaded_count_total + 1, last_used_at = ? WHERE id = ?'
  ).bind(new Date().toISOString(), apiKeyId).run();
}

function readXmlTag(block, tag) {
  const match = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(block);
  return match ? match[1] : '';
}

function decodeXmlText(value) {
  return String(value || '')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function normalizeETag(value) {
  return String(value || '')
    .trim()
    .replace(/^W\//i, '')
    .replace(/^"|"$/g, '');
}

function parseUploadedPartsXml(xmlText) {
  const parts = Array.from(xmlText.matchAll(/<Part>([\s\S]*?)<\/Part>/g))
    .map((match) => {
      const block = match[1];
      return {
        partNumber: Number(readXmlTag(block, 'PartNumber')),
        etag: decodeXmlText(readXmlTag(block, 'ETag')).replace(/^"|"$/g, ''),
        size: Number(readXmlTag(block, 'Size')) || 0
      };
    })
    .filter((part) => Number.isInteger(part.partNumber) && part.partNumber > 0 && part.etag)
    .sort((a, b) => a.partNumber - b.partNumber);
  return {
    parts,
    isTruncated: readXmlTag(xmlText, 'IsTruncated') === 'true',
    nextPartNumberMarker: Number(readXmlTag(xmlText, 'NextPartNumberMarker') || 0)
  };
}

async function listUploadedParts(id, uploadId, env) {
  const signer = createR2Signer(env);
  const base = `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${BUCKET_NAME}/${id}`;
  let marker = 0;
  const parts = [];
  while (true) {
    const params = new URLSearchParams({ uploadId });
    if (marker > 0) params.set('part-number-marker', String(marker));
    const response = await signer.fetch(`${base}?${params.toString()}`, { method: 'GET' });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to list uploaded parts: ${errorText || `HTTP ${response.status}`}`);
    }
    const page = parseUploadedPartsXml(await response.text());
    parts.push(...page.parts);
    if (!page.isTruncated) break;
    marker = page.nextPartNumberMarker || parts[parts.length - 1]?.partNumber || 0;
    if (!marker) break;
  }
  return parts;
}

function validateMultipartParts(parts, totalParts) {
  if (!parts.length) {
    return { ok: false, status: 409, error: 'No uploaded parts were detected yet. Finish all PUT requests before calling complete' };
  }
  
  if (Number.isInteger(totalParts) && totalParts > 0) {
    const uploadedPartNumbers = new Set(parts.map(p => p.partNumber));
    const missingParts = [];
    for (let i = 1; i <= totalParts; i++) {
      if (!uploadedPartNumbers.has(i)) {
        missingParts.push(i);
      }
    }
    
    if (missingParts.length > 0) {
      return {
        ok: false,
        status: 409,
        success: false,
        error: `Incomplete multipart upload: ${parts.length}/${totalParts} parts are currently present`,
        uploadedParts: parts.length,
        totalParts,
        missingParts
      };
    }
  } else {
    for (let index = 0; index < parts.length; index++) {
      const expectedPartNumber = index + 1;
      if (parts[index].partNumber !== expectedPartNumber) {
        return { ok: false, status: 409, error: `Multipart part numbers are not contiguous. Missing part ${expectedPartNumber}` };
      }
    }
  }
  return { ok: true };
}

function normalizeClientUploadedParts(parts) {
  if (!Array.isArray(parts)) return [];
  return parts
    .map((item) => ({
      partNumber: Number(item?.partNumber),
      etag: normalizeETag(item?.etag)
    }))
    .filter((item) => Number.isInteger(item.partNumber) && item.partNumber > 0 && item.etag)
    .sort((a, b) => a.partNumber - b.partNumber);
}

function validateReportedPartEtags(clientParts, uploadedParts, totalParts) {
  const normalizedClientParts = normalizeClientUploadedParts(clientParts);
  if (!normalizedClientParts.length) return { ok: true, validated: false };
  if (Number.isInteger(totalParts) && totalParts > 0 && normalizedClientParts.length !== totalParts) {
    return {
      ok: false,
      status: 409,
      error: `Client-reported part ETag count is incomplete: expected ${totalParts}, got ${normalizedClientParts.length}`
    };
  }
  const serverMap = new Map((uploadedParts || []).map((item) => [Number(item.partNumber), normalizeETag(item.etag)]));
  for (const part of normalizedClientParts) {
    const serverEtag = serverMap.get(part.partNumber);
    if (!serverEtag) {
      return {
        ok: false,
        status: 409,
        error: `Server could not find part ${part.partNumber}, so its ETag cannot be validated`
      };
    }
    if (serverEtag !== part.etag) {
      return {
        ok: false,
        status: 409,
        error: `ETag mismatch for part ${part.partNumber}`
      };
    }
  }
  return { ok: true, validated: true, parts: normalizedClientParts.length };
}

function validateReportedObjectETag(expectedEtag, actualEtag) {
  const expected = normalizeETag(expectedEtag);
  if (!expected) return { ok: true, validated: false };
  const actual = normalizeETag(actualEtag);
  if (!actual) {
    return { ok: false, status: 409, error: 'Server did not return an object ETag, so integrity validation cannot be completed' };
  }
  if (expected !== actual) {
    return { ok: false, status: 409, error: 'Object ETag mismatch. File integrity validation failed' };
  }
  return { ok: true, validated: true };
}

function normalizeMaxDownloads(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return NaN;
  return parsed;
}

function normalizeExpiresAt(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return NaN;
  return parsed.toISOString();
}

function defaultAnonymousExpiresAt() {
  return new Date(Date.now() + ANONYMOUS_RESOURCE_TTL_MS).toISOString();
}

function resolveDefaultExpiresAt(expiresAt, options = {}) {
  if (typeof expiresAt === 'string') return expiresAt;
  if (typeof options.fallbackExpiresAt === 'string') return options.fallbackExpiresAt;
  if (options.apiKey?.userId || options.session?.userId) return null;
  return defaultAnonymousExpiresAt();
}

function isExpiredAt(expiresAt) {
  return Boolean(expiresAt) && new Date(expiresAt).getTime() <= Date.now();
}

function isMetaExpired(meta) {
  return isExpiredAt(meta?.expiresAt);
}

function buildPrepareLimits(apiKey, actualPartSize, maxDownloads) {
  const normalizedMaxDownloads = Number.isInteger(maxDownloads) && maxDownloads > 0 ? maxDownloads : null;
  const limits = {
    maxFileSize: MAX_SIZE,
    multipartThreshold: MULTIPART_THRESHOLD,
    defaultPartSize: PART_SIZE,
    effectivePartSize: actualPartSize,
    preferredPartSize: {
      min: 5 * 1024 * 1024,
      max: 100 * 1024 * 1024
    },
    download: {
      enabled: normalizedMaxDownloads !== null,
      maxDownloads: normalizedMaxDownloads
    },
    expiration: {
      supported: true,
      input: 'expiresAt',
      format: 'ISO 8601 UTC datetime'
    }
  };

  if (apiKey) {
    limits.auth = {
      mode: 'apiKey',
      limitPreparePerWindow: Number(apiKey.limitPreparePerWindow || 0),
      limitPrepareWindowSec: Number(apiKey.limitPrepareWindowSec || 0),
      limitUploadCountTotal: Number(apiKey.limitUploadCountTotal || 0),
      uploadedCountTotal: Number(apiKey.uploadedCountTotal || 0),
      remainingUploadCountTotal: Math.max(
        Number(apiKey.limitUploadCountTotal || 0) - Number(apiKey.uploadedCountTotal || 0),
        0
      )
    };
  } else {
    limits.auth = {
      mode: 'anonymous',
      limitPreparePerWindow: PREPARE_RATE_LIMIT,
      limitPrepareWindowMs: PREPARE_RATE_WINDOW_MS
    };
  }

  return limits;
}

async function writeFileMeta(id, filename, declaredType, env, options = {}) {
  const head = await env.FILES.head(id);
  if (!head) return null;
  const maxDownloads = normalizeMaxDownloads(options.maxDownloads);
  const expiresAt = normalizeExpiresAt(options.expiresAt);
  const meta = {
    id,
    name: filename,
    size: head.size,
    contentType: head.httpMetadata?.contentType || declaredType,
    uploadedAt: new Date().toISOString(),
    etag: head.httpEtag || head.etag || '',
    expiresAt: typeof expiresAt === 'string' ? expiresAt : null,
    maxDownloads: Number.isInteger(maxDownloads) && maxDownloads > 0 ? maxDownloads : null,
    downloadCount: 0,
    lastDownloadedAt: '',
    clientIp: String(options.clientIp || ''),
    clientRegion: String(options.clientRegion || '')
  };
  await saveJsonObject(metaKey(id), meta, env);
  return readFileMeta(id, env);
}

async function ensureUploadNotificationTable(env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS upload_notification_daily (
      day_key TEXT PRIMARY KEY,
      sent_count INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    )`
  ).run();
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

async function ensureAccountDataIndexes(env) {
  if (accountIndexesEnsured) return;
  for (const statement of [
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email)',
    'CREATE INDEX IF NOT EXISTS idx_magic_links_token_hash ON magic_links(token_hash)',
    'CREATE INDEX IF NOT EXISTS idx_sessions_session_hash ON sessions(session_hash)',
    'CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)',
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash)',
    'CREATE INDEX IF NOT EXISTS idx_api_keys_user_id_created_at ON api_keys(user_id, created_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_published_files_user_id_created_at ON published_files(user_id, created_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_sites_user_id ON sites(user_id)'
  ]) {
    try {
      await env.DB.prepare(statement).run();
    } catch {}
  }
  accountIndexesEnsured = true;
}

async function ensurePublishedFilesTable(env) {
  if (publishedFilesTableEnsured) return;
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
  try {
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_published_files_user_id_created_at ON published_files(user_id, created_at DESC)').run();
  } catch {}
  publishedFilesTableEnsured = true;
}

async function ensureSitesTables(env) {
  if (sitesTablesEnsured) return;
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
  try {
    await env.DB.prepare(
      `UPDATE sites
       SET updated_at = COALESCE(updated_at, completed_at, created_at)
       WHERE updated_at IS NULL OR updated_at = ''`
    ).run();
  } catch {}
  await env.DB.batch([
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_sites_created_at ON sites(created_at)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_sites_user_id ON sites(user_id)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_sites_user_id_updated_at ON sites(user_id, updated_at DESC)'),
    env.DB.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_sites_site_hostname ON sites(site_hostname)'),
    env.DB.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_sites_subdomain ON sites(subdomain)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_site_files_file_id ON site_files(file_id)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_site_releases_site_id ON site_releases(site_id)'),
    env.DB.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_site_releases_site_version ON site_releases(site_id, version_no)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_site_release_files_file_id ON site_release_files(file_id)')
  ]);
  sitesTablesEnsured = true;
}

function siteReleaseId() {
  return `rel_${generateId(12)}`;
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

async function getNextSiteReleaseVersion(siteId, env) {
  await ensureSitesTables(env);
  const row = await env.DB.prepare(
    'SELECT COALESCE(MAX(version_no), 0) AS version_no FROM site_releases WHERE site_id = ?'
  ).bind(siteId).first();
  return Number(row?.version_no || 0) + 1;
}

async function getSiteReleaseById(siteId, releaseId, env) {
  await ensureSitesTables(env);
  const item = await env.DB.prepare(
    `SELECT
        id, site_id, version_no, status, publish_origin, site_url, site_hostname, subdomain, entry_path,
        file_count, total_size, expires_at, based_on_release_id, change_summary, created_at, completed_at, activated_at
     FROM site_releases
     WHERE site_id = ? AND id = ?`
  ).bind(siteId, releaseId).first();
  if (!item) return null;
  return {
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
  };
}

async function listSiteReleases(siteId, env, limit = 20) {
  await ensureSitesTables(env);
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

async function listSiteReleaseFiles(releaseId, env) {
  await ensureSitesTables(env);
  const result = await env.DB.prepare(
    `SELECT release_id, relative_path, file_id, file_name, content_type, size, created_at
     FROM site_release_files
     WHERE release_id = ?
     ORDER BY relative_path ASC`
  ).bind(releaseId).all();
  return (result.results || []).map((item) => ({
    releaseId: item.release_id,
    relativePath: item.relative_path,
    fileId: item.file_id,
    fileName: item.file_name || '',
    contentType: item.content_type || 'application/octet-stream',
    size: Number(item.size || 0),
    createdAt: item.created_at || null
  }));
}

async function ensureSiteReleaseBackfill(siteId, env) {
  await ensureSitesTables(env);
  const site = await env.DB.prepare(
    `SELECT
        id, name, publish_origin, site_url, site_hostname, subdomain, entry_path, status, file_count, total_size, expires_at,
        api_key_id, user_id, active_release_id, created_at, completed_at, updated_at
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
    `SELECT site_id, relative_path, file_id, file_name, content_type, size, created_at
     FROM site_files
     WHERE site_id = ?
     ORDER BY relative_path ASC`
  ).bind(siteId).all();
  const files = filesResult.results || [];
  if (!files.length) return null;

  const now = new Date().toISOString();
  const releaseId = siteReleaseId();
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
      site.id,
      1,
      site.publish_origin || '',
      site.site_url || '',
      site.site_hostname || '',
      site.subdomain || '',
      site.entry_path || '',
      Number(site.file_count || files.length || 0),
      Number(site.total_size || 0),
      site.expires_at || null,
      null,
      JSON.stringify({ source: 'legacy-backfill' }),
      createdAt,
      completedAt,
      completedAt
    ),
    env.DB.prepare(
      'UPDATE sites SET active_release_id = ?, updated_at = ? WHERE id = ?'
    ).bind(releaseId, now, site.id)
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
        item.file_name || item.relative_path.split('/').pop() || item.file_id,
        item.content_type || 'application/octet-stream',
        Number(item.size || 0),
        item.created_at || createdAt
      )
    );
  }
  await env.DB.batch(statements);
  return releaseId;
}

async function summarizeSiteReleaseChange(siteId, files, env) {
  await ensureSitesTables(env);
  const currentFiles = await env.DB.prepare(
    `SELECT relative_path, file_id
     FROM site_files
     WHERE site_id = ?`
  ).bind(siteId).all();
  const previous = new Map((currentFiles.results || []).map((item) => [item.relative_path, item.file_id]));
  const next = new Map(files.map((item) => [item.relativePath, item.fileId]));
  let added = 0;
  let modified = 0;
  let unchanged = 0;
  let removed = 0;
  for (const [relativePath, fileId] of next.entries()) {
    if (!previous.has(relativePath)) {
      added += 1;
      continue;
    }
    if (previous.get(relativePath) === fileId) unchanged += 1;
    else modified += 1;
  }
  for (const relativePath of previous.keys()) {
    if (!next.has(relativePath)) removed += 1;
  }
  return {
    added,
    modified,
    removed,
    unchanged
  };
}

async function activateSiteRelease(siteId, releaseId, env) {
  await ensureSitesTables(env);
  await ensureSiteReleaseBackfill(siteId, env);
  const release = await getSiteReleaseById(siteId, releaseId, env);
  if (!release) throw new Error('Site release does not exist');
  const site = await getSiteById(siteId, env);
  if (!site) throw new Error('Site does not exist');
  const files = await listSiteReleaseFiles(releaseId, env);
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
       SET name = ?, publish_origin = ?, site_url = ?, site_hostname = ?, subdomain = ?, active_release_id = ?,
           entry_path = ?, status = 'active', file_count = ?, total_size = ?, expires_at = ?, completed_at = ?, updated_at = ?
       WHERE id = ?`
    ).bind(
      site.name,
      release.publishOrigin,
      release.siteUrl,
      release.siteHostname,
      release.subdomain,
      release.id,
      release.entryPath,
      files.length,
      release.totalSize,
      release.expiresAt,
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
        item.relativePath,
        item.fileId,
        item.fileName,
        item.contentType,
        item.size,
        item.createdAt || now
      )
    );
  }
  await env.DB.batch(statements);
  return {
    release: {
      ...release,
      fileCount: files.length,
      activatedAt: now
    },
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

function buildPublishedLinks(origin, id) {
  return {
    url: `${origin}/i/${id}`,
    downloadUrl: `${origin}/d/${id}`,
    playUrl: `${origin}/i/${id}?play=1`
  };
}

async function getConfiguredPublishOrigin(env) {
  await ensureAppSettingsTable(env);
  const row = await env.DB.prepare(
    'SELECT value FROM app_settings WHERE key = ?'
  ).bind(PUBLISH_DOMAIN_SETTING_KEY).first();
  const normalized = normalizePublishOrigin(row?.value);
  return typeof normalized === 'string' ? normalized : null;
}

async function resolvePublishOrigin(request, env) {
  const configured = await getConfiguredPublishOrigin(env);
  if (configured) return configured;
  const fallback = normalizePublishOrigin(new URL(request.url).origin);
  return typeof fallback === 'string' ? fallback : new URL(request.url).origin;
}

async function recordPublishedFile(id, meta, links, session, env) {
  await ensurePublishedFilesTable(env);
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO published_files (
      id, file_name, content_type, size, publish_origin, view_url, download_url, play_url, client_ip, client_region, api_key_id, user_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      file_name = excluded.file_name,
      content_type = excluded.content_type,
      size = excluded.size,
      publish_origin = excluded.publish_origin,
      view_url = excluded.view_url,
      download_url = excluded.download_url,
      play_url = excluded.play_url,
      client_ip = excluded.client_ip,
      client_region = excluded.client_region,
      api_key_id = excluded.api_key_id,
      user_id = excluded.user_id,
      created_at = excluded.created_at`
  ).bind(
    id,
    meta?.name || id,
    meta?.contentType || '',
    Number(meta?.size || 0),
    normalizePublishOrigin(new URL(links.url).origin) || new URL(links.url).origin,
    links.url,
    links.downloadUrl,
    links.playUrl,
    meta?.clientIp || session?.clientIp || null,
    meta?.clientRegion || session?.clientRegion || null,
    session?.apiKeyId || null,
    session?.userId || null,
    now
  ).run();
}

async function saveSiteMapping(site, files, env, options = {}) {
  await ensureSitesTables(env);
  await ensureSiteReleaseBackfill(site.id, env);
  const now = new Date().toISOString();
  const releaseId = options.releaseId || siteReleaseId();
  const versionNo = Number(options.versionNo || await getNextSiteReleaseVersion(site.id, env));
  const basedOnReleaseId = options.basedOnReleaseId || null;
  const changeSummary = options.changeSummary || await summarizeSiteReleaseChange(site.id, files, env);
  const statements = [
    env.DB.prepare(
      `INSERT INTO sites (
        id, name, publish_origin, site_url, site_hostname, subdomain, entry_path, status, file_count, total_size, expires_at,
        api_key_id, user_id, active_release_id, created_at, completed_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        publish_origin = excluded.publish_origin,
        site_url = excluded.site_url,
        site_hostname = excluded.site_hostname,
        subdomain = excluded.subdomain,
        expires_at = excluded.expires_at,
        api_key_id = COALESCE(sites.api_key_id, excluded.api_key_id),
        user_id = COALESCE(sites.user_id, excluded.user_id),
        updated_at = excluded.updated_at`
    ).bind(
      site.id,
      site.name,
      site.publishOrigin,
      site.siteUrl,
      site.siteHostname,
      site.subdomain,
      site.entryPath,
      files.length,
      site.totalSize,
      site.expiresAt,
      site.apiKeyId,
      site.userId,
      '',
      site.createdAt,
      site.completedAt || null,
      now
    ),
    env.DB.prepare(
      `INSERT INTO site_releases (
        id, site_id, version_no, status, publish_origin, site_url, site_hostname, subdomain, entry_path,
        file_count, total_size, expires_at, based_on_release_id, change_summary, created_at, completed_at, activated_at
      ) VALUES (?, ?, ?, 'ready', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`
    ).bind(
      releaseId,
      site.id,
      versionNo,
      site.publishOrigin,
      site.siteUrl,
      site.siteHostname,
      site.subdomain,
      site.entryPath,
      files.length,
      site.totalSize,
      site.expiresAt,
      basedOnReleaseId,
      JSON.stringify(changeSummary),
      site.createdAt,
      now
    )
  ];
  for (const item of files) {
    statements.push(
      env.DB.prepare(
        `INSERT INTO site_release_files (
          release_id, relative_path, file_id, file_name, content_type, size, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        releaseId,
        item.relativePath,
        item.fileId,
        item.fileName,
        item.contentType,
        item.size,
        now
      )
    );
  }
  await env.DB.batch(statements);
  await activateSiteRelease(site.id, releaseId, env);
  return {
    releaseId,
    versionNo,
    changeSummary
  };
}

async function getSiteById(siteId, env) {
  await ensureSitesTables(env);
  const item = await env.DB.prepare(
    `SELECT id, name, publish_origin, site_url, site_hostname, subdomain, entry_path, status, file_count, total_size, expires_at,
            api_key_id, user_id, active_release_id, created_at, completed_at, updated_at
     FROM sites WHERE id = ?`
  ).bind(siteId).first();
  if (!item) return null;
  return {
    id: item.id,
    name: item.name,
    publishOrigin: item.publish_origin,
    siteUrl: item.site_url,
    siteHostname: item.site_hostname || '',
    subdomain: item.subdomain || '',
    entryPath: item.entry_path,
    status: item.status,
    fileCount: Number(item.file_count || 0),
    totalSize: Number(item.total_size || 0),
    expiresAt: item.expires_at || null,
    apiKeyId: item.api_key_id || null,
    userId: item.user_id || null,
    activeReleaseId: item.active_release_id || null,
    createdAt: item.created_at,
    completedAt: item.completed_at || null,
    updatedAt: item.updated_at || null
  };
}

async function getSiteByHostname(hostname, env) {
  await ensureSitesTables(env);
  const item = await env.DB.prepare(
    `SELECT id, name, publish_origin, site_url, site_hostname, subdomain, entry_path, status, file_count, total_size, expires_at,
            api_key_id, user_id, active_release_id, created_at, completed_at, updated_at
     FROM sites WHERE site_hostname = ?`
  ).bind(String(hostname || '').toLowerCase()).first();
  if (!item) return null;
  return {
    id: item.id,
    name: item.name,
    publishOrigin: item.publish_origin,
    siteUrl: item.site_url,
    siteHostname: item.site_hostname || '',
    subdomain: item.subdomain || '',
    entryPath: item.entry_path,
    status: item.status,
    fileCount: Number(item.file_count || 0),
    totalSize: Number(item.total_size || 0),
    expiresAt: item.expires_at || null,
    apiKeyId: item.api_key_id || null,
    userId: item.user_id || null,
    activeReleaseId: item.active_release_id || null,
    createdAt: item.created_at,
    completedAt: item.completed_at || null,
    updatedAt: item.updated_at || null
  };
}

function canManageSite(site, actor) {
  if (!site || !actor) return false;
  if (actor.session?.isAdmin) return true;
  if (actor.session?.userId && site.userId && actor.session.userId === site.userId) return true;
  if (actor.apiKey?.id && site.apiKeyId && actor.apiKey.id === site.apiKeyId) return true;
  if (actor.apiKey?.userId && site.userId && actor.apiKey.userId === site.userId) return true;
  return false;
}

function isValidSiteUpdateTokenPayload(payload, siteId) {
  if (!payload || payload.siteId !== siteId) return false;
  const expiresAt = payload.expiresAt ? new Date(payload.expiresAt).getTime() : NaN;
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return false;
  return true;
}

async function getSiteFileRecord(siteId, relativePath, env) {
  await ensureSitesTables(env);
  const item = await env.DB.prepare(
    `SELECT site_id, relative_path, file_id, file_name, content_type, size, created_at
     FROM site_files WHERE site_id = ? AND relative_path = ?`
  ).bind(siteId, relativePath).first();
  if (!item) return null;
  return {
    siteId: item.site_id,
    relativePath: item.relative_path,
    fileId: item.file_id,
    fileName: item.file_name,
    contentType: item.content_type || 'application/octet-stream',
    size: Number(item.size || 0),
    createdAt: item.created_at
  };
}

async function listSiteDirectory(site, requestedPath, env) {
  await ensureSitesTables(env);
  const raw = String(requestedPath || '');
  const normalizedRequest = decodeSitePath(raw.replace(/^\/+/, '').replace(/\/+$/, ''));
  const normalizedDir = normalizeRelativePath(normalizedRequest);
  const directoryPath = typeof normalizedDir === 'string' ? normalizedDir : '';
  const prefix = directoryPath ? `${directoryPath}/` : '';
  const result = await env.DB.prepare(
    `SELECT site_id, relative_path, file_id, file_name, content_type, size, created_at
     FROM site_files
     WHERE site_id = ? AND relative_path LIKE ?
     ORDER BY relative_path ASC`
  ).bind(site.id, `${prefix}%`).all();
  const rows = result.results || [];
  const directories = new Map();
  const directFiles = [];
  for (const item of rows) {
    const relativePath = String(item.relative_path || '');
    const remainder = prefix ? relativePath.slice(prefix.length) : relativePath;
    if (!remainder) continue;
    const slashIndex = remainder.indexOf('/');
    if (slashIndex >= 0) {
      const dirName = remainder.slice(0, slashIndex);
      if (!dirName) continue;
      if (!directories.has(dirName)) {
        const fullPath = prefix ? `${prefix}${dirName}` : dirName;
        directories.set(dirName, {
          kind: 'directory',
          name: dirName,
          relativePath: fullPath,
          href: siteDirectoryHref(fullPath),
          fileCount: 0,
          totalSize: 0,
          latestUpdatedAt: ''
        });
      }
      const directory = directories.get(dirName);
      directory.fileCount += 1;
      directory.totalSize += Number(item.size || 0);
      if (!directory.latestUpdatedAt || new Date(item.created_at || 0).getTime() > new Date(directory.latestUpdatedAt || 0).getTime()) {
        directory.latestUpdatedAt = item.created_at || directory.latestUpdatedAt;
      }
      continue;
    }
    directFiles.push(item);
  }
  const files = await Promise.all(directFiles.map(async (item) => {
    const meta = await readFileMeta(item.file_id, env);
    const contentType = siteFileContentType(
      item.relative_path,
      item.content_type || meta?.contentType,
      item.file_name || meta?.name || item.relative_path
    );
    return {
      kind: 'file',
      name: item.file_name || item.relative_path.split('/').pop() || item.relative_path,
      relativePath: item.relative_path,
      href: siteFileHref(item.relative_path),
      downloadHref: siteFileHref(item.relative_path, { download: true }),
      fileId: item.file_id,
      contentType,
      size: Number(meta?.size || item.size || 0),
      uploadedAt: meta?.uploadedAt || item.created_at || '',
      createdAt: item.created_at || ''
    };
  }));
  const directoryItems = Array.from(directories.values()).sort((a, b) => siteListingNaturalCompare(a.name, b.name));
  const fileItems = files.sort((a, b) => siteListingNaturalCompare(a.name, b.name));
  if (!directoryItems.length && !fileItems.length) return null;
  const visibleSize = directoryItems.reduce((sum, item) => sum + Number(item.totalSize || 0), 0) +
    fileItems.reduce((sum, item) => sum + Number(item.size || 0), 0);
  const summaryCandidates = [
    ...directoryItems.map((item) => item.latestUpdatedAt || ''),
    ...fileItems.map((item) => item.uploadedAt || item.createdAt || '')
  ]
    .map((value) => new Date(value || 0).getTime())
    .filter((value) => Number.isFinite(value) && value > 0);
  return {
    directoryPath,
    directories: directoryItems,
    files: fileItems,
    totalSize: visibleSize,
    latestUpdatedAt: summaryCandidates.length ? new Date(Math.max(...summaryCandidates)).toISOString() : ''
  };
}

function siteDirectoryListingHTML(site, listing) {
  const pathParts = listing.directoryPath ? listing.directoryPath.split('/') : [];
  const crumbs = [{ name: site.name || site.id || 'site', href: '/' }];
  let current = '';
  for (const part of pathParts) {
    current = current ? `${current}/${part}` : part;
    crumbs.push({
      name: part,
      href: siteDirectoryHref(current)
    });
  }
  const parentPath = siteListingParentPath(listing.directoryPath);
  const parentHref = listing.directoryPath ? siteDirectoryHref(parentPath) : '';
  const rows = [
    ...(listing.directoryPath ? [`
      <tr class="parent-row" data-kind="directory" data-name=".." data-size="-1" data-time="0">
        <td>
          <a href="${parentHref}" class="name-link">
            <span class="file-icon directory">UP</span>
            <span class="name-stack">
              <span class="name-main">..</span>
              <span class="name-sub">Back to parent directory</span>
            </span>
          </a>
        </td>
        <td><span class="type-pill directory">Parent</span></td>
        <td>-</td>
        <td>-</td>
        <td><a class="btn" href="${parentHref}">Go Up</a></td>
      </tr>
    `] : []),
    ...listing.directories.map((item) => `
      <tr data-kind="directory" data-filter="directory" data-name="${escapeHtml(item.name)}" data-size="${Number(item.totalSize || 0)}" data-time="${new Date(item.latestUpdatedAt || 0).getTime() || 0}">
        <td>
          <a href="${item.href}" class="name-link">
            <span class="file-icon directory">DIR</span>
            <span class="name-stack">
              <span class="name-main">${escapeHtml(item.name)}</span>
              <span class="name-sub">${item.fileCount} entries · ${escapeHtml(formatSize(Number(item.totalSize || 0)))}</span>
            </span>
          </a>
        </td>
        <td><span class="type-pill directory">Directory</span></td>
        <td>${escapeHtml(formatSize(Number(item.totalSize || 0)))}</td>
        <td>${escapeHtml(formatSiteListingTime(item.latestUpdatedAt || ''))}</td>
        <td><a class="btn" href="${item.href}">Open Directory</a></td>
      </tr>
    `),
    ...listing.files.map((item) => {
      const actionHref = (isImage(item.contentType) || isVideo(item.contentType)) ? item.href : item.downloadHref;
      const actionLabel = isImage(item.contentType) ? 'View' : (isVideo(item.contentType) ? 'Play' : 'Download');
      const visual = siteListingVisual('file', item.contentType, item.name);
      const filterCategory = siteListingFilterCategory('file', item.contentType, item.name);
      const uploadedAt = item.uploadedAt || item.createdAt || '';
      return `
        <tr data-kind="file" data-filter="${filterCategory}" data-name="${escapeHtml(item.name)}" data-size="${Number(item.size || 0)}" data-time="${new Date(uploadedAt || 0).getTime() || 0}">
          <td>
            <a href="${actionHref}" class="name-link">
              <span class="file-icon ${visual.className}">${visual.icon}</span>
              <span class="name-stack">
                <span class="name-main">${escapeHtml(item.name)}</span>
                <span class="name-sub">${escapeHtml(item.contentType || 'application/octet-stream')}</span>
              </span>
            </a>
          </td>
          <td><span class="type-pill ${visual.className}">${visual.label}</span></td>
          <td>${escapeHtml(formatSize(item.size))}</td>
          <td>${escapeHtml(formatSiteListingTime(uploadedAt))}</td>
          <td><a class="btn" href="${actionHref}">${actionLabel}</a></td>
        </tr>
      `;
    })
  ].join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(site.name || site.id)} - File Listing</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#f5f7fb">
<style>*{box-sizing:border-box}html{background:#f5f7fb}body{margin:0;font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:linear-gradient(180deg,#f7f9fc 0%,#eef3f9 100%);color:#334155}.topbar{position:sticky;top:0;z-index:20;background:rgba(247,249,252,.92);backdrop-filter:blur(14px);border-bottom:1px solid #dde6f0}.topbar-inner{width:min(1120px,100%);margin:0 auto;padding:14px 24px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}.brand{display:inline-flex;align-items:center;gap:10px;text-decoration:none}.brand-logo{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:10px;background:linear-gradient(135deg,#f48120,#ffb347);color:#fff;font-weight:800;box-shadow:0 8px 18px rgba(244,129,32,.2)}.brand-copy strong{display:block;font-size:16px;color:#0f172a}.brand-copy span{display:block;font-size:12px;color:#64748b}.top-actions{display:flex;gap:10px;flex-wrap:wrap}.top-actions a{padding:8px 14px;border-radius:999px;border:1px solid #dce4ee;background:#fff;color:#475569;text-decoration:none;font-size:12px;box-shadow:0 1px 2px rgba(15,23,42,.04)}.top-actions a:hover{border-color:#c7d6ea;background:#f8fafc;color:#0f172a}.wrap{max-width:1120px;margin:0 auto;padding:24px}.crumbs{display:flex;gap:8px;flex-wrap:wrap;font-size:13px;color:#94a3b8;margin:14px 0 18px}.crumb{display:inline-flex;align-items:center;gap:8px}.crumb a{color:#1d4ed8;text-decoration:none}.crumb.current span:last-child{color:#0f172a;font-weight:700}.summary{display:flex;gap:14px;flex-wrap:wrap;color:#64748b;font-size:13px;margin-bottom:16px}.toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:14px}.toolbar-group{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.sorts,.filters{display:flex;gap:8px;flex-wrap:wrap}.sort-btn,.filter-btn{appearance:none;border:1px solid #dce4ee;background:#fff;color:#334155;padding:8px 12px;border-radius:999px;font-size:12px;cursor:pointer;transition:.18s}.sort-btn:hover,.filter-btn:hover{border-color:#c7d6ea;background:#f8fafc;color:#0f172a}.sort-btn.active,.filter-btn.active{border-color:#dbeafe;color:#1d4ed8;background:#eff6ff}.toolbar-note{font-size:12px;color:#64748b}.panel{background:#fff;border:1px solid #dce4ee;border-radius:18px;overflow:hidden;box-shadow:0 12px 28px rgba(15,23,42,.05)}.title{padding:18px 20px;border-bottom:1px solid #e7edf4}.title h1{font-size:22px;margin:0 0 6px;color:#0f172a}.title p{margin:0;color:#64748b;font-size:14px}.name-link{display:flex;align-items:center;gap:12px;color:#0f172a;text-decoration:none;min-width:0}.name-stack{display:flex;flex-direction:column;gap:4px;min-width:0}.name-main{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.name-sub{font-size:12px;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.file-icon{display:inline-flex;align-items:center;justify-content:center;min-width:44px;height:30px;padding:0 8px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:.04em;border:1px solid transparent}.file-icon.directory{background:#eff6ff;border-color:#dbeafe;color:#1d4ed8}.file-icon.image{background:#ecfdf3;border-color:#bbf7d0;color:#166534}.file-icon.video{background:#fff1f2;border-color:#fecdd3;color:#e11d48}.file-icon.pdf{background:#fff7ed;border-color:#fed7aa;color:#c2410c}.file-icon.code{background:#f5f3ff;border-color:#ddd6fe;color:#7c3aed}.file-icon.text{background:#fefce8;border-color:#fef08a;color:#a16207}.file-icon.audio{background:#f0fdf4;border-color:#bbf7d0;color:#15803d}.file-icon.archive{background:#fff7ed;border-color:#fdba74;color:#c2410c}.file-icon.file{background:#f8fafc;border-color:#e2e8f0;color:#475569}.type-pill{display:inline-flex;align-items:center;justify-content:center;padding:6px 10px;border-radius:999px;font-size:12px;border:1px solid transparent}.type-pill.directory{background:#eff6ff;border-color:#dbeafe;color:#1d4ed8}.type-pill.image{background:#ecfdf3;border-color:#bbf7d0;color:#166534}.type-pill.video{background:#fff1f2;border-color:#fecdd3;color:#e11d48}.type-pill.pdf{background:#fff7ed;border-color:#fed7aa;color:#c2410c}.type-pill.code{background:#f5f3ff;border-color:#ddd6fe;color:#7c3aed}.type-pill.text{background:#fefce8;border-color:#fef08a;color:#a16207}.type-pill.audio{background:#f0fdf4;border-color:#bbf7d0;color:#15803d}.type-pill.archive{background:#fff7ed;border-color:#fdba74;color:#c2410c}.type-pill.file{background:#f8fafc;border-color:#e2e8f0;color:#475569}table{width:100%;border-collapse:collapse}th,td{padding:14px 16px;border-bottom:1px solid #e7edf4;text-align:left;font-size:14px;vertical-align:middle}th{color:#64748b;font-weight:600;background:#fbfcfe}.parent-row td{background:#f8fafc}tr:last-child td{border-bottom:none}tr[hidden]{display:none !important}a{color:#1d4ed8;text-decoration:none}.btn{display:inline-block;padding:7px 12px;border:1px solid #dce4ee;border-radius:10px;color:#334155;background:#fff}.btn:hover{border-color:#c7d6ea;color:#0f172a;background:#f8fafc}.empty{padding:32px 20px;color:#64748b}@media (max-width:860px){.topbar-inner{padding:12px 16px}.wrap{padding:16px}th:nth-child(2),td:nth-child(2){display:none}}@media (max-width:620px){th:nth-child(4),td:nth-child(4){display:none}.file-icon{min-width:38px;height:28px;font-size:10px}}</style></head>
<body><div class="topbar"><div class="topbar-inner"><a class="brand" href="/en/"><span class="brand-logo">O</span><span class="brand-copy"><strong>OkFile Console</strong><span>Site Listing</span></span></a><div class="top-actions"><a href="/en/">Home</a><a href="/en/upload/">Manual Upload</a><a href="/en/account/">Account</a></div></div></div><div class="wrap"><div class="title"><h1>Site File Listing</h1><p>${escapeHtml(site.name || site.id || 'site')}</p></div>
<div class="crumbs">${crumbs.map((item, index) => {
    const isCurrent = index === crumbs.length - 1;
    return `<span class="crumb${isCurrent ? ' current' : ''}">${index ? '<span>/</span>' : ''}${isCurrent ? `<span>${escapeHtml(item.name)}</span>` : `<a href="${item.href}">${escapeHtml(item.name)}</a>`}</span>`;
  }).join('')}</div>
<div class="summary"><span>Directories: ${listing.directories.length}</span><span>Files: ${listing.files.length}</span><span>Current directory size: ${escapeHtml(formatSize(Number(listing.totalSize || 0)))}</span><span>Last updated: ${escapeHtml(formatSiteListingTime(listing.latestUpdatedAt || ''))}</span><span>Site: ${escapeHtml(site.siteHostname || '')}</span></div>
<div class="toolbar">
  <div class="toolbar-group">
    <div class="sorts">
      <button class="sort-btn active" type="button" data-sort="name">By Name</button>
      <button class="sort-btn" type="button" data-sort="time">By Time</button>
      <button class="sort-btn" type="button" data-sort="size">By Size</button>
    </div>
    <div class="filters">
      <button class="filter-btn active" type="button" data-filter="all">All</button>
      <button class="filter-btn" type="button" data-filter="directory">Directories</button>
      <button class="filter-btn" type="button" data-filter="image">Images</button>
      <button class="filter-btn" type="button" data-filter="video">Videos</button>
      <button class="filter-btn" type="button" data-filter="document">Documents</button>
      <button class="filter-btn" type="button" data-filter="text">Text</button>
      <button class="filter-btn" type="button" data-filter="other">Other</button>
    </div>
  </div>
  <div class="toolbar-note">${listing.directoryPath ? `<a class="btn" href="${parentHref}">Go Up</a>` : 'Directories are shown first. Files can be sorted by name, time, or size.'}</div>
</div>
<div class="panel">${rows ? `<table><thead><tr><th>Name</th><th>Type</th><th>Size</th><th>Uploaded At</th><th>Action</th></tr></thead><tbody id="siteListingBody">${rows}</tbody></table>` : '<div class="empty">This directory is empty.</div>'}</div>
</div>
<script>
(function () {
  var body = document.getElementById('siteListingBody');
  if (!body) return;
  var sortStorageKey = 'okfile_site_listing_sort';
  var buttons = Array.prototype.slice.call(document.querySelectorAll('.sort-btn'));
  var filterButtons = Array.prototype.slice.call(document.querySelectorAll('.filter-btn'));
  var currentSort = 'name';
  var currentFilter = 'all';
  function compareByName(a, b) {
    return String(a.dataset.name || '').localeCompare(String(b.dataset.name || ''), 'en', { numeric: true, sensitivity: 'base' });
  }
  function isSticky(row) {
    return row.classList.contains('parent-row');
  }
  function kindRank(row) {
    if (isSticky(row)) return -1;
    return row.dataset.kind === 'directory' ? 0 : 1;
  }
  function sortRows(mode) {
    var rows = Array.prototype.slice.call(body.querySelectorAll('tr'));
    rows.sort(function (a, b) {
      var rank = kindRank(a) - kindRank(b);
      if (rank !== 0) return rank;
      if (mode === 'size' && a.dataset.kind === 'file' && b.dataset.kind === 'file') {
        var sizeDiff = Number(b.dataset.size || 0) - Number(a.dataset.size || 0);
        if (sizeDiff !== 0) return sizeDiff;
      }
      if (mode === 'time' && a.dataset.kind === 'file' && b.dataset.kind === 'file') {
        var timeDiff = Number(b.dataset.time || 0) - Number(a.dataset.time || 0);
        if (timeDiff !== 0) return timeDiff;
      }
      return compareByName(a, b);
    });
    rows.forEach(function (row) { body.appendChild(row); });
    buttons.forEach(function (button) {
      button.classList.toggle('active', button.getAttribute('data-sort') === mode);
    });
    currentSort = mode;
    try { localStorage.setItem(sortStorageKey, mode); } catch (_) {}
  }
  function applyFilter(mode) {
    var rows = Array.prototype.slice.call(body.querySelectorAll('tr'));
    rows.forEach(function (row) {
      if (isSticky(row)) {
        row.hidden = false;
        return;
      }
      if (mode === 'all') {
        row.hidden = false;
        return;
      }
      row.hidden = (row.getAttribute('data-filter') || '') !== mode;
    });
    filterButtons.forEach(function (button) {
      button.classList.toggle('active', button.getAttribute('data-filter') === mode);
    });
    currentFilter = mode;
  }
  buttons.forEach(function (button) {
    button.addEventListener('click', function () {
      sortRows(button.getAttribute('data-sort') || 'name');
    });
  });
  filterButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      applyFilter(button.getAttribute('data-filter') || 'all');
    });
  });
  try {
    var savedSort = localStorage.getItem(sortStorageKey);
    if (savedSort === 'name' || savedSort === 'time' || savedSort === 'size') {
      currentSort = savedSort;
    }
  } catch (_) {}
  sortRows(currentSort);
  applyFilter(currentFilter);
})();
</script></body></html>`;
}

async function reserveUploadNotificationSlot(env) {
  await ensureUploadNotificationTable(env);
  const dayKey = new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();
  await env.DB.prepare(
    'INSERT OR IGNORE INTO upload_notification_daily (day_key, sent_count, updated_at) VALUES (?, 0, ?)'
  ).bind(dayKey, now).run();
  const result = await env.DB.prepare(
    `UPDATE upload_notification_daily
     SET sent_count = sent_count + 1, updated_at = ?
     WHERE day_key = ? AND sent_count < ?`
  ).bind(now, dayKey, UPLOAD_NOTIFY_DAILY_LIMIT).run();
  return Boolean(result?.meta?.changes);
}

async function releaseUploadNotificationSlot(env) {
  await ensureUploadNotificationTable(env);
  await env.DB.prepare(
    `UPDATE upload_notification_daily
     SET sent_count = CASE WHEN sent_count > 0 THEN sent_count - 1 ELSE 0 END,
         updated_at = ?
     WHERE day_key = ?`
  ).bind(new Date().toISOString(), new Date().toISOString().slice(0, 10)).run();
}

async function sendUploadNotification(meta, request, env, links = null) {
  if (!env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL) return { sent: false, skipped: true, reason: 'email_not_configured' };
  const reserved = await reserveUploadNotificationSlot(env);
  if (!reserved) return { sent: false, skipped: true, reason: 'daily_limit_reached' };
  const publishLinks = links || buildPublishedLinks(await resolvePublishOrigin(request, env), meta.id);
  const viewUrl = publishLinks.url;
  const downloadUrl = publishLinks.downloadUrl;
  const playUrl = publishLinks.playUrl;
  const sourceIp = meta.clientIp || 'Unknown';
  const sourceRegion = meta.clientRegion || 'Unknown';
  const html = `<div style="font-family:Arial,sans-serif;line-height:1.7;color:#111">
    <h2>New File Uploaded</h2>
    <ul>
      <li>File name: ${escapeHtml(meta.name || meta.id)}</li>
      <li>File ID: ${escapeHtml(meta.id)}</li>
      <li>Size: ${escapeHtml(formatSize(meta.size))}</li>
      <li>Content type: ${escapeHtml(meta.contentType || 'application/octet-stream')}</li>
      <li>Uploaded at: ${escapeHtml(meta.uploadedAt || new Date().toISOString())}</li>
      <li>IP address: ${escapeHtml(sourceIp)}</li>
      <li>Region: ${escapeHtml(sourceRegion)}</li>
      ${meta.expiresAt ? `<li>Expires at: ${escapeHtml(meta.expiresAt)}</li>` : ''}
    </ul>
    <p>Relevant links:</p>
    <ul>
      <li>Preview page: <a href="${viewUrl}">${viewUrl}</a></li>
      <li>Download page: <a href="${downloadUrl}">${downloadUrl}</a></li>
      <li>Playback page: <a href="${playUrl}">${playUrl}</a></li>
    </ul>
  </div>`;
  const text = [
    'New File Uploaded',
    '',
    `File name: ${meta.name || meta.id}`,
    `File ID: ${meta.id}`,
    `Size: ${formatSize(meta.size)}`,
    `Content type: ${meta.contentType || 'application/octet-stream'}`,
    `Uploaded at: ${meta.uploadedAt || new Date().toISOString()}`,
    `IP address: ${sourceIp}`,
    `Region: ${sourceRegion}`,
    meta.expiresAt ? `Expires at: ${meta.expiresAt}` : '',
    '',
    'Relevant links:',
    `Preview page: ${viewUrl}`,
    `Download page: ${downloadUrl}`,
    `Playback page: ${playUrl}`
  ].filter(Boolean).join('\n');
  try {
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: env.RESEND_FROM_EMAIL,
        to: [UPLOAD_NOTIFY_TO_EMAIL],
        subject: `${UPLOAD_NOTIFY_SUBJECT_PREFIX}: ${meta.name || meta.id}`,
        html,
        text
      })
    });
    if (!resendRes.ok) {
      const errorText = await resendRes.text();
      throw new Error(`Failed to send upload notification: ${errorText}`);
    }
    return { sent: true };
  } catch (error) {
    await releaseUploadNotificationSlot(env);
    throw error;
  }
}

function parseMetaIdFromKey(key) {
  const match = new RegExp(`^${META_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([a-zA-Z0-9]+)\\.json$`).exec(String(key || ''));
  return match ? match[1] : null;
}

async function deleteFileAndMeta(id, env) {
  await env.FILES.delete(id);
  await env.FILES.delete(metaKey(id));
  await ensurePublishedFilesTable(env);
  await env.DB.prepare('DELETE FROM published_files WHERE id = ?').bind(id).run();
}

async function cleanupExpiredFiles(env, options = {}) {
  const limit = Math.max(1, Math.min(Number(options.limit || 100), 1000));
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

async function recordDownloadAndGetMeta(id, env) {
  const currentMeta = await readFileMeta(id, env);
  if (!currentMeta) return { success: false, status: 404 };
  if (isMetaExpired(currentMeta)) {
    return { success: false, status: 410, meta: currentMeta };
  }
  if (!currentMeta.downloadLimitEnabled) {
    return { success: true, meta: currentMeta };
  }
  if ((currentMeta.remainingDownloads || 0) <= 0) {
    return { success: false, status: 403, meta: currentMeta };
  }

  const sidecar = await readSidecarMeta(id, env);
  const nextMeta = {
    ...(sidecar || {}),
    id,
    name: currentMeta.name,
    size: currentMeta.size,
    contentType: currentMeta.contentType,
    uploadedAt: currentMeta.uploadedAt,
    etag: currentMeta.etag,
    maxDownloads: currentMeta.maxDownloads,
    downloadCount: (currentMeta.downloadCount || 0) + 1,
    lastDownloadedAt: new Date().toISOString()
  };
  await saveJsonObject(metaKey(id), nextMeta, env);
  return {
    success: true,
    meta: await readFileMeta(id, env)
  };
}

async function finalizeUploadedFile(request, env, options) {
  const {
    id,
    filename,
    declaredType,
    expectedSize = 0,
    maxDownloads = null,
    expiresAt = null,
    apiKeyId = null,
    userId = null,
    clientIp = '',
    clientRegion = '',
    reportedObjectEtag = '',
    partEtagValidated = false,
    objectEtagValidated = false,
    deleteSessionOnSuccess = false
  } = options || {};

  const head = await env.FILES.head(id);
  if (!head) return json({ error: 'The file is not present in R2 yet and cannot be finalized' }, 404);
  if (expectedSize > 0 && head.size !== expectedSize) {
    return json({ error: `File size mismatch: expected ${expectedSize} bytes, got ${head.size} bytes` }, 409);
  }

  const objectEtagCheck = validateReportedObjectETag(reportedObjectEtag, head.httpEtag || head.etag || '');
  if (!objectEtagCheck.ok) {
    return json({ success: false, error: objectEtagCheck.error }, objectEtagCheck.status);
  }
  const didValidateObjectEtag = Boolean(objectEtagValidated || objectEtagCheck.validated);

  const meta = await writeFileMeta(id, filename, declaredType, env, {
    maxDownloads,
    expiresAt,
    clientIp,
    clientRegion
  });
  if (apiKeyId) {
    await incrementApiKeyUploadCount(apiKeyId, env);
  }
  const publishOrigin = await resolvePublishOrigin(request, env);
  const publishLinks = buildPublishedLinks(publishOrigin, id);
  await recordPublishedFile(id, meta, publishLinks, { apiKeyId, userId, clientIp, clientRegion }, env);
  try {
    await sendUploadNotification(meta, request, env, publishLinks);
  } catch (error) {
    console.error(error.message || error);
  }
  if (deleteSessionOnSuccess) {
    await deleteUploadSession(id, env);
  }

  return json({
    success: true,
    id,
    url: publishLinks.url,
    downloadUrl: publishLinks.downloadUrl,
    playUrl: publishLinks.playUrl,
    type: classifyContent(meta?.contentType || declaredType),
    etag: meta?.etag || normalizeETag(head.httpEtag || head.etag || ''),
    integrity: {
      etag: meta?.etag || normalizeETag(head.httpEtag || head.etag || ''),
      validated: partEtagValidated || didValidateObjectEtag,
      objectEtagValidated: didValidateObjectEtag,
      partEtagValidated
    },
    expiresAt: meta?.expiresAt ?? null,
    maxDownloads: meta?.maxDownloads ?? null,
    downloadCount: meta?.downloadCount ?? 0,
    remainingDownloads: meta?.remainingDownloads ?? null
  });
}

function getRequestApiKey(request, body) {
  return String(request.headers.get('x-api-key') || body?.apiKey || '').trim();
}

async function handleAuthRequestLink(request, env) {
  let body;
  try {
    body = await request.json();
  } catch (error) {
    return json({ error: `Request body must be valid JSON: ${error.message}` }, 400);
  }
  const email = normalizeEmail(body?.email);
  if (!isEmail(email)) return json({ error: 'Please provide a valid email address' }, 400);
  const nextPath = sanitizeAccountNextPath(body?.next, localizedAccountPagePath('en', 'overview'));
  try {
    await sendMagicLink(email, request, env, nextPath);
    return json({ success: true, message: 'Verification link sent. Please check your email' });
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
  const nextPath = sanitizeAccountNextPath(url.searchParams.get('next'), localizedAccountPagePath('en', 'overview'));
  return redirect(nextPath, { 'Set-Cookie': buildSessionCookie(sessionToken, request) });
}

async function handleAccountMe(request, env) {
  const session = await getSessionFromRequest(request, env);
  if (!session) return json({ error: 'Please sign in first' }, 401);
  const detail = String(new URL(request.url).searchParams.get('detail') || 'full').trim().toLowerCase();
  return json(await buildAccountPayload(session, detail, env));
}

async function handleAccountFiles(request, env) {
  const session = await getSessionFromRequest(request, env);
  if (!session) return json({ error: 'Please sign in first' }, 401);
  return json({
    success: true,
    files: await listFilesForUser(session.userId, env)
  });
}

async function handleAccountSites(request, env) {
  const session = await getSessionFromRequest(request, env);
  if (!session) return json({ error: 'Please sign in first' }, 401);
  return json({
    success: true,
    sites: await listSitesForUser(session.userId, env)
  });
}

async function handleDeleteAccountFile(request, fileId, env) {
  const session = await getSessionFromRequest(request, env);
  if (!session) return json({ error: 'Please sign in first' }, 401);
  await ensurePublishedFilesTable(env);
  const existing = await env.DB.prepare(
    `SELECT id, file_name
     FROM published_files
     WHERE id = ? AND user_id = ?`
  ).bind(fileId, session.userId).first();
  if (!existing) return json({ error: 'File not found' }, 404);
  await deleteFileAndMeta(fileId, env);
  return json({
    success: true,
    deleted: true,
    fileId,
    fileName: existing.file_name || fileId
  });
}

async function handleDeleteAccountSite(request, siteId, env) {
  const session = await getSessionFromRequest(request, env);
  if (!session) return json({ error: 'Please sign in first' }, 401);
  await ensureSitesTables(env);
  const existing = await env.DB.prepare(
    `SELECT id, name
     FROM sites
     WHERE id = ? AND user_id = ?`
  ).bind(siteId, session.userId).first();
  if (!existing) return json({ error: 'Site not found' }, 404);
  await ensureSiteReleaseBackfill(siteId, env);
  const fileIds = await listSiteStoredFileIds(siteId, env);
  const retained = await listRetainedFileIdsForDeletedSite(siteId, fileIds, env);
  const deletableObjectIds = fileIds.filter((fileIdItem) => !retained.has(fileIdItem));
  await env.DB.batch([
    env.DB.prepare('DELETE FROM site_release_files WHERE release_id IN (SELECT id FROM site_releases WHERE site_id = ?)').bind(siteId),
    env.DB.prepare('DELETE FROM site_releases WHERE site_id = ?').bind(siteId),
    env.DB.prepare('DELETE FROM site_files WHERE site_id = ?').bind(siteId),
    env.DB.prepare('DELETE FROM sites WHERE id = ? AND user_id = ?').bind(siteId, session.userId)
  ]);
  await deleteSiteSession(siteId, env);
  for (const objectId of deletableObjectIds) {
    await deleteFileAndMeta(objectId, env);
  }
  return json({
    success: true,
    deleted: true,
    siteId,
    siteName: existing.name || siteId,
    deletedObjectCount: deletableObjectIds.length,
    retainedObjectCount: fileIds.length - deletableObjectIds.length
  });
}

async function handleCreateApiKey(request, env) {
  const session = await getSessionFromRequest(request, env);
  if (!session) return json({ error: 'Please sign in first' }, 401);
  let body;
  try {
    body = await request.json();
  } catch (error) {
    return json({ error: `Request body must be valid JSON: ${error.message}` }, 400);
  }
  const apiKey = await createApiKey(session.userId, body?.name, env);
  return json({ success: true, apiKey });
}

async function handleAccountUpdateApiKey(request, keyId, env) {
  const session = await getSessionFromRequest(request, env);
  if (!session) return json({ error: 'Please sign in first' }, 401);
  let body;
  try {
    body = await request.json();
  } catch (error) {
    return json({ error: `Request body must be valid JSON: ${error.message}` }, 400);
  }
  const nextStatus = body?.status === 'disabled' ? 'disabled' : body?.status === 'active' ? 'active' : null;
  if (!nextStatus) return json({ error: 'status must be active or disabled' }, 400);
  const existing = await env.DB.prepare(
    `SELECT id
     FROM api_keys
     WHERE id = ? AND user_id = ?`
  ).bind(keyId, session.userId).first();
  if (!existing) return json({ error: 'API Key not found' }, 404);
  await env.DB.prepare(
    `UPDATE api_keys
     SET status = ?
     WHERE id = ? AND user_id = ?`
  ).bind(nextStatus, keyId, session.userId).run();
  return json({ success: true, status: nextStatus });
}

async function handleDeleteApiKey(request, keyId, env) {
  const session = await getSessionFromRequest(request, env);
  if (!session) return json({ error: 'Please sign in first' }, 401);
  const existing = await env.DB.prepare(
    `SELECT id
     FROM api_keys
     WHERE id = ? AND user_id = ?`
  ).bind(keyId, session.userId).first();
  if (!existing) return json({ error: 'API Key not found' }, 404);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM api_key_usage_windows WHERE api_key_id = ?').bind(keyId),
    env.DB.prepare('DELETE FROM api_keys WHERE id = ? AND user_id = ?').bind(keyId, session.userId)
  ]);
  return json({ success: true });
}

async function handleLogout(request, env) {
  await logoutSession(request, env);
  return json({ success: true }, 200, { 'Set-Cookie': clearSessionCookie(request) });
}

async function handleAdminApiKeys(request, env) {
  const session = await getSessionFromRequest(request, env);
  if (!session) return json({ error: 'Please sign in first' }, 401);
  if (!session.isAdmin) return json({ error: 'Administrator access is required' }, 403);
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
  if (!session) return json({ error: 'Please sign in first' }, 401);
  if (!session.isAdmin) return json({ error: 'Administrator access is required' }, 403);
  let body;
  try {
    body = await request.json();
  } catch (error) {
    return json({ error: `Request body must be valid JSON: ${error.message}` }, 400);
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
  if (!session.isAdmin) return json({ error: 'Administrator access is required' }, 403);
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

async function runScheduledCleanup(env) {
  if (!env?.FILES) {
    return { success: false, skipped: true, reason: 'files_binding_missing' };
  }
  const result = await cleanupExpiredFiles(env, {
    limit: EXPIRED_CLEANUP_BATCH_LIMIT
  });
  console.log(`[cleanupExpiredFiles] checked=${result.checked} deleted=${result.deleted} truncated=${result.truncated}`);
  return result;
}

async function handleUploadConfig(env) {
  return json({
    success: true,
    maxSize: MAX_SIZE,
    maxSizeMb: Math.round(MAX_SIZE / 1024 / 1024),
    quickUploadMaxSize: QUICK_UPLOAD_MAX_SIZE,
    quickUploadMaxSizeMb: Math.round(QUICK_UPLOAD_MAX_SIZE / 1024 / 1024),
    multipartThreshold: MULTIPART_THRESHOLD,
    multipartThresholdMb: Math.round(MULTIPART_THRESHOLD / 1024 / 1024),
    partSize: PART_SIZE,
    partSizeMb: Math.round(PART_SIZE / 1024 / 1024),
    presignedExpires: PRESIGNED_EXPIRES,
    siteUpload: {
      supported: true,
      maxFiles: SITE_MAX_FILES,
      maxTotalSize: SITE_MAX_TOTAL_SIZE,
      maxTotalSizeMb: Math.round(SITE_MAX_TOTAL_SIZE / 1024 / 1024),
      entryDefault: SITE_DEFAULT_ENTRY
    }
  });
}

async function handleSitePrepare(request, env) {
  let body;
  try {
    body = await request.json();
  } catch (error) {
    return json({ error: `Request body must be valid JSON: ${error.message}` }, 400);
  }

  const rawApiKey = getRequestApiKey(request, body);
  let apiKey = null;
  let session = null;
  if (rawApiKey) {
    apiKey = await getApiKeyByRaw(rawApiKey, env);
    if (!apiKey) return json({ error: 'Invalid API key' }, 401);
  } else {
    session = await getSessionFromRequest(request, env);
    const ip = getClientIp(request);
    const prepareLimit = takeRateLimit(prepareRateBuckets, `site-prepare:${ip}`, Math.max(10, Math.floor(PREPARE_RATE_LIMIT / 4)), PREPARE_RATE_WINDOW_MS);
    if (!prepareLimit.success) {
      return json({ error: `Too many site prepare requests. Retry in ${(prepareLimit.resetInMs / 1000).toFixed(0)} seconds` }, 429);
    }
  }

  const requestedExpiresAt = normalizeExpiresAt(body?.expiresAt);
  if (Number.isNaN(requestedExpiresAt)) {
    return json({ error: 'expiresAt must be a valid ISO 8601 timestamp' }, 400);
  }
  if (typeof requestedExpiresAt === 'string' && isExpiredAt(requestedExpiresAt)) {
    return json({ error: 'expiresAt must be set to a future time' }, 400);
  }
  if (body?.siteName != null && sanitizeSiteName(body.siteName) !== String(body.siteName).trim()) {
    return json({ error: 'siteName contains invalid characters' }, 400);
  }

  const inputFiles = Array.isArray(body?.files) ? body.files : [];
  if (!inputFiles.length) return json({ error: 'Site manifest cannot be empty' }, 400);
  if (inputFiles.length > SITE_MAX_FILES) {
    return json({ error: `Too many site files. The current limit is ${SITE_MAX_FILES} files` }, 400);
  }

  let totalSize = 0;
  const stagedFiles = [];
  const rawPaths = [];
  for (const item of inputFiles) {
    const relativePath = normalizeRelativePath(item?.path);
    if (typeof relativePath !== 'string') {
      return json({ error: `Invalid path: ${String(item?.path || '')}` }, 400);
    }
    const size = Number(item?.size || 0);
    if (!Number.isFinite(size) || size < 1) {
      return json({ error: `Invalid file size: ${relativePath}` }, 400);
    }
    if (size > MAX_SIZE) {
      return json({ error: `File is too large: ${relativePath}. Maximum file size is ${(MAX_SIZE / 1024 / 1024).toFixed(0)}MB` }, 400);
    }
    totalSize += size;
    rawPaths.push(relativePath);
    stagedFiles.push({
      relativePath,
      size,
      contentType: contentTypeFromName(relativePath, item?.contentType)
    });
  }

  if (totalSize > SITE_MAX_TOTAL_SIZE) {
    return json({ error: `Site is too large. Current total size limit is ${(SITE_MAX_TOTAL_SIZE / 1024 / 1024).toFixed(0)}MB` }, 400);
  }

  const canonical = stripCommonTopLevelDir(rawPaths);
  const manifest = stagedFiles.map((item, index) => ({
    ...item,
    relativePath: canonical.paths[index] || item.relativePath
  }));
  const seenPaths = new Set();
  for (const item of manifest) {
    if (seenPaths.has(item.relativePath)) {
      return json({ error: `Duplicate path found in site manifest: ${item.relativePath}` }, 400);
    }
    seenPaths.add(item.relativePath);
  }

  const entryPath = (() => {
    const normalized = normalizeRelativePath(body?.entryPath);
    if (typeof normalized === 'string') {
      if (canonical.sharedRoot && normalized.startsWith(`${canonical.sharedRoot}/`)) {
        return normalized.slice(canonical.sharedRoot.length + 1);
      }
      return normalized;
    }
    return chooseSiteEntryPath(manifest.map((item) => item.relativePath));
  })();
  if (entryPath && !seenPaths.has(entryPath)) {
    return json({ error: `Entry file does not exist: ${entryPath}` }, 400);
  }

  const requestedSiteId = String(body?.siteId || '').trim();
  const siteUpdateToken = String(body?.siteUpdateToken || '').trim();
  const updateTarget = requestedSiteId ? await getSiteById(requestedSiteId, env) : null;
  if (requestedSiteId && !/^st_[a-z0-9]+$/i.test(requestedSiteId)) {
    return json({ error: 'Invalid site ID' }, 400);
  }
  if (requestedSiteId && !updateTarget) {
    return json({ error: 'The site to update does not exist' }, 404);
  }
  const updateTokenPayload = updateTarget && siteUpdateToken
    ? await readSiteUpdateToken(siteUpdateToken, env)
    : null;
  const canManageViaToken = updateTarget && isValidSiteUpdateTokenPayload(updateTokenPayload, updateTarget.id);
  if (updateTarget && !canManageSite(updateTarget, { session, apiKey }) && !canManageViaToken) {
    return json({ error: 'You do not have permission to update this site. Sign in with the owning account or provide the matching API key' }, 403);
  }
  if (updateTarget) {
    await ensureSiteReleaseBackfill(updateTarget.id, env);
    if (canManageViaToken) {
      await deleteSiteUpdateToken(siteUpdateToken, env);
    }
  }

  const siteId = updateTarget?.id || `st_${generateId(10)}`;
  const siteToken = randomToken(24);
  const releaseId = siteReleaseId();
  const publishOrigin = await resolvePublishOrigin(request, env);
  const subdomain = updateTarget?.subdomain || siteSubdomainForId(siteId);
  const siteLinks = buildPublishedSiteLinks(publishOrigin, subdomain, entryPath);
  const nextVersionNo = updateTarget ? await getNextSiteReleaseVersion(siteId, env) : 1;
  const siteName = sanitizeSiteName(body?.siteName || updateTarget?.name || canonical.sharedRoot || entryPath.split('/')[0] || siteId);
  const createdAt = new Date().toISOString();
  const effectiveExpiresAt = resolveDefaultExpiresAt(requestedExpiresAt, {
    apiKey,
    session,
    fallbackExpiresAt: updateTarget?.expiresAt || null
  });
  await saveSiteSession(siteId, {
    id: siteId,
    siteToken,
    releaseId,
    versionNo: nextVersionNo,
    basedOnReleaseId: updateTarget?.activeReleaseId || null,
    mode: updateTarget ? 'update' : 'create',
    subdomain,
    siteName,
    entryPath,
    manifest,
    fileCount: manifest.length,
    totalSize,
    expiresAt: effectiveExpiresAt,
    apiKeyId: updateTarget?.apiKeyId || apiKey?.id || null,
    userId: updateTarget?.userId || apiKey?.userId || session?.userId || null,
    createdAt
  }, env);

  return json({
    success: true,
    siteId,
    siteToken,
    subdomain,
    siteHostname: siteLinks.siteHostname,
    siteName,
    entryPath,
    pathRoot: canonical.sharedRoot || '',
    fileCount: manifest.length,
    totalSize,
    expiresAt: effectiveExpiresAt,
    siteUrl: siteLinks.siteUrl,
    entryUrl: siteLinks.entryUrl,
    uploadStrategy: 'reuse-file-upload-api',
    updateMode: Boolean(updateTarget),
    releaseId,
    versionNo: nextVersionNo,
    basedOnReleaseId: updateTarget?.activeReleaseId || null
  });
}

async function handleUploadPrepare(request, env) {
  let body;
  try {
    body = await request.json();
  } catch (error) {
    return json({ error: `Request body must be valid JSON: ${error.message}` }, 400);
  }

  const rawApiKey = getRequestApiKey(request, body);
  let apiKey = null;
  let session = null;
  if (rawApiKey) {
    apiKey = await getApiKeyByRaw(rawApiKey, env);
    if (!apiKey) return json({ error: 'Invalid API key' }, 401);
    const quota = await consumeApiKeyPrepare(apiKey, env);
    if (!quota.ok) return json({ error: quota.error }, quota.status);
  } else {
    session = await getSessionFromRequest(request, env);
    const ip = getClientIp(request);
    const prepareLimit = takeRateLimit(prepareRateBuckets, `prepare:${ip}`, PREPARE_RATE_LIMIT, PREPARE_RATE_WINDOW_MS);
    if (!prepareLimit.success) {
      return json({ error: `Too many upload prepare requests. Retry in ${(prepareLimit.resetInMs / 1000).toFixed(0)} seconds` }, 429);
    }
  }

  const filename = sanitizeFilename(body?.filename);
  const size = Number(body?.size || 0);
  const preferredPartSize = Number(body?.preferredPartSize || 0);
  const maxDownloads = normalizeMaxDownloads(body?.maxDownloads);
  const requestedExpiresAt = normalizeExpiresAt(body?.expiresAt);
  const clientIp = getClientIp(request);
  const clientRegion = getClientRegion(request);
  if (Number.isNaN(maxDownloads)) {
    return json({ error: 'maxDownloads must be an integer greater than 0' }, 400);
  }
  if (Number.isNaN(requestedExpiresAt)) {
    return json({ error: 'expiresAt must be a valid ISO 8601 timestamp' }, 400);
  }
  if (typeof requestedExpiresAt === 'string' && isExpiredAt(requestedExpiresAt)) {
    return json({ error: 'expiresAt must be set to a future time' }, 400);
  }
  if (typeof filename !== 'string') {
    return json({ error: 'filename is required and must not contain path separators or control characters' }, 400);
  }
  let actualPartSize = PART_SIZE;
  if (preferredPartSize >= 5 * 1024 * 1024 && preferredPartSize <= 100 * 1024 * 1024) {
    actualPartSize = preferredPartSize;
  }
  
  const detectedType = contentTypeFromName(filename, body?.contentType);
  if (!size || size < 1) return json({ error: 'File is empty' }, 400);
  if (size > MAX_SIZE) return json({ error: `File is too large. Maximum supported size is ${(MAX_SIZE / 1024 / 1024).toFixed(0)}MB` }, 400);

  const id = generateId();
  const publishOrigin = await resolvePublishOrigin(request, env);
  const publishLinks = buildPublishedLinks(publishOrigin, id);
  const effectiveExpiresAt = resolveDefaultExpiresAt(requestedExpiresAt, { apiKey, session });
  const baseSession = {
    id,
    apiKeyId: apiKey?.id || null,
    userId: apiKey?.userId || session?.userId || null,
    name: filename,
    size,
    contentType: detectedType,
    createdAt: new Date().toISOString(),
    maxDownloads,
    expiresAt: effectiveExpiresAt,
    clientIp,
    clientRegion
  };
  const responseBase = {
    success: true,
    id,
    expiresIn: PRESIGNED_EXPIRES,
    url: publishLinks.url,
    downloadUrl: publishLinks.downloadUrl,
    playUrl: publishLinks.playUrl,
    type: classifyContent(detectedType),
    maxDownloads,
    expiresAt: effectiveExpiresAt,
    limits: buildPrepareLimits(apiKey, actualPartSize, maxDownloads),
    integrity: {
      etag: {
        supported: true,
        completeField: 'etag',
        multipartField: 'parts[].etag',
        optional: true
      }
    }
  };

  if (size > MULTIPART_THRESHOLD) {
    try {
      const signer = createR2Signer(env);
      const multipart = await env.FILES.createMultipartUpload(id, {
        httpMetadata: {
          contentType: detectedType,
          cacheControl: DEFAULT_CACHE,
          contentDisposition: `inline; filename*=UTF-8''${encodeURIComponent(filename)}`
        },
        customMetadata: {
          name: filename,
          uploadedAt: new Date().toISOString(),
          size: String(size),
          contentType: detectedType,
          clientIp,
          clientRegion
        }
      });
      const totalParts = Math.ceil(size / actualPartSize);
      const parts = await createPartUploadUrls(id, multipart.uploadId, totalParts, env, signer);
      await saveUploadSession(id, {
        ...baseSession,
        mode: 'multipart',
        uploadId: multipart.uploadId,
        partSize: actualPartSize,
        totalParts
      }, env);
      return json({
        ...responseBase,
        mode: 'multipart',
        uploadId: multipart.uploadId,
        partSize: actualPartSize,
        totalParts,
        parts
      });
    } catch (error) {
      return json({ error: error.message || 'Failed to create multipart upload' }, 500);
    }
  }

  try {
    const uploadUrl = await createSingleUploadUrl(id, env);
    await saveUploadSession(id, { ...baseSession, mode: 'single' }, env);
    return json({
      ...responseBase,
      mode: 'single',
      method: 'PUT',
      uploadUrl
    });
  } catch (error) {
    return json({ error: error.message || 'Failed to generate presigned upload URL' }, 500);
  }
}

async function handleUploadQuick(request, env) {
  let form;
  try {
    form = await request.formData();
  } catch (error) {
    return json({ error: `Request body must be multipart/form-data: ${error.message}` }, 400);
  }

  const file = form.get('file');
  if (!file || typeof file !== 'object' || typeof file.stream !== 'function') {
    return json({ error: 'Field "file" is required' }, 400);
  }

  const filename = sanitizeFilename(String(form.get('filename') || file.name || ''), { fallback: null });
  const size = Number(file.size || 0);
  const detectedType = contentTypeFromName(filename, String(form.get('contentType') || file.type || ''));
  const maxDownloads = normalizeMaxDownloads(form.get('maxDownloads'));
  const expiresAt = normalizeExpiresAt(form.get('expiresAt'));

  if (Number.isNaN(maxDownloads)) {
    return json({ error: 'maxDownloads must be an integer greater than 0' }, 400);
  }
  if (Number.isNaN(expiresAt)) {
    return json({ error: 'expiresAt must be a valid ISO 8601 timestamp' }, 400);
  }
  if (typeof expiresAt === 'string' && isExpiredAt(expiresAt)) {
    return json({ error: 'expiresAt must be set to a future time' }, 400);
  }
  if (typeof filename !== 'string') {
    return json({ error: 'filename is required and must not contain path separators or control characters' }, 400);
  }
  if (!size || size < 1) {
    return json({ error: 'File is empty' }, 400);
  }
  if (size > QUICK_UPLOAD_MAX_SIZE) {
    return json({
      error: `Files larger than ${Math.round(QUICK_UPLOAD_MAX_SIZE / 1024 / 1024)}MB must use /api/upload/prepare + PUT + /api/upload/complete`,
      code: 'QUICK_UPLOAD_TOO_LARGE',
      quickUploadMaxSize: QUICK_UPLOAD_MAX_SIZE
    }, 400);
  }

  const body = {
    apiKey: String(form.get('apiKey') || '').trim()
  };
  const rawApiKey = getRequestApiKey(request, body);
  let apiKey = null;
  let session = null;
  if (rawApiKey) {
    apiKey = await getApiKeyByRaw(rawApiKey, env);
    if (!apiKey) return json({ error: 'Invalid API key' }, 401);
    const quota = await consumeApiKeyPrepare(apiKey, env);
    if (!quota.ok) return json({ error: quota.error }, quota.status);
  } else {
    session = await getSessionFromRequest(request, env);
    const ip = getClientIp(request);
    const prepareLimit = takeRateLimit(prepareRateBuckets, `prepare:${ip}`, PREPARE_RATE_LIMIT, PREPARE_RATE_WINDOW_MS);
    if (!prepareLimit.success) {
      return json({ error: `Too many upload prepare requests. Retry in ${(prepareLimit.resetInMs / 1000).toFixed(0)} seconds` }, 429);
    }
  }

  const id = generateId();
  const clientIp = getClientIp(request);
  const clientRegion = getClientRegion(request);
  const effectiveExpiresAt = resolveDefaultExpiresAt(expiresAt, { apiKey, session });
  try {
    await env.FILES.put(id, file.stream(), {
      httpMetadata: {
        contentType: detectedType,
        cacheControl: DEFAULT_CACHE,
        contentDisposition: `inline; filename*=UTF-8''${encodeURIComponent(filename)}`
      },
      customMetadata: {
        name: filename,
        uploadedAt: new Date().toISOString(),
        size: String(size),
        contentType: detectedType,
        clientIp,
        clientRegion
      }
    });
  } catch (error) {
    return json({ error: error.message || 'Quick upload failed' }, 500);
  }

  return finalizeUploadedFile(request, env, {
    id,
    filename,
    declaredType: detectedType,
    expectedSize: size,
    maxDownloads,
    expiresAt: effectiveExpiresAt,
    apiKeyId: apiKey?.id || null,
    userId: apiKey?.userId || session?.userId || null,
    clientIp,
    clientRegion
  });
}

async function handleUploadComplete(request, env) {
  let body;
  try {
    body = await request.json();
  } catch (error) {
    return json({ error: `Request body must be valid JSON: ${error.message}` }, 400);
  }
  const id = String(body?.id || '').trim();
  if (!/^[a-z0-9]+$/i.test(id)) return json({ error: 'Invalid file ID' }, 400);
  const session = await readUploadSession(id, env);
  if (!session) {
    const head = await env.FILES.head(id);
    if (head) {
      return json({
        error: 'Upload already completed',
        code: 'UPLOAD_ALREADY_COMPLETED',
        id
      }, 409);
    }
    return json({
      error: 'Upload session not found. Reuse the exact id returned by the matching prepare call, then start over with prepare if needed',
      code: 'UPLOAD_SESSION_NOT_FOUND',
      id,
      hint: 'expiresIn only describes the signed uploadUrl or parts[].uploadUrl lifetime, not a Worker-side upload session TTL'
    }, 404);
  }
  const filename = sanitizeFilename(session.name || id);
  const expectedSize = Number(session.size || 0);
  const declaredType = contentTypeFromName(filename, session.contentType);
  const reportedObjectEtag = normalizeETag(body?.etag);
  const reportedPartEtags = normalizeClientUploadedParts(body?.parts);
  let partEtagValidated = false;
  let objectEtagValidated = false;

  if (session?.mode === 'multipart') {
    try {
      const uploadedParts = await listUploadedParts(id, session.uploadId, env);
      const validation = validateMultipartParts(uploadedParts, Number(session.totalParts || 0));
      if (!validation.ok) {
        return json({
          success: false,
          error: validation.error,
          uploadedParts: validation.uploadedParts,
          totalParts: validation.totalParts,
          missingParts: validation.missingParts
        }, validation.status);
      }
      const etagValidation = validateReportedPartEtags(reportedPartEtags, uploadedParts, Number(session.totalParts || 0));
      if (!etagValidation.ok) {
        return json({ success: false, error: etagValidation.error }, etagValidation.status);
      }
      partEtagValidated = Boolean(etagValidation.validated);
      const multipart = env.FILES.resumeMultipartUpload(id, session.uploadId);
      await multipart.complete(uploadedParts);
    } catch (error) {
      return json({ error: error.message || 'Failed to complete multipart upload' }, 500);
    }
  }
  return finalizeUploadedFile(request, env, {
    id,
    filename,
    declaredType,
    expectedSize,
    maxDownloads: session.maxDownloads,
    expiresAt: session.expiresAt,
    apiKeyId: session.apiKeyId || null,
    userId: session.userId || null,
    clientIp: session.clientIp || '',
    clientRegion: session.clientRegion || '',
    reportedObjectEtag,
    partEtagValidated,
    objectEtagValidated,
    deleteSessionOnSuccess: true
  });
}

async function handleUploadStatus(request, id, env) {
  const session = await readUploadSession(id, env);
  if (!session) {
    const head = await env.FILES.head(id);
    if (head) {
      return json({ id, status: 'done', bytesReceived: head.size });
    }
    return json({ error: 'Upload task not found' }, 404);
  }

  if (session.mode === 'multipart') {
    try {
      const uploadedParts = await listUploadedParts(id, session.uploadId, env);
      const bytesReceived = uploadedParts.reduce((sum, p) => sum + p.size, 0);
      return json({
        id,
        status: 'uploading',
        progress: `${uploadedParts.length}/${session.totalParts}`,
        uploadedParts: uploadedParts.length,
        totalParts: session.totalParts,
        bytesReceived
      });
    } catch (e) {
      return json({ id, status: 'error', error: e.message });
    }
  } else {
    return json({
      id,
      status: 'uploading',
      progress: '0/1'
    });
  }
}

async function handleSiteComplete(request, env) {
  let body;
  try {
    body = await request.json();
  } catch (error) {
    return json({ error: `Request body must be valid JSON: ${error.message}` }, 400);
  }

  const siteId = String(body?.siteId || '').trim();
  if (!/^st_[a-z0-9]+$/i.test(siteId)) return json({ error: 'Invalid site ID' }, 400);
  const siteToken = String(body?.siteToken || '').trim();
  if (!siteToken) return json({ error: 'Missing site completion token' }, 400);

  const session = await readSiteSession(siteId, env);
  if (!session) {
    return json({
      error: 'Site upload session not found. Reuse the exact siteId and siteToken returned by the matching site prepare call, then prepare again if needed',
      code: 'SITE_SESSION_NOT_FOUND',
      siteId,
      hint: 'The siteToken returned by site prepare is bound to one site upload session and cannot be reused across prepare calls'
    }, 404);
  }
  if (siteToken !== session.siteToken) return json({ error: 'Invalid site completion token' }, 403);

  const inputFiles = Array.isArray(body?.files) ? body.files : [];
  if (!inputFiles.length) return json({ error: 'Site file list cannot be empty' }, 400);
  if (inputFiles.length !== Number(session.fileCount || 0)) {
    return json({ error: 'Site file count does not match the prepare phase' }, 409);
  }

  const canonical = stripCommonTopLevelDir(inputFiles.map((item) => item?.relativePath));
  const expected = new Map((session.manifest || []).map((item) => [item.relativePath, item]));
  const mappedFiles = [];
  for (let index = 0; index < inputFiles.length; index += 1) {
    const item = inputFiles[index];
    const relativePath = canonical.paths[index] || normalizeRelativePath(item?.relativePath);
    const fileId = String(item?.fileId || '').trim();
    if (typeof relativePath !== 'string') {
      return json({ error: 'Invalid relativePath' }, 400);
    }
    if (!/^[a-z0-9]+$/i.test(fileId)) {
      return json({ error: `Invalid file ID: ${fileId}` }, 400);
    }
    const expectedItem = expected.get(relativePath);
    if (!expectedItem) {
      return json({ error: `File is not present in the prepare manifest: ${relativePath}` }, 409);
    }
    const meta = await readFileMeta(fileId, env);
    if (!meta) {
      return json({ error: `File has not finished uploading: ${relativePath}` }, 409);
    }
    mappedFiles.push({
      relativePath,
      fileId,
      fileName: meta.name || relativePath.split('/').pop() || fileId,
      contentType: siteFileContentType(
        relativePath,
        meta.contentType || expectedItem.contentType || 'application/octet-stream',
        meta.name || relativePath
      ),
      size: Number(meta.size || expectedItem.size || 0)
    });
    expected.delete(relativePath);
  }

  if (expected.size > 0) {
    return json({
      error: 'Some files are still missing from the site publish step',
      missingPaths: Array.from(expected.keys())
    }, 409);
  }

  const publishOrigin = await resolvePublishOrigin(request, env);
  const siteEntryPath = typeof session.entryPath === 'string' ? session.entryPath : SITE_DEFAULT_ENTRY;
  const siteLinks = buildPublishedSiteLinks(
    publishOrigin,
    session.subdomain || siteSubdomainForId(siteId),
    siteEntryPath
  );
  const saved = await saveSiteMapping({
    id: siteId,
    name: sanitizeSiteName(session.siteName),
    publishOrigin,
    siteUrl: siteLinks.siteUrl,
    siteHostname: siteLinks.siteHostname,
    subdomain: session.subdomain || siteLinks.siteSubdomain,
    entryPath: siteEntryPath,
    totalSize: Number(session.totalSize || 0),
    expiresAt: session.expiresAt || null,
    apiKeyId: session.apiKeyId || null,
    userId: session.userId || null,
    createdAt: session.createdAt || new Date().toISOString(),
    completedAt: new Date().toISOString()
  }, mappedFiles, env, {
    releaseId: session.releaseId,
    versionNo: session.versionNo,
    basedOnReleaseId: session.basedOnReleaseId || null
  });
  await deleteSiteSession(siteId, env);

  return json({
    success: true,
    siteId,
    releaseId: saved.releaseId,
    versionNo: saved.versionNo,
    updateMode: session.mode === 'update',
    subdomain: session.subdomain || siteLinks.siteSubdomain,
    siteHostname: siteLinks.siteHostname,
    siteName: sanitizeSiteName(session.siteName),
    siteUrl: siteLinks.siteUrl,
    entryUrl: siteLinks.entryUrl,
    entryPath: siteEntryPath,
    publishOrigin,
    fileCount: mappedFiles.length,
    totalSize: Number(session.totalSize || 0),
    expiresAt: session.expiresAt || null,
    changeSummary: saved.changeSummary
  });
}

function siteNotFoundHTML(siteId, requestedPath = '') {
  const suffix = requestedPath ? ` / ${escapeHtml(requestedPath)}` : '';
  return publicInfoPageHTML({
    title: 'Site Not Found',
    icon: '📂',
    heading: 'Site Not Found',
    body: `<p>Site <code>${escapeHtml(siteId)}</code>${suffix} was not found.</p>`,
    tone: 'danger',
  });
}

function expiredSiteHTML(site) {
  return publicInfoPageHTML({
    title: 'Site Expired',
    icon: '⏳',
    heading: 'Site Expired',
    body: `<p>Site <code>${escapeHtml(site?.name || site?.id || 'unknown')}</code> is no longer available.</p>${site?.expiresAt ? `<p>Expired at: <code>${escapeHtml(site.expiresAt)}</code></p>` : ''}`,
    tone: 'warning',
  });
}

async function sitePage(site, requestedPath, request, env) {
  if (!site) {
    return htmlResponse(siteNotFoundHTML('unknown', requestedPath), 404, { 'Cache-Control': 'no-store' });
  }
  if (isExpiredAt(site.expiresAt)) {
    return htmlResponse(expiredSiteHTML(site), 410, { 'Cache-Control': 'no-store' });
  }
  const entryPath = typeof site.entryPath === 'string' ? site.entryPath : SITE_DEFAULT_ENTRY;
  const candidates = sitePathCandidates(requestedPath, entryPath);
  const forceAttachment = new URL(request.url).searchParams.get('download') === '1';
  for (const candidate of candidates) {
    const mapped = await getSiteFileRecord(site.id, candidate, env);
    if (!mapped) continue;
    const meta = await readFileMeta(mapped.fileId, env);
    if (!meta) continue;
    if (isMetaExpired(meta)) {
      return htmlResponse(expiredFileHTML(meta), 410, { 'Cache-Control': 'no-store' });
    }
    const response = await serveR2File(mapped.fileId, request, env, {
      ...meta,
      name: mapped.fileName || meta.name,
      contentType: siteFileContentType(candidate, mapped.contentType || meta.contentType, mapped.fileName || meta.name || candidate)
    }, {
      forceAttachment
    });
    if (response) return response;
  }
  const listing = await listSiteDirectory(site, requestedPath, env);
  if (listing) {
    return htmlResponse(siteDirectoryListingHTML(site, listing), 200, {
      'Cache-Control': 'no-store'
    });
  }
  return htmlResponse(siteNotFoundHTML(site.id, requestedPath), 404, { 'Cache-Control': 'no-store' });
}

async function viewerPage(id, env) {
  const meta = await readFileMeta(id, env);
  if (!meta) return htmlResponse(notFoundHTML(id), 404);
  if (isMetaExpired(meta)) return htmlResponse(expiredFileHTML(meta), 410, { 'Cache-Control': 'no-store' });
  const contentType = meta.contentType || 'application/octet-stream';
  const html = isImage(contentType)
    ? imageViewerPage(meta)
    : isVideo(contentType)
      ? videoViewerPage(meta)
      : isPDF(contentType)
        ? pdfViewerPage(meta)
        : genericViewerPage(meta);
  return htmlResponse(html);
}

async function rawFile(id, request, env) {
  const meta = await readFileMeta(id, env);
  if (isMetaExpired(meta)) {
    return htmlResponse(expiredFileHTML(meta), 410, {
      'Cache-Control': 'no-store'
    });
  }
  const fromR2 = await serveR2File(id, request, env, meta);
  if (fromR2) return fromR2;
  return htmlResponse(notFoundHTML(id), 404);
}

async function controlledDownload(id, request, env) {
  const result = await recordDownloadAndGetMeta(id, env);
  if (!result.success) {
    if (result.status === 410) {
      return htmlResponse(expiredFileHTML(result.meta), 410, {
        'Cache-Control': 'no-store'
      });
    }
    if (result.status === 403) {
      return htmlResponse(downloadLimitExceededHTML(result.meta), 403, {
        'Cache-Control': 'no-store'
      });
    }
    return htmlResponse(notFoundHTML(id), 404, {
      'Cache-Control': 'no-store'
    });
  }
  const response = await serveR2File(id, request, env, result.meta, {
    forceAttachment: true,
    cacheControl: 'private, no-store, max-age=0'
  });
  if (response) return response;
  return htmlResponse(notFoundHTML(id), 404, {
    'Cache-Control': 'no-store'
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname === 'okfile.com') {
      url.hostname = 'www.okfile.com';
      return Response.redirect(url.toString(), 301);
    }
    if (url.hostname === 'www.ok26.org') {
      url.protocol = 'https:';
      url.hostname = 'ok26.org';
      return Response.redirect(url.toString(), 301);
    }
    if ((request.method === 'GET' || request.method === 'HEAD') && canResolveSiteFromHostname(url.hostname)) {
      const site = await getSiteByHostname(url.hostname, env);
      if (site) {
        return sitePage(site, url.pathname, request, env);
      }
      return htmlResponse(siteNotFoundHTML('unknown', url.pathname), 404, {
        'Cache-Control': 'no-store'
      });
    }
    if (!env.ASSETS && url.hostname.endsWith('.ok26.org') && url.hostname !== 'ok26.org') {
      return htmlResponse(siteNotFoundHTML('unknown', url.pathname), 404, {
        'Cache-Control': 'no-store'
      });
    }
    if (request.method === 'GET' && url.pathname === BAIDU_VERIFY_PATH) {
      return htmlResponse(BAIDU_VERIFY_CONTENT, 200, {
        'Cache-Control': 'public, max-age=300'
      });
    }

    if (request.method === 'OPTIONS') return corsPreflight();
    if (request.method === 'GET' && (url.pathname === '/favicon.ico' || url.pathname === '/favicon.svg')) {
      return svgResponse(FAVICON_SVG);
    }
    if (request.method === 'GET' && url.pathname === '/robots.txt') return renderRobotsTxt(request);
    if (request.method === 'GET' && url.pathname === '/sitemap.xml') return renderSitemapXml(request);
    if (
      request.method === 'GET' &&
      (
        url.pathname === '/skill' ||
        url.pathname === '/skill/' ||
        url.pathname === '/skills/install' ||
        url.pathname === '/install-skill' ||
        url.pathname === '/.well-known/skill'
      )
    ) {
      return redirect('/SKILL.md');
    }

    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      return redirect(localizedHomePath('en'));
    }
    if (request.method === 'GET' && url.pathname === '/upload.html') {
      return redirect(localizedUploadPath('en'));
    }
    if (request.method === 'GET' && url.pathname === '/account') {
      return redirect(localizedAccountPath('en'));
    }
    if (request.method === 'GET' && (url.pathname === '/zh' || url.pathname === '/zh/')) {
      return redirect(localizedHomePath('en'));
    }
    if (request.method === 'GET' && (url.pathname === '/en' || url.pathname === '/en/')) {
      return renderLocalizedStaticPage(request, env, '/index.html', 'en', 'home');
    }
    if (request.method === 'GET' && (url.pathname === '/zh/upload' || url.pathname === '/zh/upload/')) {
      return redirect(localizedUploadPath('en'));
    }
    if (request.method === 'GET' && (url.pathname === '/en/upload' || url.pathname === '/en/upload/')) {
      return renderLocalizedStaticPage(request, env, '/upload.html', 'en', 'upload');
    }
    const accountPageByPath = {
      '/en/account': 'overview',
      '/en/account/': 'overview',
      '/en/account/profile': 'profile',
      '/en/account/profile/': 'profile',
      '/en/account/storage': 'storage',
      '/en/account/storage/': 'storage',
      '/en/account/files': 'files',
      '/en/account/files/': 'files',
      '/en/account/sites': 'sites',
      '/en/account/sites/': 'sites',
      '/en/account/api-keys': 'api-keys',
      '/en/account/api-keys/': 'api-keys',
    };
    const accountLoginByPath = {
      '/en/account/login': 'en',
      '/en/account/login/': 'en',
    };
    const accountRedirectByPath = {
      '/en/account/create-key': localizedAccountPagePath('en', 'api-keys'),
      '/en/account/create-key/': localizedAccountPagePath('en', 'api-keys'),
    };
    const zhAccountRedirectByPath = {
      '/zh/account': localizedAccountPagePath('en', 'overview'),
      '/zh/account/': localizedAccountPagePath('en', 'overview'),
      '/zh/account/profile': localizedAccountPagePath('en', 'profile'),
      '/zh/account/profile/': localizedAccountPagePath('en', 'profile'),
      '/zh/account/storage': localizedAccountPagePath('en', 'storage'),
      '/zh/account/storage/': localizedAccountPagePath('en', 'storage'),
      '/zh/account/files': localizedAccountPagePath('en', 'files'),
      '/zh/account/files/': localizedAccountPagePath('en', 'files'),
      '/zh/account/sites': localizedAccountPagePath('en', 'sites'),
      '/zh/account/sites/': localizedAccountPagePath('en', 'sites'),
      '/zh/account/api-keys': localizedAccountPagePath('en', 'api-keys'),
      '/zh/account/api-keys/': localizedAccountPagePath('en', 'api-keys'),
      '/zh/account/login': localizedAccountLoginPath('en'),
      '/zh/account/login/': localizedAccountLoginPath('en'),
      '/zh/account/create-key': localizedAccountPagePath('en', 'api-keys'),
      '/zh/account/create-key/': localizedAccountPagePath('en', 'api-keys'),
    };
    if (request.method === 'GET' && accountRedirectByPath[url.pathname]) {
      return redirect(accountRedirectByPath[url.pathname]);
    }
    if (request.method === 'GET' && zhAccountRedirectByPath[url.pathname]) {
      return redirect(zhAccountRedirectByPath[url.pathname]);
    }
    if (request.method === 'GET' && accountLoginByPath[url.pathname]) {
      const session = await getSessionFromRequest(request, env);
      const nextPath = sanitizeAccountNextPath(url.searchParams.get('next'), localizedAccountPagePath('en', 'overview'));
      if (session) return redirect(nextPath);
      return htmlResponse(accountLoginPage('en', nextPath), 200, { 'X-Robots-Tag': 'noindex, follow' });
    }
    if (request.method === 'GET' && accountPageByPath[url.pathname]) {
      const session = await getSessionFromRequest(request, env);
      if (!session) {
        const nextPath = sanitizeAccountNextPath(`${url.pathname}${url.search}${url.hash}`, localizedAccountPagePath('en', 'overview'));
        return redirect(`${localizedAccountLoginPath('en')}?next=${encodeURIComponent(nextPath)}`);
      }
      const pageKey = accountPageByPath[url.pathname];
      const initialAccountData = await buildAccountPayload(session, accountDetailForPage(pageKey), env);
      return htmlResponse(accountPage('en', pageKey, session, initialAccountData), 200, { 'X-Robots-Tag': 'noindex, follow' });
    }
    if (url.pathname === '/admin') return redirect(`${ADMIN_PANEL_ORIGIN}/`);
    if (url.pathname === '/auth/verify' && request.method === 'GET') return handleVerify(request, env);

    if (url.pathname === '/api/auth/request-link' && request.method === 'POST') return handleAuthRequestLink(request, env);
    if (url.pathname === '/api/auth/logout' && request.method === 'POST') return handleLogout(request, env);
    if (url.pathname === '/api/account/me' && request.method === 'GET') return handleAccountMe(request, env);
    if (url.pathname === '/api/account/files' && request.method === 'GET') return handleAccountFiles(request, env);
    if (url.pathname === '/api/account/sites' && request.method === 'GET') return handleAccountSites(request, env);
    if (url.pathname === '/api/account/api-keys' && request.method === 'POST') return handleCreateApiKey(request, env);
    if (url.pathname === '/api/admin/api-keys' && request.method === 'GET') return handleAdminApiKeys(request, env);
    if (url.pathname === '/api/admin/cleanup-expired' && request.method === 'POST') return handleAdminCleanupExpired(request, env);

    const adminKeyMatch = url.pathname.match(/^\/api\/admin\/api-keys\/([^/]+)$/);
    if (adminKeyMatch && request.method === 'POST') {
      return handleAdminUpdateApiKey(request, adminKeyMatch[1], env);
    }
    const accountKeyMatch = url.pathname.match(/^\/api\/account\/api-keys\/([^/]+)$/);
    const accountFileMatch = url.pathname.match(/^\/api\/account\/files\/([^/]+)$/);
    const accountSiteMatch = url.pathname.match(/^\/api\/account\/sites\/([^/]+)$/);
    if (accountKeyMatch && request.method === 'PATCH') {
      return handleAccountUpdateApiKey(request, accountKeyMatch[1], env);
    }
    if (accountKeyMatch && request.method === 'DELETE') {
      return handleDeleteApiKey(request, accountKeyMatch[1], env);
    }
    if (accountFileMatch && request.method === 'DELETE') {
      return handleDeleteAccountFile(request, accountFileMatch[1], env);
    }
    if (accountSiteMatch && request.method === 'DELETE') {
      return handleDeleteAccountSite(request, accountSiteMatch[1], env);
    }

    if (url.pathname === '/api/upload/config' && request.method === 'GET') return handleUploadConfig(env);
    if (url.pathname === '/api/site/prepare' && request.method === 'POST') return handleSitePrepare(request, env);
    if (url.pathname === '/api/site/complete' && request.method === 'POST') return handleSiteComplete(request, env);
    if (url.pathname === '/api/upload/prepare' && request.method === 'POST') return handleUploadPrepare(request, env);
    if (url.pathname === '/api/upload/quick' && request.method === 'POST') return handleUploadQuick(request, env);
    if (url.pathname === '/api/upload/complete' && request.method === 'POST') return handleUploadComplete(request, env);
    
    const statusMatch = url.pathname.match(/^\/api\/upload\/status\/([a-zA-Z0-9]+)$/);
    if (statusMatch && request.method === 'GET') {
      return handleUploadStatus(request, statusMatch[1], env);
    }

    const downloadMatch = url.pathname.match(/^\/d\/([a-zA-Z0-9]+)$/);
    if (downloadMatch && request.method === 'GET') {
      return controlledDownload(downloadMatch[1], request, env);
    }

    const rawMatch = url.pathname.match(/^\/raw\/([a-zA-Z0-9]+)$/);
    if (rawMatch) {
      return rawFile(rawMatch[1], request, env);
    }

    const viewMatch = url.pathname.match(/^\/i\/([a-zA-Z0-9]+)$/);
    if (viewMatch) {
      const id = viewMatch[1];
      return viewerPage(id, env);
    }

    if (url.pathname === '/api/auth/request-link') return methodNotAllowed(request, ['POST']);
    if (url.pathname === '/api/auth/logout') return methodNotAllowed(request, ['POST']);
    if (url.pathname === '/api/account/me') return methodNotAllowed(request, ['GET']);
    if (url.pathname === '/api/account/files') return methodNotAllowed(request, ['GET']);
    if (url.pathname === '/api/account/sites') return methodNotAllowed(request, ['GET']);
    if (url.pathname === '/api/account/api-keys') return methodNotAllowed(request, ['POST']);
    if (url.pathname === '/api/admin/api-keys') return methodNotAllowed(request, ['GET']);
    if (url.pathname === '/api/admin/cleanup-expired') return methodNotAllowed(request, ['POST']);
    if (adminKeyMatch) return methodNotAllowed(request, ['POST']);
    if (accountKeyMatch) return methodNotAllowed(request, ['PATCH', 'DELETE']);
    if (accountFileMatch) return methodNotAllowed(request, ['DELETE']);
    if (accountSiteMatch) return methodNotAllowed(request, ['DELETE']);
    if (url.pathname === '/api/upload/config') return methodNotAllowed(request, ['GET']);
    if (url.pathname === '/api/site/prepare') return methodNotAllowed(request, ['POST']);
    if (url.pathname === '/api/site/complete') return methodNotAllowed(request, ['POST']);
    if (url.pathname === '/api/upload/prepare') return methodNotAllowed(request, ['POST']);
    if (url.pathname === '/api/upload/quick') return methodNotAllowed(request, ['POST']);
    if (url.pathname === '/api/upload/complete') return methodNotAllowed(request, ['POST']);
    if (url.pathname === '/api/upload/status/') return json({ error: 'Missing upload ID' }, 404);
    if (statusMatch) return methodNotAllowed(request, ['GET']);
    if (url.pathname.startsWith('/api/')) return json({ error: 'API endpoint not found' }, 404);

    return env.ASSETS.fetch(request);
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
