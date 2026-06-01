﻿﻿﻿---
name: okfile
description: Upload and publish images, videos, PDFs, and common files to OkFile. Use when an agent needs direct links, preview URLs, anonymous upload, or API-key-based publishing.
version: 1.0.0
license: Apache-2.0
---
# OkFile Skill
## Overview
OkFile is an agent-first file upload and publish service.
Use this skill when an agent needs to:
- upload images, videos, PDFs, or common files
- return a direct file URL via `url`
- return a preview or playback URL via `playUrl`
- publish files anonymously or with a user API key
- handle large files with multipart upload and retry missing parts only
## When To Use
Choose this skill when the user asks to:
- upload or publish a file
- generate a public file link
- generate an image, video, or PDF preview link
- batch-process multiple files
- upload large files with resumable multipart flow
## Quick Start
### Minimal Flow
1. `POST /api/upload/prepare`
2. `PUT uploadUrl` or each `parts[].uploadUrl`
3. `POST /api/upload/complete`
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
## Output Strategy
Prefer returning:
- `url` for direct consumption, download, embedding, or API use
- `playUrl` for image preview, video playback, or PDF viewing
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
## Useful URLs
- home: `https://www.okfile.com/en/`
- upload page: `https://www.okfile.com/en/upload/`
- account: `https://www.okfile.com/account`
- admin: `https://www.okfile.com/admin`
