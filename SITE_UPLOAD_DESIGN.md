# OkFile Product And API Design

## Overview

OkFile is an agent-first upload and publish service built on Cloudflare Pages Functions, R2, and D1.

Current capability includes:

- anonymous file upload
- API Key authenticated upload
- direct file URLs, preview URLs, and controlled download URLs
- multipart upload for large files up to `1GB`
- retrying missing multipart parts
- email magic-link login
- account page and API Key management
- admin console with API Key controls
- configurable publish origin, for example `ok26.org`
- published file link recording in D1
- file expiration and expired-file cleanup
- upload notification email with daily cap
- static site directory upload with subdomain publishing

## Goals

- upload an entire static site directory, including nested subdirectories
- preserve relative paths exactly as uploaded
- publish the directory under a dedicated subdomain
- keep the current single-file upload flow fully compatible
- support both anonymous callers and API Key callers
- reuse existing file upload primitives where possible

## Non-Goals In Initial Upload Phase

- no in-place overwrite deployment
- no zip extraction on the server
- no server-side code execution
- no admin site browser yet
- no custom user-defined subdomain yet

## Current Update Model

- each site now keeps release history
- updating an existing site does not overwrite files in place
- a new release is created first, then the active site snapshot is switched atomically
- rollback is implemented by activating a previous release
- the public site URL and subdomain stay unchanged across updates

## Current Product Surface

### Existing Pages

- `/zh/` and `/en/`: localized home pages
- `/zh/upload/` and `/en/upload/`: manual upload pages
- `/zh/account/` and `/en/account/`: account center
- `https://admin.okfile.com/`: admin console

### Existing Upload APIs

- `GET /api/upload/config`
- `POST /api/upload/prepare`
- `POST /api/upload/complete`
- `GET /api/upload/status/{id}`

### Existing Auth And Admin APIs

- `POST /api/auth/request-link`
- `GET /auth/verify?token=...`
- `POST /api/auth/logout`
- `GET /api/account/me`
- `POST /api/account/api-keys`
- `GET /api/admin/api-keys`
- `POST /api/admin/api-keys/{id}`
- `GET /api/admin/publish-domain`
- `POST /api/admin/publish-domain`
- `POST /api/admin/cleanup-expired`

### Existing Public File Routes

- `/i/{id}`: raw file URL
- `/i/{id}?play=1`: preview/play page
- `/d/{id}`: controlled download URL

## New Product: Site Directory Upload

### User Story

A user selects a local folder such as:

```text
my-site/
  index.html
  assets/app.js
  assets/app.css
  docs/guide/index.html
  images/logo.png
```

OkFile preserves the relative paths and publishes the result as:

```text
https://st-abc123.ok26.org/
https://st-abc123.ok26.org/assets/app.js
https://st-abc123.ok26.org/docs/guide/
https://st-abc123.ok26.org/images/logo.png
```

### Publish Rules

- each site gets one generated subdomain
- if root `index.html` exists, `/` resolves to the configured `entryPath`
- if root `index.html` does not exist, `/` renders a directory listing page
- `/foo/` resolves to `foo/index.html`
- `/foo` resolves to `foo` first, then `foo/index.html`
- nested assets are served from the original relative paths
- HTML root-relative paths like `/assets/app.css` now work against the site subdomain root
- image and video files open inline from the listing page
- non-media files use explicit download links from the listing page
- stored file content types are corrected at serve time for common site assets such as `html`, `css`, and `js`

### Recommended Public Links

- `siteUrl`: the site root, for example `https://st-abc123.ok26.org/`
- `entryUrl`: the actual entry page, usually the same as `siteUrl`; if there is no root `index.html`, it falls back to `siteUrl`
- `siteHostname`: the generated hostname, for example `st-abc123.ok26.org`

## Data Model

### Existing Tables

- `users`
- `magic_links`
- `sessions`
- `api_keys`
- `api_key_usage_windows`
- `upload_notification_daily`
- `app_settings`
- `published_files`

### New Tables / Extended Tables

#### `sites`

- `id`: site ID
- `name`: display name
- `publish_origin`: actual publish origin used when completed
- `site_url`: root publish URL
- `site_hostname`: exact hostname used for resolving the site
- `subdomain`: generated subdomain label
- `entry_path`: entry file path, usually `index.html`, or empty when the site falls back to directory listing
- `status`: `preparing` or `active`
- `file_count`: file count in the site
- `total_size`: sum of all file sizes
- `expires_at`: optional site-level expiration
- `api_key_id`: optional API Key owner
- `user_id`: optional user owner
- `active_release_id`: currently active release
- `created_at`
- `completed_at`
- `updated_at`

#### `site_files`

- `site_id`
- `relative_path`
- `file_id`
- `file_name`
- `content_type`
- `size`
- `created_at`

`site_files` remains the current active snapshot that serves live traffic.

#### `site_releases`

- `id`
- `site_id`
- `version_no`
- `status`: `ready`, `active`, `archived`
- `publish_origin`
- `site_url`
- `site_hostname`
- `subdomain`
- `entry_path`
- `file_count`
- `total_size`
- `expires_at`
- `based_on_release_id`
- `change_summary`
- `created_at`
- `completed_at`
- `activated_at`

#### `site_release_files`

- `release_id`
- `relative_path`
- `file_id`
- `file_name`
- `content_type`
- `size`
- `created_at`

## API Design

### Existing Single-File Upload Flow

```text
POST /api/upload/prepare
PUT uploadUrl or parts[].uploadUrl
POST /api/upload/complete
```

This remains unchanged and is still the base primitive in Phase 1.

### New Site APIs

#### `POST /api/site/prepare`

Creates a site upload session and validates the manifest.

Request:

```json
{
  "siteId": "st_existing_optional",
  "siteName": "my-site",
  "entryPath": "index.html",
  "expiresAt": "2026-06-30T00:00:00.000Z",
  "files": [
    { "path": "index.html", "size": 1200, "contentType": "text/html" },
    { "path": "assets/app.js", "size": 48000, "contentType": "application/javascript" }
  ]
}
```

Notes:

- `entryPath` may be empty when the folder has no root `index.html`
- send API keys in the `X-API-Key` header when the request is authenticated
- if every uploaded path is under the same top-level directory, the backend strips that directory before persisting the site
- if `siteId` is omitted, OkFile creates a new site
- if `siteId` is provided, OkFile treats the request as an update of an existing site and creates the next release for that site

Response:

```json
{
  "success": true,
  "siteId": "st_xxxxxxxx",
  "siteToken": "opaque-token",
  "releaseId": "rel_xxxxxxxx",
  "versionNo": 4,
  "subdomain": "st-xxxxxxxx",
  "siteHostname": "st-xxxxxxxx.ok26.org",
  "entryPath": "index.html",
  "fileCount": 2,
  "totalSize": 49200,
  "siteUrl": "https://st-xxxxxxxx.ok26.org/",
  "entryUrl": "https://st-xxxxxxxx.ok26.org/",
  "uploadStrategy": "reuse-file-upload-api",
  "updateMode": true
}
```

#### `POST /api/site/complete`

Finalizes the site after all files have already been uploaded with the existing file upload API.

Request:

```json
{
  "siteId": "st_xxxxxxxx",
  "siteToken": "opaque-token",
  "files": [
    { "relativePath": "index.html", "fileId": "abc12345" },
    { "relativePath": "assets/app.js", "fileId": "def67890" }
  ]
}
```

Response:

```json
{
  "success": true,
  "siteId": "st_xxxxxxxx",
  "releaseId": "rel_xxxxxxxx",
  "versionNo": 4,
  "subdomain": "st-xxxxxxxx",
  "siteHostname": "st-xxxxxxxx.ok26.org",
  "siteUrl": "https://st-xxxxxxxx.ok26.org/",
  "entryUrl": "https://st-xxxxxxxx.ok26.org/",
  "entryPath": "index.html",
  "publishOrigin": "https://ok26.org",
  "fileCount": 2,
  "totalSize": 49200,
  "updateMode": true,
  "changeSummary": {
    "added": 1,
    "modified": 3,
    "removed": 0,
    "unchanged": 8
  }
}

### Admin Update And Rollback

- admin site detail page shows release history for every site
- clicking `更新网站` opens the public upload page with `?siteId=...`
- after upload completes, the site switches to the new release atomically
- admin can activate any previous release to roll back immediately
```

## Frontend Design

### Upload Page

Manual upload page provides:

- select files
- select folder

Behavior:

- single-file and multi-file upload keeps the current behavior
- folder upload uses the browser-provided relative paths
- folder upload forbids mixing loose files and folder files in the same batch
- if all selected files share one top-level directory, the uploader strips it and uses that directory content as the site root
- after all files complete, the page calls `/api/site/complete`
- results area shows both file links and the site subdomain URL
- results area tells the user when a shared top-level directory was stripped
- results area tells the user when the site has no root `index.html` and will open as a directory listing

### Entry Path Heuristic

Phase 1 chooses:

1. root `index.html`
2. otherwise empty, which enables directory listing at `/`

Later phases can expose manual entry file selection.

## Limits

### Existing File Limits

- max single file size: `1GB`
- multipart threshold: `25MB`
- default part size: `10MB`

### New Site Limits

- max files per site: implementation-defined
- max total site size: implementation-defined
- each individual file still uses existing file upload limits

## Security Rules

- relative paths are normalized to `/`
- `..`, absolute paths, empty segments, and invalid paths are rejected
- public access is static-file only
- no server-side execution
- reserved subdomains such as `www`, `admin`, and `send` are excluded
- hidden control files can be filtered by client or rejected later

## Routing Design

### Public Site Routing

- `GET https://{generated-subdomain}.{publish-base-domain}/`
- `GET https://{generated-subdomain}.{publish-base-domain}/*`

Behavior:

- request host is matched against `sites.site_hostname`
- request path is resolved into a `site_files` record
- the mapped `file_id` is read from R2
- if `/` or a requested directory has no `index.html`, the response is a generated directory listing for that directory
- `404` is returned if the site or target file is missing
- `410` is returned if the site is expired

### Deployment Requirement

- Cloudflare Pages continues to serve the main site on `ok26.org` and `www.okfile.com`
- a separate Worker route handles `*.ok26.org/*`
- DNS must include a proxied wildcard record for `*.ok26.org`
- first-level wildcard HTTPS is covered by Cloudflare Universal SSL for `*.ok26.org`

## Phase Breakdown

### Phase 1

- folder selection on manual upload page
- `POST /api/site/prepare`
- `POST /api/site/complete`
- hostname-based site routing
- D1 tables `sites` and `site_files`
- generated subdomain link in upload result area
- shared top-level directory auto-strip for folder uploads
- directory listing fallback when root `index.html` is absent

### Phase 2

- admin view of uploaded sites
- manual entry path editing
- republish / new version support
- custom user-defined subdomain
- site deletion UI

### Phase 3

- optional zip artifact generation
- directory listing toggle
- custom site 404 page
- version promotion and rollback

## Compatibility Notes

- current file APIs stay compatible
- current file URLs stay compatible
- current publish-origin behavior stays compatible
- directory upload is additive and does not replace the current file-first model
- the old `/s/{siteId}` public path scheme is abandoned in favor of subdomain publishing
