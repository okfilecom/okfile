# okfile.com 上载 — Agent 踩坑记录

> 整理自 2026-05-25 实际上载测试（图片 + 221MB 视频），供补充到 SKILL.md 使用

---

## 坑 1：Cloudflare 拦截 Python urllib（403 Forbidden）

**现象**：用 `urllib.request` 调用 prepare/complete 接口，直接返回 HTTP 403

**原因**：okfile.com 前置 Cloudflare WAF，不带 User-Agent 的请求一律拦截

**解法**：必须带标准浏览器 UA 头：

```python
# ❌ 不行
req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})

# ✅ 可以
req = urllib.request.Request(url, data=body, headers={
    "Content-Type": "application/json",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
})
```

**适用范围**：`prepare` 和 `complete` 接口都需要。R2 PUT 地址不受此影响（R2 签名 URL 自带认证）。

---

## 坑 2：Python SSL 握手超时/连接不稳定（大文件）

**现象**：
- 小文件偶尔成功
- 23 片视频上载中前 12 片反复 `_ssl.c:1063 handshake timeout` / `[WinError 10054] 远程主机强迫关闭`
- 重试 3 次后仍然失败

**原因**：Windows 上 Python 3.14 的 `urllib` + `Schannel` SSL 实现，与 Cloudflare R2 的长连接兼容性差

**解法**：改用 **Node.js `https` 模块**执行上载：

```javascript
// Node.js https 更稳定，23片全部一次过
const req = https.request({ hostname: u.hostname, path: u.pathname + u.search, method: 'PUT',
    headers: { 'Content-Type': ct } }, callback);
```

**结论**：
| 场景 | 推荐 |
|------|------|
| 小文件（<10MB） | Python urllib 或 Node.js 都行 |
| 大文件 / 多分片 | **强烈推荐 Node.js https** |
| prepare + complete | 都需要带 User-Agent |

---

## 坑 3：R2 PUT 缺少 Content-Length → HTTP 411

**现象**：单传模式 PUT 返回 `411 Length Required`

**原因**：R2 S3 兼容 API 要求 PUT 请求显式声明 body 长度，不自动从 stream 推断

**解法**：PUT 时必须加 `Content-Length` 头：

```javascript
// ❌ 411 错误
headers: { 'Content-Type': 'image/jpeg' }

// ✅ 正确
headers: { 'Content-Type': 'image/jpeg', 'Content-Length': data.length }
```

**注意**：这个头只对 R2 PUT 有效（prepare/complete 是 POST 到 Worker，不需要）。

---

## 坑 4：分片上载"假成功"—— socket hang up 但未报错

**现象**：
- 第一版脚本：每片 PUT 用 `.on('end')` 回调判断完成
- 前 12 片实际 `socket hang up`（连接断开），但回调仍触发
- 最终 complete 后返回 ID 访问 404（文件不完整）

**原因**：Node.js `response.on('end')` 只表示服务端关闭了响应流，不代表写入成功

**解法**：必须校验 HTTP 状态码，仅 200~299 视为成功：

```javascript
res.on('end', () => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
        resolve({ status: res.statusCode, headers: res.headers });
    } else {
        reject(new Error('PUT returned ' + res.statusCode));
    }
});
```

配合重试机制：

```javascript
async function retryPut(uploadUrl, chunkData) {
    for (let i = 0; i < maxRetries; i++) {
        try { return await putWithStatusCheck(uploadUrl, chunkData); }
        catch(e) {
            console.log(`Retry ${i+1}: ${e.message}`);
            await sleep(3000); // 等 3 秒再试
        }
    }
}
```

---

## 坑 5：complete 是激活链接的必要步骤

**现象**：文件 PUT 到 R2 后，直接访问 `/i/{id}` 返回 404；调用 complete 后才能访问

**原因**：Worker 架构是"先写存储、后激活路由"

```
prepare → Worker 创建临时记录（状态=pending）
   ↓
PUT → 文件写入 R2 存储（Worker 不知道是否成功）
   ↓
complete → Worker 校验 R2 对象存在 → 写入元数据 → 激活 /i/{id}
```

**如果跳过 complete**：
- R2 中可能有孤立对象（占用空间）
- `/i/{id}` 路由不存在 → 404
- 无法获取 url/playUrl

**结论**：三步缺一不可，且顺序不能乱。

---

## 坑 6：Node.js -e 内联脚本路径转义问题（Windows）

**现象**：用 `node -e "..."` 内联代码时，Windows 反斜杠路径被吞掉

```bash
# ❌ 实际变成 C:\WorkBuddy\...UserssunguozhenPictures...
node -e "const fp = 'C:\\Users\\...\\file.jpg'"

# ✅ 写成 .js 文件再执行，或使用 String.raw
node upload.js  # 文件里用 String.raw`C:\path\to\file.jpg`
```

**结论**：涉及 Windows 绝对路径的 Node.js 脚本，写文件比 `-e` 内联更可靠。

---

## 汇总清单（上载前必查）

| # | 检查项 | 影响 |
|---|--------|------|
| 1 | prepare/complete 带 `User-Agent` 头 | 否则 403 |
| 2 | R2 PUT 带 `Content-Length` 头 | 否则 411 |
| 3 | 分片 PUT 校验 HTTP 状态码 200-299 | 否则可能静默失败 |
| 4 | 大文件优先用 Node.js 而非 Python | 避免 SSL 超时 |
| 5 | 必须调用 complete | 否则 404 |
| 6 | Windows 下路径用 String.raw 或 .js 文件 | 避免转义问题 |
