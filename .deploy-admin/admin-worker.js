const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const EXPIRED_CLEANUP_BATCH_LIMIT = 200;
const PUBLIC_SITE_EXAMPLE_ORIGIN = 'https://okfile.com';
const PUBLISH_DOMAIN_SETTING_KEY = 'publish_origin';
const META_PREFIX = '__meta__/';
const SESSION_COOKIE = 'okfile_session';

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

async function readJsonObject(key, env) {
  const object = await env.FILES.get(key);
  if (!object) return null;
  try {
    return JSON.parse(await object.text());
  } catch {
    return null;
  }
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

function parseMetaIdFromKey(key) {
  const escapedPrefix = META_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`^${escapedPrefix}([a-zA-Z0-9]+)\\.json$`).exec(String(key || ''));
  return match ? match[1] : null;
}

async function deleteFileAndMeta(id, env) {
  await env.FILES.delete(id);
  await env.FILES.delete(metaKey(id));
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
.msg{margin-top:14px;font-size:14px;color:#86efac}
.err{margin-top:14px;font-size:14px;color:#f87171}
.note{margin-top:12px;padding:12px;border-radius:10px;background:#17255422;border:1px solid #1d4ed855;color:#bfdbfe;font-size:13px}
.mono{font-family:Consolas,'SF Mono',monospace;word-break:break-all}
table{width:100%;border-collapse:collapse;margin-top:14px}
th,td{border-bottom:1px solid #222;padding:10px 8px;text-align:left;font-size:13px;vertical-align:top}
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
      <p class="muted">这里可以查看注册用户、调整 API Key 限制，并手动清理过期文件。</p>
      <div class="note">当前登录邮箱：<span id="currentUser" class="mono"></span></div>
      <div class="msg hidden" id="adminMsg"></div>
      <div class="err hidden" id="adminErr"></div>
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
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:16px 0 18px">
        <label class="muted" for="cleanupLimit">本次检查数量</label>
        <input id="cleanupLimit" type="number" min="1" max="1000" value="${EXPIRED_CLEANUP_BATCH_LIMIT}" style="width:120px">
        <button class="btn-primary" id="cleanupBtn">立即清理过期文件</button>
        <span class="muted" id="cleanupResult">尚未执行清理</span>
      </div>
      <div id="adminTableWrap" class="muted">正在加载...</div>
    </div>`,
    `const $=(id)=>document.getElementById(id);
const authCard=$('authCard');
const forbiddenCard=$('forbiddenCard');
const dashboardCard=$('dashboardCard');
const logoutBtn=$('logoutBtn');
function effectivePublicOrigin(data){
  return data && data.configuredOrigin ? data.configuredOrigin : '';
}
function syncPublicNav(origin){
  const base = origin || '${PUBLIC_SITE_EXAMPLE_ORIGIN}';
  $('publicHomeLink').href = base + '/';
  $('publicAccountLink').href = base + '/zh/account/';
  $('publicUploadLink').href = base + '/zh/upload/';
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
  syncPublicNav(effectivePublicOrigin(data));
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
    await loadPublishDomain();
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
    syncPublicNav(effectivePublicOrigin(data));
    show($('adminMsg'),'发布域名已保存');
  }catch(error){
    show($('adminErr'),error.message);
  }
};
$('cleanupBtn').onclick = runCleanup;
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
    if (url.pathname === '/api/admin/publish-domain' && request.method === 'GET') return handleAdminGetPublishDomain(request, env);
    if (url.pathname === '/api/admin/publish-domain' && request.method === 'POST') return handleAdminSetPublishDomain(request, env);
    if (url.pathname === '/api/admin/cleanup-expired' && request.method === 'POST') return handleAdminCleanupExpired(request, env);

    const adminKeyMatch = url.pathname.match(/^\/api\/admin\/api-keys\/([^/]+)$/);
    if (adminKeyMatch && request.method === 'POST') {
      return handleAdminUpdateApiKey(request, adminKeyMatch[1], env);
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
