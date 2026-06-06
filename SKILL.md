---
name: okfile
description: Upload and publish images, videos, PDFs, and common files to OkFile, or publish a static site folder to a per-site subdomain with directory listing fallback when root index.html is absent.
version: 1.0.3
license: Apache-2.0
---
# OkFile Skill
Official site: `https://www.okfile.com/`

## Overview
OkFile is an agent-first file upload and publish service.
Use this skill when an agent needs to:
- upload images, videos, PDFs, or common files
- upload a static site folder and publish it to a per-site subdomain
- rely on automatic shared top-level directory stripping for folder-based site uploads
- expose a directory listing when a site has no root `index.html`
- return a direct file URL via `url`
- return a preview or playback URL via `playUrl`
- return a published site URL via `siteUrl` or `entryUrl`
- publish files anonymously or with a user API key
- handle large files with multipart upload and retry missing parts only
## When To Use
Choose this skill when the user asks to:
- upload or publish a file
- generate a public file link
- generate an image, video, or PDF preview link
- publish a folder as a static website
- publish a folder that may not contain root `index.html`
- batch-process multiple files
- upload large files with resumable multipart flow
## Quick Start
### Minimal Flow
1. `POST /api/upload/prepare`
2. `PUT uploadUrl` or each `parts[].uploadUrl`
3. `POST /api/upload/complete`
### Static Site Flow
1. `POST /api/site/prepare`
2. upload each file through the normal file upload flow
3. `POST /api/site/complete`

Static site behavior:
- if every uploaded path is under one shared top-level folder, OkFile strips that folder and treats its contents as the site root
- if root `index.html` exists, the site root renders that page
- if root `index.html` does not exist, the site root renders a directory listing with file name, size, and upload time
- images and videos open inline from that listing
- other files should use download links
### Minimal Prepare Request
```bash
curl -X POST "https://www.okfile.com/api/upload/prepare" \
  -H "Content-Type: application/json" \
  --data '{"filename":"photo.jpg","size":12345,"contentType":"image/jpeg","preferredPartSize":5242880}'
```
### Minimal Complete Request
```bash
curl -X POST "https://www.okfile.com/api/upload/complete" \
  -H "Content-Type: application/json" \
  --data '{"id":"a3k7m92x"}'
```
### Status Check
```bash
curl "https://www.okfile.com/api/upload/status/a3k7m92x"
```
### Key Rules
- `apiKey` is optional and is only sent to `prepare`
- `complete` only needs `id`
- if `complete` returns `missingParts`, re-upload only those parts
- prefer returning `url`; return `playUrl` when preview matters
## Authentication Modes
### Anonymous
Use anonymous mode for direct publishing without login.
- no account required
- rate-limited by IP
- good for lightweight or temporary tasks
### API Key
Use API key mode for controlled, long-term, or team-managed usage.
Flow:
1. `POST /api/auth/request-link`
2. open the email verification link
3. create an API key in `/account`
4. include `apiKey` in `POST /api/upload/prepare`
## Endpoints
### `POST /api/upload/prepare`
Request body:
```json
{
  "filename": "photo.jpg",
  "size": 12345,
  "contentType": "image/jpeg",
  "preferredPartSize": 5242880,
  "apiKey": "okf_..."
}
```
Notes:
- `preferredPartSize` is optional
- current supported range is `5MB` to `100MB`
- response may be `single` or `multipart`
Single upload response example:
```json
{
  "success": true,
  "id": "a3k7m92x",
  "mode": "single",
  "uploadUrl": "https://upload.example.com/...",
  "expiresIn": 3600,
  "method": "PUT",
  "url": "https://www.okfile.com/i/a3k7m92x",
  "playUrl": "https://www.okfile.com/i/a3k7m92x?play=1",
  "type": "image"
}
```
Multipart response example:
```json
{
  "success": true,
  "id": "a3k7m92x",
  "mode": "multipart",
  "uploadId": "3c4d...",
  "partSize": 5242880,
  "totalParts": 33,
  "parts": [
    { "partNumber": 1, "uploadUrl": "https://..." }
  ],
  "url": "https://www.okfile.com/i/a3k7m92x",
  "playUrl": "https://www.okfile.com/i/a3k7m92x?play=1",
  "type": "video"
}
```
### `PUT uploadUrl` or `parts[].uploadUrl`
- upload the file body directly to the signed URL
- single mode usually needs one `PUT`
- multipart mode needs one `PUT` per part
- set `Content-Length` explicitly
### `POST /api/upload/complete`
Request body:
```json
{
  "id": "a3k7m92x"
}
```
Success response example:
```json
{
  "success": true,
  "id": "a3k7m92x",
  "url": "https://www.okfile.com/i/a3k7m92x",
  "playUrl": "https://www.okfile.com/i/a3k7m92x?play=1",
  "type": "image"
}
```
Incomplete multipart response example:
```json
{
  "success": false,
  "error": "Missing parts",
  "uploadedParts": 45,
  "totalParts": 50,
  "missingParts": [4, 12, 28, 44, 49]
}
```
### `GET /api/upload/status/{id}`
Response example:
```json
{
  "id": "a3k7m92x",
  "status": "uploading",
  "progress": "45/50",
  "uploadedParts": 45,
  "totalParts": 50,
  "bytesReceived": 471859200
}
```
### `POST /api/site/prepare`
Request body:
```json
{
  "siteName": "docs-site",
  "files": [
    { "path": "docs/getting-started.md", "size": 1200, "contentType": "text/markdown; charset=utf-8" },
    { "path": "assets/app.css", "size": 3200, "contentType": "text/css; charset=utf-8" },
    { "path": "images/logo.png", "size": 4200, "contentType": "image/png" }
  ]
}
```
Notes:
- omit `entryPath` entirely when the uploaded folder has no root `index.html`
- do not generate or upload a synthetic `index.html` just to mimic a directory listing
- when root `index.html` is absent, OkFile generates the directory listing automatically
- use site-relative paths such as `assets/app.css`, not local absolute paths
- nested subdirectories are supported, for example `docs/getting-started.md` or `images/icons/logo.svg`
Success response example:
```json
{
  "success": true,
  "siteId": "st_ab12cd34",
  "siteToken": "token",
  "siteHostname": "st-ab12cd34.ok26.org",
  "siteUrl": "https://st-ab12cd34.ok26.org/",
  "entryUrl": "https://st-ab12cd34.ok26.org/",
  "uploadStrategy": "reuse-file-upload-api"
}
```
### `POST /api/site/complete`
Request body:
```json
{
  "siteId": "st_ab12cd34",
  "siteToken": "token",
  "files": [
    { "relativePath": "docs/getting-started.md", "fileId": "f1a2b3c4" },
    { "relativePath": "assets/app.css", "fileId": "d4e5f6g7" },
    { "relativePath": "images/logo.png", "fileId": "h7i8j9k0" }
  ]
}
```
Success response example:
```json
{
  "success": true,
  "siteId": "st_ab12cd34",
  "siteHostname": "st-ab12cd34.ok26.org",
  "siteUrl": "https://st-ab12cd34.ok26.org/",
  "entryUrl": "https://st-ab12cd34.ok26.org/",
  "entryPath": "index.html"
}
```
## Output Strategy
Prefer returning:
- `url` for direct consumption, download, embedding, or API use
- `playUrl` for image preview, video playback, or PDF viewing
- `siteUrl` for the root of a published static site
- `entryUrl` for the preferred HTML entry page, or the same value as `siteUrl` when the site uses directory listing
For video or PDF, returning both is usually best.
## Supported Types
- images: `JPG`, `JPEG`, `PNG`, `GIF`, `WebP`, `BMP`, `SVG`
- videos: `MP4`, `WebM`, `MOV`, `AVI`, `MKV`
- documents: `PDF`
- other common files are handled as generic files
## Limits
- max file size: `500MB`
- files above threshold automatically use multipart upload
- anonymous mode is IP rate-limited
- API key mode is controlled by backend quotas
- parallel uploads are supported, but concurrency should be controlled by the client
## Best Practices
- always follow `prepare -> PUT -> complete`
- set a normal `User-Agent` on `prepare` and `complete`
- set `Content-Length` on each `PUT`
- check every part upload for `2xx` status
- retry only `missingParts`, not the whole file
- prefer stable HTTP clients for large files and multipart flows
- include `index.html` at the site root when you want the subdomain homepage to render a page immediately
- if a site is intentionally file-browsing-only, leave root `index.html` out and use the generated listing page
- do not ask the agent to create a synthetic listing `index.html`; upload the real folder tree and let OkFile render the listing automatically
- preserve nested subdirectories exactly as uploaded; published sites support paths like `/docs/guide/` and `/assets/app.css`
## Useful URLs
- home: `https://www.okfile.com/en/`
- upload page: `https://www.okfile.com/en/upload/`
- account: `https://www.okfile.com/account`
- admin: `https://www.okfile.com/admin`
