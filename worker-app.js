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
const STATIC_PAGE_CACHE_VERSION = 'v6';
const META_PREFIX = '__meta__/';
const SESSION_PREFIX = '__upload_sessions__/';
const BUCKET_NAME = 'okfile-files';
const SESSION_COOKIE = 'okfile_session';
const BAIDU_VERIFY_PATH = '/baidu_verify_codeva-BoYaYTJN00.html';
const BAIDU_VERIFY_CONTENT = '80b9870da59a4334909987183760b183';

const prepareRateBuckets = new Map();

const EXT_MAP = {
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
        ? 'Manual upload page for OkFile. Upload images, videos, PDFs, and common files up to 500MB. API integration remains the recommended path for Agents.'
        : 'OkFile 人工上载页面，支持图片、视频、PDF 和常见文件，单文件最大 500MB。对 Agent 而言，仍推荐优先使用 API 接入。',
      robots: 'noindex,follow'
    };
  }
  return {
    title: isEn
      ? 'OkFile — Agent-First File Upload and Publish Service'
      : 'OkFile — 面向 Agent 的文件上载与发布服务',
    description: isEn
      ? 'OkFile provides agent-first file upload and publish APIs with anonymous access, API Keys, direct links, preview URLs, and multipart uploads up to 500MB.'
      : 'OkFile 主要为 Agent 提供文件上载与发布能力，支持匿名调用、API Key、直链返回、预览链接，以及最高 500MB 的分片上载。',
    robots: 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1'
  };
}

function buildStructuredData(origin, currentPagePath, lang, pageType) {
  const inLanguage = lang === 'en' ? 'en' : 'zh-CN';
  if (pageType === 'upload') {
    return {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: lang === 'en' ? 'OkFile Manual Upload Page' : 'OkFile 人工上载页',
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
      ? 'Agent-first file upload and publish service with direct links, preview URLs, anonymous access, and API Key support.'
      : '面向 Agent 的文件上载与发布服务，支持直链、预览链接、匿名调用与 API Key。',
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

function buildSessionCookie(token) {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
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
        <a href="/admin" id="adminLink" class="hidden">${copy.adminPanel}</a>
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
      <p class="muted">这里可以查看注册用户、注册时间，以及按 API Key 设置频率限制和总上载次数限制。仅 <code>ADMIN_EMAILS</code> 白名单中的邮箱可访问。</p>
      <div class="msg hidden" id="adminMsg"></div>
      <div class="err hidden" id="adminErr"></div>
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

async function readFileMeta(id, env) {
  const sidecar = await readSidecarMeta(id, env);
  const r2Object = await env.FILES.head(id);
  if (!r2Object) return null;
  const maxDownloads = normalizeMaxDownloads(sidecar?.maxDownloads);
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
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', meta?.contentType || head.httpMetadata?.contentType || object.customMetadata?.contentType || 'application/octet-stream');
  }
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

function normalizeMaxDownloads(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return NaN;
  return parsed;
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
  const meta = {
    id,
    name: filename,
    size: head.size,
    contentType: head.httpMetadata?.contentType || declaredType,
    uploadedAt: new Date().toISOString(),
    etag: head.httpEtag || head.etag || '',
    maxDownloads: Number.isInteger(maxDownloads) && maxDownloads > 0 ? maxDownloads : null,
    downloadCount: 0,
    lastDownloadedAt: ''
  };
  await saveJsonObject(metaKey(id), meta, env);
  return readFileMeta(id, env);
}

async function recordDownloadAndGetMeta(id, env) {
  const currentMeta = await readFileMeta(id, env);
  if (!currentMeta) return { success: false, status: 404 };
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
  return redirect('/account', { 'Set-Cookie': buildSessionCookie(sessionToken) });
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
  return json({ success: true }, 200, { 'Set-Cookie': clearSessionCookie() });
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

async function handleUploadConfig(env) {
  return json({
    success: true,
    maxSize: MAX_SIZE,
    maxSizeMb: Math.round(MAX_SIZE / 1024 / 1024),
    multipartThreshold: MULTIPART_THRESHOLD,
    multipartThresholdMb: Math.round(MULTIPART_THRESHOLD / 1024 / 1024),
    partSize: PART_SIZE,
    partSizeMb: Math.round(PART_SIZE / 1024 / 1024),
    presignedExpires: PRESIGNED_EXPIRES
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
  if (Number.isNaN(maxDownloads)) {
    return json({ error: 'maxDownloads 必须是大于 0 的整数' }, 400);
  }
  let actualPartSize = PART_SIZE;
  if (preferredPartSize >= 5 * 1024 * 1024 && preferredPartSize <= 100 * 1024 * 1024) {
    actualPartSize = preferredPartSize;
  }
  
  const detectedType = contentTypeFromName(filename, body?.contentType);
  if (!size || size < 1) return json({ error: '文件为空' }, 400);
  if (size > MAX_SIZE) return json({ error: `文件过大，最大支持 ${(MAX_SIZE / 1024 / 1024).toFixed(0)}MB` }, 400);

  const id = generateId();
  const origin = new URL(request.url).origin;
  const baseSession = {
    id,
    apiKeyId: apiKey?.id || null,
    userId: apiKey?.userId || null,
    name: filename,
    size,
    contentType: detectedType,
    createdAt: new Date().toISOString(),
    maxDownloads
  };
  const responseBase = {
    success: true,
    id,
    expiresIn: PRESIGNED_EXPIRES,
    url: `${origin}/i/${id}`,
    downloadUrl: `${origin}/d/${id}`,
    playUrl: `${origin}/i/${id}?play=1`,
    type: classifyContent(detectedType),
    maxDownloads,
    limits: buildPrepareLimits(apiKey, actualPartSize, maxDownloads)
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

  const meta = await writeFileMeta(id, filename, declaredType, env, {
    maxDownloads: session.maxDownloads
  });
  if (session?.apiKeyId) {
    await incrementApiKeyUploadCount(session.apiKeyId, env);
  }
  if (session) {
    await deleteUploadSession(id, env);
  }

  return json({
    success: true,
    id,
    url: `${new URL(request.url).origin}/i/${id}`,
    downloadUrl: `${new URL(request.url).origin}/d/${id}`,
    playUrl: `${new URL(request.url).origin}/i/${id}?play=1`,
    type: classifyContent(meta?.contentType || declaredType),
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

async function viewerPage(id, env) {
  const meta = await readFileMeta(id, env);
  if (!meta) return htmlResponse(notFoundHTML(id), 404);
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
  const fromR2 = await serveR2File(id, request, env, meta);
  if (fromR2) return fromR2;
  return htmlResponse(notFoundHTML(id), 404);
}

async function controlledDownload(id, request, env) {
  const result = await recordDownloadAndGetMeta(id, env);
  if (!result.success) {
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
    if (url.pathname === '/admin') return htmlResponse(adminPage());
    if (url.pathname === '/auth/verify' && request.method === 'GET') return handleVerify(request, env);

    if (url.pathname === '/api/auth/request-link' && request.method === 'POST') return handleAuthRequestLink(request, env);
    if (url.pathname === '/api/auth/logout' && request.method === 'POST') return handleLogout(request, env);
    if (url.pathname === '/api/account/me' && request.method === 'GET') return handleAccountMe(request, env);
    if (url.pathname === '/api/account/api-keys' && request.method === 'POST') return handleCreateApiKey(request, env);
    if (url.pathname === '/api/admin/api-keys' && request.method === 'GET') return handleAdminApiKeys(request, env);

    const adminKeyMatch = url.pathname.match(/^\/api\/admin\/api-keys\/([^/]+)$/);
    if (adminKeyMatch && request.method === 'POST') {
      return handleAdminUpdateApiKey(request, adminKeyMatch[1], env);
    }

    if (url.pathname === '/api/upload/config' && request.method === 'GET') return handleUploadConfig(env);
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
  }
};
