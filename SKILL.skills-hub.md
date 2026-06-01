---
name: okfile
description: Upload and publish images, videos, PDFs, and common files to OkFile. Invoke when an agent needs direct file links, preview URLs, anonymous upload, API-key-based publishing, or missing-part recovery for multipart uploads.
license: Apache-2.0
compatibility: Designed for Claude Code and Codex CLI. Requires internet access and HTTP requests. Works on Windows, macOS, and Linux.
allowed-tools: Bash Read Edit Write
metadata:
  author: OkFile
  version: "1.0.0"
tags:
  - upload
  - file-publishing
  - api
  - multipart
  - media
complexity: beginner
platforms:
  - windows
  - macos
  - linux
---
# OkFile Skill
Use this skill to upload and publish files through OkFile.
## Invoke This Skill When
- the user asks to upload or publish a file
- the user needs a direct public file link
- the user needs a preview or playback URL for an image, video, or PDF
- the user wants multipart upload for a large file
- multipart completion fails and missing parts need targeted retry
## Follow This Workflow
1. Call `POST /api/upload/prepare` with `filename`, `size`, `contentType`, and optional `preferredPartSize` and `apiKey`.
2. Upload the file body with `PUT` to `uploadUrl`, or upload each chunk to `parts[].uploadUrl`.
3. Call `POST /api/upload/complete` with only `id`.
4. If needed, call `GET /api/upload/status/{id}` to inspect progress.
5. If completion returns `missingParts`, re-upload only those part numbers and retry `complete`.
## Apply These Rules
- Send `apiKey` only in `prepare`.
- Send only `id` in `complete`.
- Prefer `url` for direct consumption.
- Include `playUrl` when preview matters.
- Set `Content-Length` on each `PUT`.
- Check every upload response for `2xx` status.
## Minimal Requests
```bash
curl -X POST "https://www.okfile.com/api/upload/prepare" \
  -H "Content-Type: application/json" \
  --data '{"filename":"photo.jpg","size":12345,"contentType":"image/jpeg","preferredPartSize":5242880}'
curl -X POST "https://www.okfile.com/api/upload/complete" \
  -H "Content-Type: application/json" \
  --data '{"id":"a3k7m92x"}'
```
## Tell The User About These Limits
- max file size: `500MB`
- anonymous mode is IP rate-limited
- API key mode is controlled by backend quotas
- multipart retry should target only `missingParts`
## Use These URLs
- home: `https://www.okfile.com/en/`
- upload page: `https://www.okfile.com/en/upload/`
- account: `https://www.okfile.com/account`
- admin: `https://www.okfile.com/admin`
