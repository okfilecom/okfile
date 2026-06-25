---
name: okfile
description: Upload and publish images, videos, PDFs, and common files to OkFile, or publish a static site folder to a per-site subdomain with directory listing fallback when root index.html is absent.
version: 1.0.3
last_updated: 2026-06-06
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
github: okfilecom
license: apache-2.0
---
# OkFile Skill
Official site: `https://www.okfile.com/`

## What It Does
OkFile lets an agent upload and publish images, videos, PDFs, and common files, or publish a static site folder and return a direct file URL, preview URL, or published site URL.
## When To Use
Use this skill when the user asks to:
- upload or publish a file
- generate a public file link
- generate a preview or playback URL
- publish a folder as a static website
- publish a folder that may not contain root `index.html`
- handle large files with multipart upload
- retry only missing parts after a failed multipart completion
## Quick Start
### File Flow
1. `POST /api/upload/prepare`
2. `PUT uploadUrl` or each `parts[].uploadUrl`
3. `POST /api/upload/complete`
4. optionally `GET /api/upload/status/{id}`
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
- nested subdirectories stay available after publishing, such as `/docs/getting-started.md`
## Minimal Example
```bash
curl -X POST "https://www.okfile.com/api/upload/prepare" \
  -H "Content-Type: application/json" \
  --data '{"filename":"photo.jpg","size":12345,"contentType":"image/jpeg","preferredPartSize":5242880}'
curl -X POST "https://www.okfile.com/api/upload/complete" \
  -H "Content-Type: application/json" \
  --data '{"id":"a3k7m92x"}'
```
```bash
curl -X POST "https://www.okfile.com/api/site/prepare" \
  -H "Content-Type: application/json" \
  --data '{"siteName":"docs-site","files":[{"path":"docs/getting-started.md","size":1200,"contentType":"text/markdown; charset=utf-8"},{"path":"assets/app.css","size":3200,"contentType":"text/css; charset=utf-8"},{"path":"images/logo.png","size":4200,"contentType":"image/png"}]}'
curl -X POST "https://www.okfile.com/api/site/complete" \
  -H "Content-Type: application/json" \
  --data '{"siteId":"st_xxxx","siteToken":"token_xxxx","files":[{"relativePath":"docs/getting-started.md","fileId":"a3k7m92x"},{"relativePath":"assets/app.css","fileId":"b8f2k19a"},{"relativePath":"images/logo.png","fileId":"c9d0e1f2"}]}'
```
## Important Notes
- send API keys in the `X-API-Key` header for authenticated `prepare` calls
- `complete` only needs `id`
- `expiresIn` only describes the signed `uploadUrl` or `parts[].uploadUrl` lifetime, not a separate Worker-side upload-session TTL
- keep the exact `id` from the matching `prepare` response until `complete` finishes
- for site publishing, keep the exact `siteId` and `siteToken` from the matching `site/prepare` response and pass them to the matching `site/complete`
- if `complete` returns `missingParts`, re-upload only those parts
- return `url` for direct use and `playUrl` for preview use
- return `siteUrl` for the published site root and `entryUrl` for the preferred HTML entry
- use site-relative paths like `assets/app.css`, not local absolute paths
- do not generate a synthetic `index.html` just to list files; if the real folder has no root `index.html`, let OkFile render the listing automatically
- preserve nested subdirectories exactly as uploaded
- max file size is `1GB`
## Useful URLs
- home: `https://www.okfile.com/en/`
- upload page: `https://www.okfile.com/en/upload/`
- account: `https://www.okfile.com/account`
