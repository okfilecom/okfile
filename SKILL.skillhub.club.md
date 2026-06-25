---
name: okfile
description: Upload and publish images, videos, PDFs, and common files to OkFile, or publish a static site folder to a per-site subdomain with directory listing fallback when root index.html is absent.
version: 1.0.3
license: Apache-2.0
category: development
author: OkFile
homepage: https://www.okfile.com/
---
# OkFile Skill
Official site: `https://www.okfile.com/`

## Overview
OkFile is an agent-first file upload and publish skill.
Use it when an agent needs to:
- upload images, videos, PDFs, or common files
- upload a static site folder and publish it to a per-site subdomain
- rely on automatic shared top-level directory stripping for folder-based site uploads
- expose a directory listing when a site has no root `index.html`
- return a direct link via `url`
- return a preview or playback link via `playUrl`
- return a published site URL via `siteUrl` or `entryUrl`
- publish anonymously or with an API key
- handle multipart uploads and retry only missing parts
## When To Trigger
Trigger this skill when the user asks to:
- upload a file
- publish a file and return a public link
- generate a preview URL for an image, video, or PDF
- publish a folder as a static website
- publish a folder that may not contain root `index.html`
- upload a large file with multipart support
- retry incomplete multipart uploads
## Minimal Flow
1. `POST /api/upload/prepare`
2. `PUT uploadUrl` or each `parts[].uploadUrl`
3. `POST /api/upload/complete`
4. optionally `GET /api/upload/status/{id}`
## Static Site Flow
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
## Core Rules
- send API keys in the `X-API-Key` header
- send only `id` to `complete`
- `expiresIn` only describes the signed `uploadUrl` or `parts[].uploadUrl` lifetime, not a separate Worker-side upload-session TTL
- keep the exact `id` from the matching `prepare` response until `complete` finishes
- for site publishing, keep the exact `siteId` and `siteToken` from the matching `site/prepare` response and pass them to the matching `site/complete`
- if `complete` returns `missingParts`, re-upload only those parts
- prefer `url` for direct consumption
- include `playUrl` when preview matters
- prefer `siteUrl` for the root of a published static site
- prefer `entryUrl` for the preferred HTML entry page
- do not generate a synthetic `index.html` just to list files; if the real folder has no root `index.html`, let OkFile render the listing automatically
- preserve nested subdirectories exactly as uploaded
## Endpoints
- `POST /api/upload/prepare`
- `PUT uploadUrl` or `parts[].uploadUrl`
- `POST /api/upload/complete`
- `GET /api/upload/status/{id}`
- `GET /i/{id}`
- `GET /i/{id}?play=1`
- `POST /api/site/prepare`
- `POST /api/site/complete`
## Limits
- max file size: `1GB`
- multipart starts automatically above the backend threshold
- anonymous mode is IP rate-limited
- API key mode is controlled by backend quotas
## Useful URLs
- home: `https://www.okfile.com/en/`
- upload page: `https://www.okfile.com/en/upload/`
- account: `https://www.okfile.com/account`
- admin: `https://www.okfile.com/admin`
