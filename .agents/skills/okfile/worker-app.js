import { AwsClient } from 'aws4fetch';

const MAX_SIZE = 500 * 1024 * 1024;
const MULTIPART_THRESHOLD = 25 * 1024 * 1024;
const PART_SIZE = 10 * 1024 * 1024;
const DEFAULT_CACHE = 'public, max-age=31536000, immutable';
const PRESIGNED_EXPIRES = 3600;
const PREPARE_RATE_LIMIT = 80;
const PREPARE_RATE_WINDOW_MS = 10 * 60 * 1000;
const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_API_KEY_PREPARE_LIMIT = 120;
const DEFAULT_API_KEY_WINDOW_SEC = 3600;
const DEFAULT_API_KEY_UPLOAD_LIMIT = 1000;
const STATIC_PAGE_BROWSER_TTL = 300;
const STATIC_PAGE_EDGE_TTL = 3600;
const STATIC_PAGE_CACHE_VERSION = 'v11';
const UPLOAD_NOTIFY_TO_EMAIL = 'sungz@163.com';
const UPLOAD_NOTIFY_DAILY_LIMIT = 10;
const UPLOAD_NOTIFY_SUBJECT_PREFIX = 'OkFile 新文件通知';
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
const SITE_SUBDOMAIN_PREFIX = 'st-';
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
  const isEn = lang === 'en';
  if (pageType === 'upload') {
    return {
      title: isEn ? 'OkFile - Manual Upload' : 'OkFile - 人工上载',
      description: isEn
        ? 'Manual upload page for OkFile. Upload images, videos, PDFs, common files, or a full static site folder and publish it to a dedicated subdomain. API integration remains the recommended path for Agents.'
        : 'OkFile 人工上载页面，支持图片、视频、PDF、常见文件和整个静态站点目录；文件夹上载后可发布到独立子域名。对 Agent 而言，仍推荐优先使用 API 接入。',
      robots: 'noindex,follow'
    };
  }
  return {
    title: isEn
      ? 'OkFile — Agent-First File Upload and Publish Service'
      : 'OkFile — 面向 Agent 的文件上载与发布服务',
    description: isEn
      ? 'OkFile provides agent-first file upload and publish APIs with anonymous access, API Keys, direct links, preview URLs, multipart uploads up to 500MB, and static site folder publishing to dedicated subdomains.'
      : 'OkFile 主要为 Agent 提供文件上载与发布能力，支持匿名调用、API Key、直链返回、预览链接、最高 500MB 的分片上载，以及静态站点目录发布到独立子域名。',
    robots: 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1'
  };
}

function buildStructuredData(origin, currentPagePath, lang, pageType) {
  const inLanguage = lang === 'en' ? 'en' : 'zh-CN';
  if (pageType === 'upload') {
    return {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: lang === 'en' ? 'OkFile Manual Upload and Site Publish Page' : 'OkFile 人工上载与站点发布页',
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
    description: lang === 'en'
      ? 'Agent-first file upload and publish service with direct links, preview URLs, anonymous access, API Key support, and static site publishing to dedicated subdomains.'
      : '面向 Agent 的文件上载与发布服务，支持直链、预览链接、匿名调用、API Key，以及静态站点发布到独立子域名。',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD'
    }
  };
}

function buildSeoHeadMarkup(origin, currentPagePath, lang, pageType, title, description, robots) {
  const locale = lang === 'en' ? 'en_US' : 'zh_CN';
  const currentUrl = `${origin}${currentPagePath}`;
  const zhUrl = `${origin}${pageType === 'upload' ? localizedUploadPath('zh') : localizedHomePath('zh')}`;
  const enUrl = `${origin}${pageType === 'upload' ? localizedUploadPath('en') : localizedHomePath('en')}`;
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
    `  <link rel="alternate" hreflang="zh-CN" href="${zhUrl}">\n` +
    `  <link rel="alternate" hreflang="en" href="${enUrl}">\n` +
    `  <link rel="alternate" hreflang="x-default" href="${origin}${localizedHomePath('zh')}">\n` +
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
    { loc: `${origin}${localizedHomePath('zh')}`, alternates: { 'zh-CN': `${origin}${localizedHomePath('zh')}`, en: `${origin}${localizedHomePath('en')}` } },
    { loc: `${origin}${localizedHomePath('en')}`, alternates: { 'zh-CN': `${origin}${localizedHomePath('zh')}`, en: `${origin}${localizedHomePath('en')}` } }
  ];
  const body = pages.map((page) => (
    '  <url>\n' +
    `    <loc>${escapeHtml(page.loc)}</loc>\n` +
    `    <xhtml:link rel="alternate" hreflang="zh-CN" href="${escapeHtml(page.alternates['zh-CN'])}"/>\n` +
    `    <xhtml:link rel="alternate" hreflang="en" href="${escapeHtml(page.alternates.en)}"/>\n` +
    `    <xhtml:link rel="alternate" hreflang="x-default" href="${escapeHtml(page.alternates['zh-CN'])}"/>\n` +
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
  const currentLang = lang === 'en' ? 'en' : 'zh-CN';
  const otherLang = lang === 'en' ? 'zh' : 'en';
  const currentPagePath = pageType === 'upload' ? localizedUploadPath(lang) : localizedHomePath(lang);
  const alternatePagePath = pageType === 'upload' ? localizedUploadPath(otherLang) : localizedHomePath(otherLang);
  const cache = caches.default;
  const cacheKeyUrl = new URL(request.url);
  cacheKeyUrl.pathname = `/__localized_static__/${STATIC_PAGE_CACHE_VERSION}${currentPagePath}`;
  cacheKeyUrl.search = '';
  const cacheKey = new Request(cacheKeyUrl.toString(), { method: 'GET' });
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const assetUrl = new URL(request.url);
  assetUrl.pathname = assetPath;
  assetUrl.search = '';

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
    `<a href="${alternatePagePath}" id="langToggle" style="font-weight:bold;color:#aaa;">${lang === 'en' ? '中文' : 'EN'}</a>`
  );
  html = html.replace(
    /let currentLang = localStorage\.getItem\('okfile_lang'\) \|\| 'zh-CN';/,
    `let currentLang = '${currentLang}';`
  );
  html = html.replace(
    /langToggle\.addEventListener\('click',[\s\S]*?\}\);/,
    `langToggle.href = '${alternatePagePath}';`
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

function sanitizeFilename(name) {
  const trimmed = (name || 'unnamed').trim();
  return trimmed ? trimmed.slice(0, 200) : 'unnamed';
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
    return { icon: 'DIR', className: 'directory', label: '目录' };
  }
  const ext = fileExtension(name);
  if (isImage(contentType)) return { icon: 'IMG', className: 'image', label: '图片' };
  if (isVideo(contentType)) return { icon: 'VID', className: 'video', label: '视频' };
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
    return { icon: 'JS', className: 'code', label: '脚本' };
  }
  if (contentType.startsWith('audio/')) return { icon: 'AUD', className: 'audio', label: '音频' };
  if (
    contentType.includes('zip') ||
    contentType.includes('compressed') ||
    ['zip', 'rar', '7z', 'tar', 'gz', 'tgz', 'bz2'].includes(ext)
  ) {
    return { icon: 'ZIP', className: 'archive', label: '压缩包' };
  }
  if (
    contentType.startsWith('text/') ||
    ['txt', 'md', 'json', 'yml', 'yaml', 'xml', 'csv', 'log'].includes(ext)
  ) {
    return { icon: 'TXT', className: 'text', label: '文本' };
  }
  return { icon: 'FILE', className: 'file', label: '文件' };
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
  return `/i/${id}`;
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
  const trimmed = String(name || '').trim();
  return trimmed ? trimmed.slice(0, 120) : 'site';
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
<meta name="theme-color" content="#0a0a0a">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;background:#0a0a0a;color:#e5e5e5;min-height:100vh;padding:32px 16px}
.wrap{max-width:980px;margin:0 auto}
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
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}
.field{margin-top:14px}
.field label{display:block;font-size:13px;color:#aaa;margin-bottom:8px}
.field input,.field select{width:100%;padding:12px 14px;border-radius:10px;border:1px solid #2b2b2b;background:#0b0b0b;color:#f5f5f5}
.field button,.btn-primary{margin-top:14px;padding:12px 16px;border-radius:10px;border:none;background:#2563eb;color:#fff;cursor:pointer;font-weight:600}
.field button:hover,.btn-primary:hover{background:#1d4ed8}
.msg{margin-top:14px;font-size:14px;color:#86efac}
.err{margin-top:14px;font-size:14px;color:#f87171}
.key-list{display:grid;gap:12px;margin-top:18px}
.key-item{border:1px solid #222;border-radius:12px;padding:16px;background:#0c0c0c}
.row{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap}
.badge{display:inline-block;padding:4px 10px;border-radius:999px;background:#172554;color:#93c5fd;font-size:12px}
.mono{font-family:Consolas,'SF Mono',monospace;word-break:break-all}
.note{margin-top:12px;padding:12px;border-radius:10px;background:#17255422;border:1px solid #1d4ed855;color:#bfdbfe;font-size:13px}
table{width:100%;border-collapse:collapse;margin-top:14px}
th,td{border-bottom:1px solid #222;padding:10px 8px;text-align:left;font-size:13px}
th{color:#999}
td input,td select{width:100%;padding:8px 10px;border-radius:8px;border:1px solid #2b2b2b;background:#0b0b0b;color:#f5f5f5}
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

function accountPage(lang = 'zh') {
  const isEn = lang === 'en';
  const copy = isEn ? {
    title: 'OkFile Account',
    manualUpload: 'Manual Upload',
    adminPanel: 'Admin',
    logout: 'Logout',
    authTitle: 'Register / Login via Email',
    authDesc: 'Enter your email and OkFile will send a magic link from `no-reply@okfile.com`. Opening the link signs you in automatically.',
    emailLabel: 'Email',
    emailPlaceholder: 'you@example.com',
    sendLink: 'Send Magic Link',
    dashboardTitle: 'Account',
    dashboardDesc: 'After login, you can create API Keys for calling `/api/upload/prepare`. A new API Key is shown only once.',
    createKeyTitle: 'Create API Key',
    keyNameLabel: 'Name',
    keyNamePlaceholder: 'Example: Desktop Client / Python Script',
    createKey: 'Generate API Key',
    usageTitle: 'How To Use',
    noKeys: 'No API Keys yet.',
    rateLimit: 'Rate limit',
    uploadQuota: 'Upload quota',
    createdAt: 'Created at',
    currentUserPrefix: 'Signed in as: ',
    adminSuffix: ' (Admin)',
    sendSuccess: 'Magic link sent. Please check your email.',
    createSuccess: 'API Key created. Copy and save it now.',
    manualHome: localizedHomePath('en'),
    uploadPath: localizedUploadPath('en'),
    accountPath: localizedAccountPath('en'),
    alternateAccountPath: localizedAccountPath('zh'),
    langToggle: '中文'
  } : {
    title: 'OkFile 账户中心',
    manualUpload: '人工上载',
    adminPanel: '管理员后台',
    logout: '退出登录',
    authTitle: '邮箱注册 / 登录',
    authDesc: '输入邮箱后，系统会通过 `no-reply@okfile.com` 发送 Magic Link。点击邮件中的验证链接后自动登录。',
    emailLabel: '邮箱地址',
    emailPlaceholder: 'you@example.com',
    sendLink: '发送登录链接',
    dashboardTitle: '账户中心',
    dashboardDesc: '登录后可以创建 API Key，用于调用 `/api/upload/prepare`。API Key 只会在创建时显示一次。',
    createKeyTitle: '创建 API Key',
    keyNameLabel: '名称',
    keyNamePlaceholder: '例如：桌面客户端 / Python 脚本',
    createKey: '生成 API Key',
    usageTitle: '调用方式',
    noKeys: '还没有 API Key。',
    rateLimit: '频率限制',
    uploadQuota: '上载次数',
    createdAt: '创建时间',
    currentUserPrefix: '当前登录邮箱：',
    adminSuffix: '（管理员）',
    sendSuccess: '验证链接已发送，请检查邮箱。',
    createSuccess: 'API Key 已生成，请立即复制保存。',
    manualHome: localizedHomePath('zh'),
    uploadPath: localizedUploadPath('zh'),
    accountPath: localizedAccountPath('zh'),
    alternateAccountPath: localizedAccountPath('en'),
    langToggle: 'EN'
  };
  return accountShell(
    copy.title,
    `<div class="topbar">
      <a class="brand" href="${copy.manualHome}">Ok<span>File</span></a>
      <div class="nav">
        <a href="${copy.uploadPath}">${copy.manualUpload}</a>
        <a href="${ADMIN_PANEL_ORIGIN}/" id="adminLink" class="hidden">${copy.adminPanel}</a>
        <a href="${copy.alternateAccountPath}">${copy.langToggle}</a>
        <button id="logoutBtn" class="hidden">${copy.logout}</button>
      </div>
    </div>

    <div class="card" id="authCard">
      <h1>${copy.authTitle}</h1>
      <p class="muted">${copy.authDesc.replace('`', '<code>').replace('`', '</code>')}</p>
      <div class="field">
        <label for="email">${copy.emailLabel}</label>
        <input id="email" type="email" placeholder="${copy.emailPlaceholder}" />
      </div>
      <button class="btn-primary" id="sendLinkBtn">${copy.sendLink}</button>
      <div class="msg hidden" id="authMsg"></div>
      <div class="err hidden" id="authErr"></div>
    </div>

    <div class="card hidden" id="dashboardCard">
      <h1>${copy.dashboardTitle}</h1>
      <p class="muted">${copy.dashboardDesc.replace('`', '<code>').replace('`', '</code>')}</p>
      <div class="note" id="userSummary"></div>
      <div class="grid">
        <div class="card" style="margin-bottom:0">
          <h2>${copy.createKeyTitle}</h2>
          <div class="field">
            <label for="keyName">${copy.keyNameLabel}</label>
            <input id="keyName" type="text" placeholder="${copy.keyNamePlaceholder}" />
          </div>
          <button class="btn-primary" id="createKeyBtn">${copy.createKey}</button>
          <div class="msg hidden" id="createMsg"></div>
          <div class="err hidden" id="createErr"></div>
          <div class="note hidden mono" id="newKeyBox"></div>
        </div>
        <div class="card" style="margin-bottom:0">
          <h2>${copy.usageTitle}</h2>
          <div class="note mono">POST /api/upload/prepare
{
  "filename": "demo.jpg",
  "size": 12345,
  "contentType": "image/jpeg",
  "apiKey": "okf_..."
}</div>
        </div>
      </div>
      <div class="key-list" id="keyList"></div>
    </div>`,
    `const $=(id)=>document.getElementById(id);
const i18n=${JSON.stringify({
      noKeys: copy.noKeys,
      rateLimit: copy.rateLimit,
      uploadQuota: copy.uploadQuota,
      createdAt: copy.createdAt,
      currentUserPrefix: copy.currentUserPrefix,
      adminSuffix: copy.adminSuffix,
      sendSuccess: copy.sendSuccess,
      createSuccess: copy.createSuccess
    })};
const authCard=$('authCard'),dashboardCard=$('dashboardCard'),adminLink=$('adminLink'),logoutBtn=$('logoutBtn');
const authMsg=$('authMsg'),authErr=$('authErr'),createMsg=$('createMsg'),createErr=$('createErr'),newKeyBox=$('newKeyBox');
function show(el,msg){el.textContent=msg;el.classList.remove('hidden')}
function hide(el){el.textContent='';el.classList.add('hidden')}
async function api(path,init){
  const res=await fetch(path,{credentials:'same-origin',...init});
  const data=await res.json().catch(()=>null);
  if(!res.ok) throw new Error(data?.error||('HTTP '+res.status));
  return data;
}
function renderKeys(keys){
  $('keyList').innerHTML = keys.length ? keys.map((item)=>\`
    <div class="key-item">
      <div class="row"><strong>\${item.name}</strong><span class="badge">\${item.status}</span></div>
      <div class="muted mono" style="margin-top:8px">\${item.keyPrefix}...</div>
      <div class="muted" style="margin-top:8px">\${i18n.rateLimit}: \${item.limitPreparePerWindow} / \${item.limitPrepareWindowSec}s</div>
      <div class="muted">\${i18n.uploadQuota}: \${item.uploadedCountTotal} / \${item.limitUploadCountTotal}</div>
      <div class="muted">\${i18n.createdAt}: \${item.createdAt}</div>
    </div>\`).join('') : '<div class="muted">' + i18n.noKeys + '</div>';
}
async function loadMe(){
  try{
    const me=await api('/api/account/me');
    authCard.classList.add('hidden');
    dashboardCard.classList.remove('hidden');
    logoutBtn.classList.remove('hidden');
    if(me.isAdmin) adminLink.classList.remove('hidden');
    $('userSummary').textContent = i18n.currentUserPrefix + me.email + (me.isAdmin ? i18n.adminSuffix : '');
    renderKeys(me.apiKeys || []);
  }catch{
    authCard.classList.remove('hidden');
    dashboardCard.classList.add('hidden');
    logoutBtn.classList.add('hidden');
    adminLink.classList.add('hidden');
  }
}
$('sendLinkBtn').onclick = async () => {
  hide(authMsg); hide(authErr);
  try{
    await api('/api/auth/request-link',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:$('email').value})});
    show(authMsg,i18n.sendSuccess);
  }catch(error){
    show(authErr,error.message);
  }
};
$('createKeyBtn').onclick = async () => {
  hide(createMsg); hide(createErr); hide(newKeyBox);
  try{
    const data=await api('/api/account/api-keys',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:$('keyName').value})});
    show(createMsg,i18n.createSuccess);
    show(newKeyBox,data.apiKey);
    $('keyName').value='';
    await loadMe();
  }catch(error){
    show(createErr,error.message);
  }
};
logoutBtn.onclick = async () => {
  await fetch('/api/auth/logout',{method:'POST',credentials:'same-origin'});
  location.reload();
};
loadMe();`
    ,
    { lang: isEn ? 'en' : 'zh-CN' }
  );
}

function adminPage() {
  return accountShell(
    'OkFile 管理后台',
    `<div class="topbar">
      <a class="brand" href="/">Ok<span>File</span></a>
      <div class="nav">
        <a href="/account">账户中心</a>
        <a href="/zh/upload/">人工上载</a>
      </div>
    </div>
    <div class="card">
      <h1>管理员后台</h1>
      <p class="muted">这里可以查看注册用户、注册时间，按 API Key 设置频率限制和总上载次数限制，并手动清理已过期文件。仅 <code>ADMIN_EMAILS</code> 白名单中的邮箱可访问。</p>
      <div class="msg hidden" id="adminMsg"></div>
      <div class="err hidden" id="adminErr"></div>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:16px 0 18px">
        <label class="muted" for="cleanupLimit">本次检查数量</label>
        <input id="cleanupLimit" type="number" min="1" max="1000" value="200" style="width:120px">
        <button class="btn-primary" id="cleanupBtn">立即清理过期文件</button>
        <span class="muted" id="cleanupResult">尚未执行清理</span>
      </div>
      <div id="adminTableWrap" class="muted">正在加载...</div>
    </div>`,
    `const $=(id)=>document.getElementById(id);
function show(el,msg){el.textContent=msg;el.classList.remove('hidden')}
function hide(el){el.textContent='';el.classList.add('hidden')}
function formatTime(value){
  if(!value) return '-';
  const d=new Date(value);
  if(Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('zh-CN',{hour12:false});
}
async function api(path,init){
  const res=await fetch(path,{credentials:'same-origin',...init});
  const data=await res.json().catch(()=>null);
  if(!res.ok) throw new Error(data?.error||('HTTP '+res.status));
  return data;
}
function setCleanupBusy(busy){
  $('cleanupBtn').disabled = busy;
  $('cleanupBtn').textContent = busy ? '清理中...' : '立即清理过期文件';
}
async function runCleanup(){
  hide($('adminErr')); hide($('adminMsg'));
  const rawLimit = Number($('cleanupLimit').value || 200);
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
    await load();
  }catch(error){
    $('cleanupResult').textContent = '清理失败';
    show($('adminErr'),error.message);
  }finally{
    setCleanupBusy(false);
  }
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
async function load(){
  hide($('adminErr')); hide($('adminMsg'));
  try{
    const data=await api('/api/admin/api-keys');
    $('adminTableWrap').innerHTML = '<table><thead><tr><th>用户</th><th>注册时间</th><th>API Key</th><th>状态</th><th>频率次数</th><th>频率窗口(秒)</th><th>上载上限</th><th>已上载</th><th>操作</th></tr></thead><tbody>' + data.apiKeys.map(row).join('') + '</tbody></table>';
    document.querySelectorAll('[data-save]').forEach((btn)=>{
      btn.onclick = async () => {
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
          await load();
        }catch(error){
          show($('adminErr'),error.message);
        }
      };
    });
  }catch(error){
    $('adminTableWrap').innerHTML = '';
    show($('adminErr'),error.message);
  }
}
$('cleanupBtn').onclick = runCleanup;
load();`
  );
}

function notFoundHTML(id) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>404 - OkFile</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#0a0a0a;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh}.wrap{text-align:center;padding:24px}.icon{font-size:64px;margin-bottom:20px}h1{font-size:24px;font-weight:600;margin-bottom:12px;color:#ef4444}p{color:#888;font-size:14px;margin-bottom:24px}a{color:#60a5fa;text-decoration:none;border:1px solid #333;padding:8px 20px;border-radius:8px;display:inline-block}a:hover{border-color:#60a5fa}</style></head>
<body><div class="wrap"><div class="icon">📭</div><h1>文件不存在</h1><p>文件 <code>${escapeHtml(id)}</code> 未找到</p><a href="/">返回 OkFile 首页</a></div></body></html>`;
}

function downloadLimitExceededHTML(meta) {
  const name = escapeHtml(meta?.name || meta?.id || 'unknown');
  const id = escapeHtml(meta?.id || 'unknown');
  const maxDownloads = Number.isInteger(meta?.maxDownloads) ? meta.maxDownloads : 0;
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>下载次数已用完 - OkFile</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#0a0a0a;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh}.wrap{text-align:center;padding:24px;max-width:560px}.icon{font-size:64px;margin-bottom:20px}h1{font-size:24px;font-weight:600;margin-bottom:12px;color:#f59e0b}p{color:#9ca3af;font-size:14px;line-height:1.8;margin-bottom:16px}a{color:#60a5fa;text-decoration:none;border:1px solid #333;padding:8px 20px;border-radius:8px;display:inline-block}a:hover{border-color:#60a5fa}</style></head>
<body><div class="wrap"><div class="icon">🔒</div><h1>下载次数已用完</h1><p>文件 <code>${name}</code>（ID: <code>${id}</code>）已达到下载上限${maxDownloads > 0 ? `（${maxDownloads} 次）` : ''}。</p><a href="/">返回 OkFile 首页</a></div></body></html>`;
}

function expiredFileHTML(meta) {
  const name = escapeHtml(meta?.name || meta?.id || 'unknown');
  const id = escapeHtml(meta?.id || 'unknown');
  const expiresAt = meta?.expiresAt ? `<p>过期时间：<code>${escapeHtml(meta.expiresAt)}</code></p>` : '';
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>文件已过期 - OkFile</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#0a0a0a;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh}.wrap{text-align:center;padding:24px;max-width:560px}.icon{font-size:64px;margin-bottom:20px}h1{font-size:24px;font-weight:600;margin-bottom:12px;color:#f59e0b}p{color:#9ca3af;font-size:14px;line-height:1.8;margin-bottom:16px}a{color:#60a5fa;text-decoration:none;border:1px solid #333;padding:8px 20px;border-radius:8px;display:inline-block}a:hover{border-color:#60a5fa}</style></head>
<body><div class="wrap"><div class="icon">⏳</div><h1>文件已过期</h1><p>文件 <code>${name}</code>（ID: <code>${id}</code>）已超过可访问期限。</p>${expiresAt}<a href="/">返回 OkFile 首页</a></div></body></html>`;
}

function viewerShell(title, body, extraHead = '') {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<title>${title}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="icon" href="/favicon.ico" type="image/svg+xml">
${extraHead}
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;background:#0a0a0a;color:#e5e5e5;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;padding:16px}
.wrap{width:100%;max-width:960px;text-align:center}
.panel{position:relative;width:100%;background:#111;border-radius:12px;overflow:hidden;margin-bottom:20px;box-shadow:0 8px 32px rgba(0,0,0,.5)}
.panel img,.panel video,.panel iframe{width:100%;display:block;border:0;background:#000;max-height:80vh}
.panel img{height:auto;object-fit:contain}
.tag{display:inline-block;padding:3px 10px;border-radius:6px;font-size:11px;font-weight:700;letter-spacing:.05em;margin-bottom:12px}
.tag.image{background:rgba(52,211,153,.15);color:#34d399;border:1px solid rgba(52,211,153,.3)}
.tag.video{background:rgba(96,165,250,.15);color:#60a5fa;border:1px solid rgba(96,165,250,.3)}
.tag.pdf,.tag.file{background:rgba(250,204,21,.15);color:#facc15;border:1px solid rgba(250,204,21,.3)}
.info{display:flex;gap:12px;justify-content:center;color:#666;font-size:13px;margin-top:8px;flex-wrap:wrap}
.info span{background:#161619;padding:4px 12px;border-radius:6px}
.actions{margin-top:18px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap}
.btn{display:inline-flex;align-items:center;gap:6px;padding:8px 18px;border-radius:8px;font-size:13px;font-weight:500;text-decoration:none;border:1px solid #333;color:#ccc;transition:all .15s;cursor:pointer}
.btn:hover{border-color:#60a5fa;color:#60a5fa;background:rgba(96,165,250,.08)}
.btn-primary{background:#2563eb;border-color:#2563eb;color:#fff}
.btn-primary:hover{background:#1d4ed8;border-color:#1d4ed8;color:#fff}
.btn-disabled{opacity:.45;pointer-events:none;cursor:not-allowed}
.name{font-size:18px;font-weight:600;margin:8px 0 6px;color:#fff;word-break:break-word}
.hint{color:#888;font-size:13px;line-height:1.6}
.warn{margin-top:12px;padding:12px 14px;border-radius:10px;background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.22);color:#fbbf24;font-size:13px;line-height:1.7;text-align:left}
</style></head><body>${body}</body></html>`;
}

function downloadLimitHint(meta) {
  if (!meta?.downloadLimitEnabled) return '';
  if ((meta.remainingDownloads || 0) <= 0) {
    return '<div class="hint" style="margin-top:12px">已启用下载次数限制：当前下载次数已用完。</div>';
  }
  return `<div class="hint" style="margin-top:12px">已启用下载次数限制：剩余 ${meta.remainingDownloads} / ${meta.maxDownloads} 次。</div>`;
}

function viewerDownloadAction(meta, label) {
  const href = escapeHtml(meta?.downloadUrl || controlledDownloadUrl(meta?.id || ''));
  if (meta?.downloadLimitEnabled && (meta.remainingDownloads || 0) <= 0) {
    return `<span class="btn btn-primary btn-disabled">${escapeHtml(label)}（已达上限）</span>`;
  }
  return `<a class="btn btn-primary" href="${href}">${escapeHtml(label)}</a>`;
}

function imageViewerPage(meta) {
  const src = mediaUrl(meta.id);
  return viewerShell(
    `OkFile - ${escapeHtml(meta.name || meta.id)}`,
    `<div class="wrap">
      <div class="panel"><img src="${src}" alt="${escapeHtml(meta.name || meta.id)}" loading="lazy"></div>
      <span class="tag image">IMAGE</span>
      <div class="name">${escapeHtml(meta.name || meta.id)}</div>
      <div class="info"><span>${formatSize(meta.size)}</span><span>${escapeHtml(meta.contentType)}</span><span>${escapeHtml(meta.id)}</span></div>
      ${downloadLimitHint(meta)}
      <div class="actions">
        ${viewerDownloadAction(meta, '下载图片')}
        <a class="btn" href="${src}" target="_blank">文件直链</a>
        <a class="btn" href="/">返回首页</a>
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
      <div class="info"><span>${formatSize(meta.size)}</span><span>${escapeHtml(meta.contentType)}</span><span>${escapeHtml(meta.id)}</span></div>
      <div class="warn" id="videoCompatHint">如果播放器空白、只有音频没有画面，通常表示当前浏览器不兼容该 MP4 的视频编码。请优先尝试“下载视频”或“文件直链”；如需稳定在线预览，建议转码为 H.264 + AAC 的 MP4。</div>
      ${downloadLimitHint(meta)}
      <div class="actions">
        ${viewerDownloadAction(meta, '下载视频')}
        <a class="btn" href="${src}" target="_blank">文件直链</a>
        <a class="btn" href="/">返回首页</a>
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
        showHint('当前浏览器已读取到视频时长，但没有解码出可显示画面。这通常是视频编码不兼容。请下载视频或使用文件直链；如需稳定预览，建议转码为 H.264 + AAC 的 MP4。');
        return;
      }
      maybeHideHint();
    }, 800);
  });
  video.addEventListener('error', function () {
    showHint('当前浏览器无法播放这个视频文件。你可以先下载视频，或转码为 H.264 + AAC 的 MP4 后再预览。');
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
      <div class="info"><span>${formatSize(meta.size)}</span><span>${escapeHtml(meta.contentType)}</span><span>${escapeHtml(meta.id)}</span></div>
      ${downloadLimitHint(meta)}
      <div class="actions">
        ${viewerDownloadAction(meta, '下载 PDF')}
        <a class="btn" href="${src}" target="_blank">文件直链</a>
        <a class="btn" href="/">返回首页</a>
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
        <div class="hint">该文件类型暂不支持在线预览，请直接下载查看。</div>
      </div>
      <span class="tag file">FILE</span>
      <div class="name">${escapeHtml(meta.name || meta.id)}</div>
      <div class="info"><span>${formatSize(meta.size)}</span><span>${escapeHtml(meta.contentType)}</span><span>${escapeHtml(meta.id)}</span></div>
      ${downloadLimitHint(meta)}
      <div class="actions">
        ${viewerDownloadAction(meta, '下载文件')}
        <a class="btn" href="${src}" target="_blank">文件直链</a>
        <a class="btn" href="/">返回首页</a>
      </div>
    </div>`
  );
}

function requirePresignEnv(env) {
  const missing = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'].filter((key) => !env[key]);
  if (missing.length) throw new Error(`缺少预签名配置: ${missing.join(', ')}`);
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
    downloadUrl: controlledDownloadUrl(id)
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
    subject: 'OkFile 登录验证链接',
    html: `<div style="font-family:Arial,sans-serif;line-height:1.7;color:#111">
      <h2>登录 OkFile</h2>
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
    verifiedAt: record.verified_at,
    createdAt: record.created_at,
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
    String(name || '默认 API Key').trim().slice(0, 80) || '默认 API Key',
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
  if (apiKey.status !== 'active') return { ok: false, status: 403, error: 'API Key 已被禁用' };
  if (apiKey.uploadedCountTotal >= apiKey.limitUploadCountTotal) {
    return { ok: false, status: 403, error: 'API Key 上载次数已用尽' };
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
    return { ok: false, status: 429, error: 'API Key 调用过于频繁，请稍后再试' };
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
      throw new Error(`查询分片失败: ${errorText || `HTTP ${response.status}`}`);
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
    return { ok: false, status: 409, error: '尚未检测到已上载分片，请先完成所有 PUT 后再调用 complete' };
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
        error: `分片数量不完整，当前 ${parts.length}/${totalParts}`,
        uploadedParts: parts.length,
        totalParts,
        missingParts
      };
    }
  } else {
    for (let index = 0; index < parts.length; index++) {
      const expectedPartNumber = index + 1;
      if (parts[index].partNumber !== expectedPartNumber) {
        return { ok: false, status: 409, error: `分片编号不连续，缺少 part ${expectedPartNumber}` };
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
      error: `客户端上报的分片 ETag 数量不完整，期望 ${totalParts}，实际 ${normalizedClientParts.length}`
    };
  }
  const serverMap = new Map((uploadedParts || []).map((item) => [Number(item.partNumber), normalizeETag(item.etag)]));
  for (const part of normalizedClientParts) {
    const serverEtag = serverMap.get(part.partNumber);
    if (!serverEtag) {
      return {
        ok: false,
        status: 409,
        error: `服务端未找到 part ${part.partNumber}，无法校验分片 ETag`
      };
    }
    if (serverEtag !== part.etag) {
      return {
        ok: false,
        status: 409,
        error: `part ${part.partNumber} 的 ETag 不匹配`
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
    return { ok: false, status: 409, error: '服务端未返回对象 ETag，无法完成完整性校验' };
  }
  if (expected !== actual) {
    return { ok: false, status: 409, error: '对象 ETag 不匹配，文件完整性校验失败' };
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
    lastDownloadedAt: ''
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
  if (!release) throw new Error('站点版本不存在');
  const site = await getSiteById(siteId, env);
  if (!site) throw new Error('站点不存在');
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
      id, file_name, content_type, size, publish_origin, view_url, download_url, play_url, api_key_id, user_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      file_name = excluded.file_name,
      content_type = excluded.content_type,
      size = excluded.size,
      publish_origin = excluded.publish_origin,
      view_url = excluded.view_url,
      download_url = excluded.download_url,
      play_url = excluded.play_url,
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
              <span class="name-sub">返回上一级目录</span>
            </span>
          </a>
        </td>
        <td><span class="type-pill directory">上级目录</span></td>
        <td>-</td>
        <td>-</td>
        <td><a class="btn" href="${parentHref}">返回上级</a></td>
      </tr>
    `] : []),
    ...listing.directories.map((item) => `
      <tr data-kind="directory" data-filter="directory" data-name="${escapeHtml(item.name)}" data-size="${Number(item.totalSize || 0)}" data-time="${new Date(item.latestUpdatedAt || 0).getTime() || 0}">
        <td>
          <a href="${item.href}" class="name-link">
            <span class="file-icon directory">DIR</span>
            <span class="name-stack">
              <span class="name-main">${escapeHtml(item.name)}</span>
              <span class="name-sub">${item.fileCount} 个条目 · ${escapeHtml(formatSize(Number(item.totalSize || 0)))}</span>
            </span>
          </a>
        </td>
        <td><span class="type-pill directory">目录</span></td>
        <td>${escapeHtml(formatSize(Number(item.totalSize || 0)))}</td>
        <td>${escapeHtml(formatSiteListingTime(item.latestUpdatedAt || ''))}</td>
        <td><a class="btn" href="${item.href}">打开目录</a></td>
      </tr>
    `),
    ...listing.files.map((item) => {
      const actionHref = (isImage(item.contentType) || isVideo(item.contentType)) ? item.href : item.downloadHref;
      const actionLabel = isImage(item.contentType) ? '查看' : (isVideo(item.contentType) ? '播放' : '下载');
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
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${escapeHtml(site.name || site.id)} - 文件列表</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>*{box-sizing:border-box}body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#0b0d11;color:#e5e7eb;padding:24px}.wrap{max-width:1120px;margin:0 auto}.crumbs{display:flex;gap:8px;flex-wrap:wrap;font-size:13px;color:#9ca3af;margin:14px 0 18px}.crumb{display:inline-flex;align-items:center;gap:8px}.crumb a{color:#93c5fd;text-decoration:none}.crumb.current span:last-child{color:#e5e7eb;font-weight:600}.summary{display:flex;gap:14px;flex-wrap:wrap;color:#9ca3af;font-size:13px;margin-bottom:16px}.toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:14px}.toolbar-group{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.sorts,.filters{display:flex;gap:8px;flex-wrap:wrap}.sort-btn,.filter-btn{appearance:none;border:1px solid #374151;background:#0f172a;color:#cbd5e1;padding:8px 12px;border-radius:999px;font-size:12px;cursor:pointer;transition:.18s}.sort-btn:hover,.sort-btn.active,.filter-btn:hover,.filter-btn.active{border-color:#60a5fa;color:#fff;background:#111827}.toolbar-note{font-size:12px;color:#94a3b8}.panel{background:#111827;border:1px solid #1f2937;border-radius:14px;overflow:hidden}.title{padding:18px 20px;border-bottom:1px solid #1f2937}.title h1{font-size:22px;margin:0 0 6px}.title p{margin:0;color:#9ca3af;font-size:14px}.name-link{display:flex;align-items:center;gap:12px;color:#e5e7eb;text-decoration:none;min-width:0}.name-stack{display:flex;flex-direction:column;gap:4px;min-width:0}.name-main{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.name-sub{font-size:12px;color:#94a3b8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.file-icon{display:inline-flex;align-items:center;justify-content:center;min-width:44px;height:30px;padding:0 8px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:.04em;border:1px solid transparent}.file-icon.directory{background:rgba(59,130,246,.15);border-color:rgba(96,165,250,.25);color:#93c5fd}.file-icon.image{background:rgba(16,185,129,.14);border-color:rgba(52,211,153,.24);color:#6ee7b7}.file-icon.video{background:rgba(244,63,94,.14);border-color:rgba(251,113,133,.24);color:#fda4af}.file-icon.pdf{background:rgba(239,68,68,.14);border-color:rgba(248,113,113,.24);color:#fca5a5}.file-icon.code{background:rgba(168,85,247,.14);border-color:rgba(196,181,253,.24);color:#d8b4fe}.file-icon.text{background:rgba(250,204,21,.14);border-color:rgba(253,224,71,.24);color:#fde68a}.file-icon.audio{background:rgba(34,197,94,.14);border-color:rgba(134,239,172,.24);color:#bbf7d0}.file-icon.archive{background:rgba(249,115,22,.14);border-color:rgba(251,146,60,.24);color:#fdba74}.file-icon.file{background:rgba(148,163,184,.15);border-color:rgba(203,213,225,.2);color:#cbd5e1}.type-pill{display:inline-flex;align-items:center;justify-content:center;padding:6px 10px;border-radius:999px;font-size:12px;border:1px solid transparent}.type-pill.directory{background:rgba(59,130,246,.12);border-color:rgba(96,165,250,.22);color:#93c5fd}.type-pill.image{background:rgba(16,185,129,.12);border-color:rgba(52,211,153,.22);color:#6ee7b7}.type-pill.video{background:rgba(244,63,94,.12);border-color:rgba(251,113,133,.22);color:#fda4af}.type-pill.pdf{background:rgba(239,68,68,.12);border-color:rgba(248,113,113,.22);color:#fca5a5}.type-pill.code{background:rgba(168,85,247,.12);border-color:rgba(196,181,253,.22);color:#d8b4fe}.type-pill.text{background:rgba(250,204,21,.12);border-color:rgba(253,224,71,.22);color:#fde68a}.type-pill.audio{background:rgba(34,197,94,.12);border-color:rgba(134,239,172,.22);color:#bbf7d0}.type-pill.archive{background:rgba(249,115,22,.12);border-color:rgba(251,146,60,.22);color:#fdba74}.type-pill.file{background:rgba(148,163,184,.12);border-color:rgba(203,213,225,.18);color:#cbd5e1}table{width:100%;border-collapse:collapse}th,td{padding:14px 16px;border-bottom:1px solid #1f2937;text-align:left;font-size:14px;vertical-align:middle}th{color:#9ca3af;font-weight:500;background:#0f172a}.parent-row td{background:rgba(15,23,42,.45)}tr:last-child td{border-bottom:none}tr[hidden]{display:none !important}a{color:#e5e7eb;text-decoration:none}.btn{display:inline-block;padding:7px 12px;border:1px solid #374151;border-radius:8px;color:#cbd5e1}.btn:hover{border-color:#60a5fa;color:#fff}.empty{padding:32px 20px;color:#9ca3af}@media (max-width:860px){body{padding:16px}th:nth-child(2),td:nth-child(2){display:none}}@media (max-width:620px){th:nth-child(4),td:nth-child(4){display:none}.file-icon{min-width:38px;height:28px;font-size:10px}}</style></head>
<body><div class="wrap"><div class="title"><h1>站点文件列表</h1><p>${escapeHtml(site.name || site.id || 'site')}</p></div>
<div class="crumbs">${crumbs.map((item, index) => {
    const isCurrent = index === crumbs.length - 1;
    return `<span class="crumb${isCurrent ? ' current' : ''}">${index ? '<span>/</span>' : ''}${isCurrent ? `<span>${escapeHtml(item.name)}</span>` : `<a href="${item.href}">${escapeHtml(item.name)}</a>`}</span>`;
  }).join('')}</div>
<div class="summary"><span>目录：${listing.directories.length}</span><span>文件：${listing.files.length}</span><span>当前目录总大小：${escapeHtml(formatSize(Number(listing.totalSize || 0)))}</span><span>最近更新：${escapeHtml(formatSiteListingTime(listing.latestUpdatedAt || ''))}</span><span>站点：${escapeHtml(site.siteHostname || '')}</span></div>
<div class="toolbar">
  <div class="toolbar-group">
    <div class="sorts">
      <button class="sort-btn active" type="button" data-sort="name">按名称</button>
      <button class="sort-btn" type="button" data-sort="time">按时间</button>
      <button class="sort-btn" type="button" data-sort="size">按大小</button>
    </div>
    <div class="filters">
      <button class="filter-btn active" type="button" data-filter="all">全部</button>
      <button class="filter-btn" type="button" data-filter="directory">目录</button>
      <button class="filter-btn" type="button" data-filter="image">图片</button>
      <button class="filter-btn" type="button" data-filter="video">视频</button>
      <button class="filter-btn" type="button" data-filter="document">文档</button>
      <button class="filter-btn" type="button" data-filter="text">文本</button>
      <button class="filter-btn" type="button" data-filter="other">其它</button>
    </div>
  </div>
  <div class="toolbar-note">${listing.directoryPath ? `<a class="btn" href="${parentHref}">返回上级</a>` : '目录优先显示，可按名称、时间或大小排序文件'}</div>
</div>
<div class="panel">${rows ? `<table><thead><tr><th>文件名</th><th>类型</th><th>大小</th><th>上传时间</th><th>操作</th></tr></thead><tbody id="siteListingBody">${rows}</tbody></table>` : '<div class="empty">当前目录为空。</div>'}</div>
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
    return String(a.dataset.name || '').localeCompare(String(b.dataset.name || ''), 'zh-CN', { numeric: true, sensitivity: 'base' });
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
  const html = `<div style="font-family:Arial,sans-serif;line-height:1.7;color:#111">
    <h2>收到新文件</h2>
    <ul>
      <li>文件名：${escapeHtml(meta.name || meta.id)}</li>
      <li>文件 ID：${escapeHtml(meta.id)}</li>
      <li>大小：${escapeHtml(formatSize(meta.size))}</li>
      <li>类型：${escapeHtml(meta.contentType || 'application/octet-stream')}</li>
      <li>上传时间：${escapeHtml(meta.uploadedAt || new Date().toISOString())}</li>
      ${meta.expiresAt ? `<li>过期时间：${escapeHtml(meta.expiresAt)}</li>` : ''}
    </ul>
    <p>相关链接：</p>
    <ul>
      <li>预览页：<a href="${viewUrl}">${viewUrl}</a></li>
      <li>下载页：<a href="${downloadUrl}">${downloadUrl}</a></li>
      <li>播放页：<a href="${playUrl}">${playUrl}</a></li>
    </ul>
  </div>`;
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
        html
      })
    });
    if (!resendRes.ok) {
      const errorText = await resendRes.text();
      throw new Error(`发送上传通知失败: ${errorText}`);
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

function getRequestApiKey(request, body) {
  return String(request.headers.get('x-api-key') || body?.apiKey || '').trim();
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
  return redirect('/account', { 'Set-Cookie': buildSessionCookie(sessionToken, request) });
}

async function handleAccountMe(request, env) {
  const session = await getSessionFromRequest(request, env);
  if (!session) return json({ error: '请先登录' }, 401);
  return json({
    success: true,
    email: session.email,
    isAdmin: session.isAdmin,
    apiKeys: await listApiKeysForUser(session.userId, env)
  });
}

async function handleCreateApiKey(request, env) {
  const session = await getSessionFromRequest(request, env);
  if (!session) return json({ error: '请先登录' }, 401);
  let body;
  try {
    body = await request.json();
  } catch (error) {
    return json({ error: `请求体必须是 JSON: ${error.message}` }, 400);
  }
  const apiKey = await createApiKey(session.userId, body?.name, env);
  return json({ success: true, apiKey });
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
    return json({ error: `请求体必须是 JSON: ${error.message}` }, 400);
  }

  const rawApiKey = getRequestApiKey(request, body);
  let apiKey = null;
  let session = null;
  if (rawApiKey) {
    apiKey = await getApiKeyByRaw(rawApiKey, env);
    if (!apiKey) return json({ error: 'API Key 无效' }, 401);
  } else {
    session = await getSessionFromRequest(request, env);
    const ip = getClientIp(request);
    const prepareLimit = takeRateLimit(prepareRateBuckets, `site-prepare:${ip}`, Math.max(10, Math.floor(PREPARE_RATE_LIMIT / 4)), PREPARE_RATE_WINDOW_MS);
    if (!prepareLimit.success) {
      return json({ error: `站点准备请求过多，请 ${(prepareLimit.resetInMs / 1000).toFixed(0)} 秒后再试` }, 429);
    }
  }

  const expiresAt = normalizeExpiresAt(body?.expiresAt);
  if (Number.isNaN(expiresAt)) {
    return json({ error: 'expiresAt 必须是有效的 ISO 8601 时间字符串' }, 400);
  }
  if (typeof expiresAt === 'string' && isExpiredAt(expiresAt)) {
    return json({ error: 'expiresAt 已经过期，请传入未来时间' }, 400);
  }

  const inputFiles = Array.isArray(body?.files) ? body.files : [];
  if (!inputFiles.length) return json({ error: '站点清单不能为空' }, 400);
  if (inputFiles.length > SITE_MAX_FILES) {
    return json({ error: `站点文件数过多，当前阶段最多支持 ${SITE_MAX_FILES} 个文件` }, 400);
  }

  let totalSize = 0;
  const stagedFiles = [];
  const rawPaths = [];
  for (const item of inputFiles) {
    const relativePath = normalizeRelativePath(item?.path);
    if (typeof relativePath !== 'string') {
      return json({ error: `存在非法路径：${String(item?.path || '')}` }, 400);
    }
    const size = Number(item?.size || 0);
    if (!Number.isFinite(size) || size < 1) {
      return json({ error: `文件大小无效：${relativePath}` }, 400);
    }
    if (size > MAX_SIZE) {
      return json({ error: `文件过大：${relativePath}，单文件最大支持 ${(MAX_SIZE / 1024 / 1024).toFixed(0)}MB` }, 400);
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
    return json({ error: `站点总大小过大，当前阶段最大支持 ${(SITE_MAX_TOTAL_SIZE / 1024 / 1024).toFixed(0)}MB` }, 400);
  }

  const canonical = stripCommonTopLevelDir(rawPaths);
  const manifest = stagedFiles.map((item, index) => ({
    ...item,
    relativePath: canonical.paths[index] || item.relativePath
  }));
  const seenPaths = new Set();
  for (const item of manifest) {
    if (seenPaths.has(item.relativePath)) {
      return json({ error: `目录中存在重复路径：${item.relativePath}` }, 400);
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
    return json({ error: `入口文件不存在：${entryPath}` }, 400);
  }

  const requestedSiteId = String(body?.siteId || '').trim();
  const siteUpdateToken = String(body?.siteUpdateToken || '').trim();
  const updateTarget = requestedSiteId ? await getSiteById(requestedSiteId, env) : null;
  if (requestedSiteId && !/^st_[a-z0-9]+$/i.test(requestedSiteId)) {
    return json({ error: '无效的站点 ID' }, 400);
  }
  if (requestedSiteId && !updateTarget) {
    return json({ error: '要更新的站点不存在' }, 404);
  }
  const updateTokenPayload = updateTarget && siteUpdateToken
    ? await readSiteUpdateToken(siteUpdateToken, env)
    : null;
  const canManageViaToken = updateTarget && isValidSiteUpdateTokenPayload(updateTokenPayload, updateTarget.id);
  if (updateTarget && !canManageSite(updateTarget, { session, apiKey }) && !canManageViaToken) {
    return json({ error: '没有更新该站点的权限，请使用所属账户登录或提供对应 API Key' }, 403);
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
  const effectiveExpiresAt = typeof expiresAt === 'string'
    ? expiresAt
    : (updateTarget?.expiresAt || null);
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
    return json({ error: `请求体必须是 JSON: ${error.message}` }, 400);
  }

  const rawApiKey = getRequestApiKey(request, body);
  let apiKey = null;
  if (rawApiKey) {
    apiKey = await getApiKeyByRaw(rawApiKey, env);
    if (!apiKey) return json({ error: 'API Key 无效' }, 401);
    const quota = await consumeApiKeyPrepare(apiKey, env);
    if (!quota.ok) return json({ error: quota.error }, quota.status);
  } else {
    const ip = getClientIp(request);
    const prepareLimit = takeRateLimit(prepareRateBuckets, `prepare:${ip}`, PREPARE_RATE_LIMIT, PREPARE_RATE_WINDOW_MS);
    if (!prepareLimit.success) {
      return json({ error: `上载准备请求过多，请 ${(prepareLimit.resetInMs / 1000).toFixed(0)} 秒后再试` }, 429);
    }
  }

  const filename = sanitizeFilename(body?.filename);
  const size = Number(body?.size || 0);
  const preferredPartSize = Number(body?.preferredPartSize || 0);
  const maxDownloads = normalizeMaxDownloads(body?.maxDownloads);
  const expiresAt = normalizeExpiresAt(body?.expiresAt);
  if (Number.isNaN(maxDownloads)) {
    return json({ error: 'maxDownloads 必须是大于 0 的整数' }, 400);
  }
  if (Number.isNaN(expiresAt)) {
    return json({ error: 'expiresAt 必须是有效的 ISO 8601 时间字符串' }, 400);
  }
  if (typeof expiresAt === 'string' && isExpiredAt(expiresAt)) {
    return json({ error: 'expiresAt 已经过期，请传入未来时间' }, 400);
  }
  let actualPartSize = PART_SIZE;
  if (preferredPartSize >= 5 * 1024 * 1024 && preferredPartSize <= 100 * 1024 * 1024) {
    actualPartSize = preferredPartSize;
  }
  
  const detectedType = contentTypeFromName(filename, body?.contentType);
  if (!size || size < 1) return json({ error: '文件为空' }, 400);
  if (size > MAX_SIZE) return json({ error: `文件过大，最大支持 ${(MAX_SIZE / 1024 / 1024).toFixed(0)}MB` }, 400);

  const id = generateId();
  const publishOrigin = await resolvePublishOrigin(request, env);
  const publishLinks = buildPublishedLinks(publishOrigin, id);
  const baseSession = {
    id,
    apiKeyId: apiKey?.id || null,
    userId: apiKey?.userId || null,
    name: filename,
    size,
    contentType: detectedType,
    createdAt: new Date().toISOString(),
    maxDownloads,
    expiresAt: typeof expiresAt === 'string' ? expiresAt : null
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
    expiresAt: typeof expiresAt === 'string' ? expiresAt : null,
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
          contentType: detectedType
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
      return json({ error: error.message || '创建分片上载失败' }, 500);
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
    return json({ error: error.message || '生成预签名上载链接失败' }, 500);
  }
}

async function handleUploadComplete(request, env) {
  let body;
  try {
    body = await request.json();
  } catch (error) {
    return json({ error: `请求体必须是 JSON: ${error.message}` }, 400);
  }
  const id = String(body?.id || '').trim();
  if (!/^[a-z0-9]+$/i.test(id)) return json({ error: '无效的文件 ID' }, 400);
  const session = await readUploadSession(id, env);
  if (!session) return json({ error: '上载会话不存在或已过期，请重新调用 prepare' }, 404);
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
      return json({ error: error.message || '完成分片上载失败' }, 500);
    }
  }

  const head = await env.FILES.head(id);
  if (!head) return json({ error: '文件尚未上载到 R2，无法完成确认' }, 404);
  if (expectedSize > 0 && head.size !== expectedSize) {
    return json({ error: `文件大小不匹配，期望 ${expectedSize} 字节，实际 ${head.size} 字节` }, 409);
  }
  const objectEtagCheck = validateReportedObjectETag(reportedObjectEtag, head.httpEtag || head.etag || '');
  if (!objectEtagCheck.ok) {
    return json({ success: false, error: objectEtagCheck.error }, objectEtagCheck.status);
  }
  objectEtagValidated = Boolean(objectEtagCheck.validated);

  const meta = await writeFileMeta(id, filename, declaredType, env, {
    maxDownloads: session.maxDownloads,
    expiresAt: session.expiresAt
  });
  if (session?.apiKeyId) {
    await incrementApiKeyUploadCount(session.apiKeyId, env);
  }
  const publishOrigin = await resolvePublishOrigin(request, env);
  const publishLinks = buildPublishedLinks(publishOrigin, id);
  await recordPublishedFile(id, meta, publishLinks, session, env);
  try {
    await sendUploadNotification(meta, request, env, publishLinks);
  } catch (error) {
    console.error(error.message || error);
  }
  if (session) {
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
      validated: partEtagValidated || objectEtagValidated,
      objectEtagValidated,
      partEtagValidated
    },
    expiresAt: meta?.expiresAt ?? null,
    maxDownloads: meta?.maxDownloads ?? null,
    downloadCount: meta?.downloadCount ?? 0,
    remainingDownloads: meta?.remainingDownloads ?? null
  });
}

async function handleUploadStatus(request, id, env) {
  const session = await readUploadSession(id, env);
  if (!session) {
    const head = await env.FILES.head(id);
    if (head) {
      return json({ id, status: 'done', bytesReceived: head.size });
    }
    return json({ error: '未找到该上载任务' }, 404);
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
    return json({ error: `请求体必须是 JSON: ${error.message}` }, 400);
  }

  const siteId = String(body?.siteId || '').trim();
  if (!/^st_[a-z0-9]+$/i.test(siteId)) return json({ error: '无效的站点 ID' }, 400);
  const siteToken = String(body?.siteToken || '').trim();
  if (!siteToken) return json({ error: '缺少站点完成令牌' }, 400);

  const session = await readSiteSession(siteId, env);
  if (!session) return json({ error: '站点上载会话不存在或已过期，请重新准备' }, 404);
  if (siteToken !== session.siteToken) return json({ error: '站点完成令牌无效' }, 403);

  const inputFiles = Array.isArray(body?.files) ? body.files : [];
  if (!inputFiles.length) return json({ error: '站点文件清单不能为空' }, 400);
  if (inputFiles.length !== Number(session.fileCount || 0)) {
    return json({ error: '站点文件数量与 prepare 阶段不一致' }, 409);
  }

  const canonical = stripCommonTopLevelDir(inputFiles.map((item) => item?.relativePath));
  const expected = new Map((session.manifest || []).map((item) => [item.relativePath, item]));
  const mappedFiles = [];
  for (let index = 0; index < inputFiles.length; index += 1) {
    const item = inputFiles[index];
    const relativePath = canonical.paths[index] || normalizeRelativePath(item?.relativePath);
    const fileId = String(item?.fileId || '').trim();
    if (typeof relativePath !== 'string') {
      return json({ error: '存在非法 relativePath' }, 400);
    }
    if (!/^[a-z0-9]+$/i.test(fileId)) {
      return json({ error: `存在非法文件 ID：${fileId}` }, 400);
    }
    const expectedItem = expected.get(relativePath);
    if (!expectedItem) {
      return json({ error: `文件不在 prepare 清单中：${relativePath}` }, 409);
    }
    const meta = await readFileMeta(fileId, env);
    if (!meta) {
      return json({ error: `文件尚未完成上传：${relativePath}` }, 409);
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
      error: '仍有文件未完成站点发布',
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
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>站点不存在 - OkFile</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#0a0a0a;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh}.wrap{text-align:center;padding:24px;max-width:640px}.icon{font-size:64px;margin-bottom:20px}h1{font-size:24px;font-weight:600;margin-bottom:12px;color:#ef4444}p{color:#9ca3af;font-size:14px;line-height:1.8;margin-bottom:16px}a{color:#60a5fa;text-decoration:none;border:1px solid #333;padding:8px 20px;border-radius:8px;display:inline-block}a:hover{border-color:#60a5fa}</style></head>
<body><div class="wrap"><div class="icon">📂</div><h1>站点文件不存在</h1><p>未找到站点 <code>${escapeHtml(siteId)}</code>${suffix}。</p><a href="/">返回 OkFile 首页</a></div></body></html>`;
}

function expiredSiteHTML(site) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>站点已过期 - OkFile</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#0a0a0a;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh}.wrap{text-align:center;padding:24px;max-width:640px}.icon{font-size:64px;margin-bottom:20px}h1{font-size:24px;font-weight:600;margin-bottom:12px;color:#f59e0b}p{color:#9ca3af;font-size:14px;line-height:1.8;margin-bottom:16px}a{color:#60a5fa;text-decoration:none;border:1px solid #333;padding:8px 20px;border-radius:8px;display:inline-block}a:hover{border-color:#60a5fa}</style></head>
<body><div class="wrap"><div class="icon">⏳</div><h1>站点已过期</h1><p>站点 <code>${escapeHtml(site?.name || site?.id || 'unknown')}</code> 已超过可访问期限。</p>${site?.expiresAt ? `<p>过期时间：<code>${escapeHtml(site.expiresAt)}</code></p>` : ''}<a href="/">返回 OkFile 首页</a></div></body></html>`;
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
    if (url.hostname === 'ok26.org' || url.hostname === 'www.ok26.org') {
      url.protocol = 'https:';
      url.hostname = 'www.okfile.com';
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
      return redirect(localizedHomePath('zh'));
    }
    if (request.method === 'GET' && url.pathname === '/upload.html') {
      return redirect(localizedUploadPath('zh'));
    }
    if (request.method === 'GET' && url.pathname === '/account') {
      return redirect(localizedAccountPath('zh'));
    }
    if (request.method === 'GET' && (url.pathname === '/zh' || url.pathname === '/zh/')) {
      return renderLocalizedStaticPage(request, env, '/', 'zh', 'home');
    }
    if (request.method === 'GET' && (url.pathname === '/en' || url.pathname === '/en/')) {
      return renderLocalizedStaticPage(request, env, '/', 'en', 'home');
    }
    if (request.method === 'GET' && (url.pathname === '/zh/upload' || url.pathname === '/zh/upload/')) {
      return renderLocalizedStaticPage(request, env, '/upload', 'zh', 'upload');
    }
    if (request.method === 'GET' && (url.pathname === '/en/upload' || url.pathname === '/en/upload/')) {
      return renderLocalizedStaticPage(request, env, '/upload', 'en', 'upload');
    }
    if (request.method === 'GET' && (url.pathname === '/zh/account' || url.pathname === '/zh/account/')) {
      return htmlResponse(accountPage('zh'), 200, { 'X-Robots-Tag': 'noindex, follow' });
    }
    if (request.method === 'GET' && (url.pathname === '/en/account' || url.pathname === '/en/account/')) {
      return htmlResponse(accountPage('en'), 200, { 'X-Robots-Tag': 'noindex, follow' });
    }
    if (url.pathname === '/admin') return redirect(`${ADMIN_PANEL_ORIGIN}/`);
    if (url.pathname === '/auth/verify' && request.method === 'GET') return handleVerify(request, env);

    if (url.pathname === '/api/auth/request-link' && request.method === 'POST') return handleAuthRequestLink(request, env);
    if (url.pathname === '/api/auth/logout' && request.method === 'POST') return handleLogout(request, env);
    if (url.pathname === '/api/account/me' && request.method === 'GET') return handleAccountMe(request, env);
    if (url.pathname === '/api/account/api-keys' && request.method === 'POST') return handleCreateApiKey(request, env);
    if (url.pathname === '/api/admin/api-keys' && request.method === 'GET') return handleAdminApiKeys(request, env);
    if (url.pathname === '/api/admin/cleanup-expired' && request.method === 'POST') return handleAdminCleanupExpired(request, env);

    const adminKeyMatch = url.pathname.match(/^\/api\/admin\/api-keys\/([^/]+)$/);
    if (adminKeyMatch && request.method === 'POST') {
      return handleAdminUpdateApiKey(request, adminKeyMatch[1], env);
    }

    if (url.pathname === '/api/upload/config' && request.method === 'GET') return handleUploadConfig(env);
    if (url.pathname === '/api/site/prepare' && request.method === 'POST') return handleSitePrepare(request, env);
    if (url.pathname === '/api/site/complete' && request.method === 'POST') return handleSiteComplete(request, env);
    if (url.pathname === '/api/upload/prepare' && request.method === 'POST') return handleUploadPrepare(request, env);
    if (url.pathname === '/api/upload/complete' && request.method === 'POST') return handleUploadComplete(request, env);
    
    const statusMatch = url.pathname.match(/^\/api\/upload\/status\/([a-zA-Z0-9]+)$/);
    if (statusMatch && request.method === 'GET') {
      return handleUploadStatus(request, statusMatch[1], env);
    }

    const downloadMatch = url.pathname.match(/^\/d\/([a-zA-Z0-9]+)$/);
    if (downloadMatch && request.method === 'GET') {
      return controlledDownload(downloadMatch[1], request, env);
    }

    const viewMatch = url.pathname.match(/^\/i\/([a-zA-Z0-9]+)$/);
    if (viewMatch) {
      const id = viewMatch[1];
      if (url.searchParams.get('play') === '1') return viewerPage(id, env);
      return rawFile(id, request, env);
    }

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
