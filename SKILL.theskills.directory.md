---
name: okfile
description: Upload and publish images, videos, PDFs, and common files to OkFile when an agent needs direct links, preview URLs, anonymous upload, API-key-based publishing, or multipart retry with missing-part recovery.
version: 1.0.0
last_updated: 2026-05-25
compatible_agents:
  tested:
    - claude
    - codex
  untested:
    - cursor
    - vscode
    - copilot
categories:
  - development
  - documentation
job_roles:
  - developer
author: OkFile
github: YOUR_GITHUB_USERNAME
license: apache-2.0
---
# OkFile Skill
## What It Does
OkFile lets an agent upload and publish images, videos, PDFs, and common files, then return a direct URL or preview URL.
## When To Use
Use this skill when the user asks to:
- upload or publish a file
- generate a public file link
- generate a preview or playback URL
- handle large files with multipart upload
- retry only missing parts after a failed multipart completion
## Quick Start
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
## Important Notes
- `apiKey` is optional and is only sent to `prepare`
- `complete` only needs `id`
- if `complete` returns `missingParts`, re-upload only those parts
- return `url` for direct use and `playUrl` for preview use
- max file size is `500MB`
## Useful URLs
- home: `https://www.okfile.com/en/`
- upload page: `https://www.okfile.com/en/upload/`
- account: `https://www.okfile.com/account`
