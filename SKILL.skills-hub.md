---
name: okfile
description: Upload and publish images, videos, PDFs, and common files to OkFile, or publish a static site folder to a per-site subdomain with directory listing fallback when root index.html is absent. Official site: https://www.okfile.com/
license: Apache-2.0
compatibility: Designed for Claude Code and Codex CLI. Requires internet access and HTTP requests. Works on Windows, macOS, and Linux.
allowed-tools: Bash Read Edit Write
metadata:
  author: OkFile
  version: "1.0.3"
tags:
  - upload
  - file-publishing
  - static-site
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
Official site: `https://www.okfile.com/`

Use this skill to upload and publish files or static sites through OkFile.
## Invoke This Skill When
- the user asks to upload or publish a file
- the user needs a direct public file link
- the user needs a preview or playback URL for an image, video, or PDF
- the user wants to publish a folder as a static website
- the user wants to publish a folder that may not contain root `index.html`
- the user wants multipart upload for a large file
- multipart completion fails and missing parts need targeted retry
## Follow This Workflow
1. Call `POST /api/upload/prepare` with `filename`, `size`, `contentType`, and optional `preferredPartSize`, and send `X-API-Key` when authenticated access is needed.
2. Upload the file body with `PUT` to `uploadUrl`, or upload each chunk to `parts[].uploadUrl`.
3. Call `POST /api/upload/complete` with only `id`.
4. If needed, call `GET /api/upload/status/{id}` to inspect progress.
5. If completion returns `missingParts`, re-upload only those part numbers and retry `complete`.
## Static Site Workflow
1. Call `POST /api/site/prepare` with `siteName`, optional `entryPath`, and the full file manifest using site-relative paths.
2. Upload every file through the normal file upload flow and collect returned `fileId` values.
3. Call `POST /api/site/complete` with `siteId`, `siteToken`, and `files[{ relativePath, fileId }]`.
4. Return `siteUrl` as the site root and `entryUrl` as the preferred HTML entry.
5. If root `index.html` is absent, explain that OkFile will show a directory listing instead of forcing an arbitrary file as homepage.
6. Do not generate or upload a synthetic `index.html` just to list files; upload the real folder tree and let OkFile render the listing.
## Apply These Rules
- Send API keys in the `X-API-Key` header.
- Send only `id` in `complete`.
- `expiresIn` refers only to the signed `uploadUrl` or `parts[].uploadUrl` lifetime; it does not define a separate Worker-side upload-session TTL.
- Keep the exact `id` from the matching `prepare` response until `complete` finishes.
- For site publishing, keep the exact `siteId` and `siteToken` returned by the matching `site/prepare` response and pass them to the matching `site/complete`.
- Prefer `url` for direct consumption.
- Include `playUrl` when preview matters.
- Prefer `siteUrl` for the root of a published site.
- Include `entryUrl` when a rendered HTML entry page exists.
- Set `Content-Length` on each `PUT`.
- Check every upload response for `2xx` status.
- Use site-relative paths like `assets/app.css`, not local absolute paths.
- If every uploaded path shares one top-level folder, OkFile strips that folder automatically and treats its contents as the site root.
- Preserve nested subdirectories exactly as uploaded, such as `docs/getting-started.md` or `images/icons/logo.svg`.
## Minimal Requests
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
```
## Tell The User About These Limits
- max file size: `500MB`
- anonymous mode is IP rate-limited
- API key mode is controlled by backend quotas
- multipart retry should target only `missingParts`
## Explain Static Site Behavior
- If root `index.html` exists, the site root renders that page.
- If root `index.html` does not exist, the site root renders a directory listing with file name, size, and upload time.
- Images and videos open inline from that listing.
- Other files should use download links.
- Subdirectories remain accessible after publishing, for example `/docs/getting-started.md` or `/images/logo.png`.
## Use These URLs
- home: `https://www.okfile.com/en/`
- upload page: `https://www.okfile.com/en/upload/`
- account: `https://www.okfile.com/account`
- admin: `https://www.okfile.com/admin`
