---
name: okfile
description: Upload and publish images, videos, PDFs, and common files to OkFile when an agent needs direct links, preview URLs, anonymous upload, API-key-based publishing, or multipart retry with missing-part recovery.
version: 1.0.0
license: Apache-2.0
category: development
author: OkFile
homepage: https://www.okfile.com/en/
---
# OkFile Skill
## Overview
OkFile is an agent-first file upload and publish skill.
Use it when an agent needs to:
- upload images, videos, PDFs, or common files
- return a direct link via `url`
- return a preview or playback link via `playUrl`
- publish anonymously or with an API key
- handle multipart uploads and retry only missing parts
## When To Trigger
Trigger this skill when the user asks to:
- upload a file
- publish a file and return a public link
- generate a preview URL for an image, video, or PDF
- upload a large file with multipart support
- retry incomplete multipart uploads
## Minimal Flow
1. `POST /api/upload/prepare`
2. `PUT uploadUrl` or each `parts[].uploadUrl`
3. `POST /api/upload/complete`
4. optionally `GET /api/upload/status/{id}`
## Minimal Example
```bash
curl -X POST "https://www.okfile.com/api/upload/prepare" \
  -H "Content-Type: application/json" \
  --data '{"filename":"photo.jpg","size":12345,"contentType":"image/jpeg","preferredPartSize":5242880}'
curl -X POST "https://www.okfile.com/api/upload/complete" \
  -H "Content-Type: application/json" \
  --data '{"id":"a3k7m92x"}'
```
## Core Rules
- send `apiKey` only to `prepare`
- send only `id` to `complete`
- if `complete` returns `missingParts`, re-upload only those parts
- prefer `url` for direct consumption
- include `playUrl` when preview matters
## Endpoints
- `POST /api/upload/prepare`
- `PUT uploadUrl` or `parts[].uploadUrl`
- `POST /api/upload/complete`
- `GET /api/upload/status/{id}`
- `GET /i/{id}`
- `GET /i/{id}?play=1`
## Limits
- max file size: `500MB`
- multipart starts automatically above the backend threshold
- anonymous mode is IP rate-limited
- API key mode is controlled by backend quotas
## Useful URLs
- home: `https://www.okfile.com/en/`
- upload page: `https://www.okfile.com/en/upload/`
- account: `https://www.okfile.com/account`
- admin: `https://www.okfile.com/admin`
