# OkFile

Agent-first file upload and publish service built on Cloudflare Pages Functions, R2, and D1.

- Website: `https://www.okfile.com`
- Repository: `https://github.com/okfilecom/okfile`
- License: `Apache-2.0`

## What It Does

OkFile is designed for Agents, scripts, and lightweight manual upload use cases.

It supports:

- anonymous uploads
- authenticated uploads with user API keys
- direct file URLs for download or embedding
- preview/playback URLs for image, video, and PDF
- multipart upload for large files up to `500MB`
- retrying only missing parts after incomplete multipart uploads
- email magic-link login and account management
- localized home, upload, and account pages

## Main User Flows

### 1. Anonymous Publish

1. `POST /api/upload/prepare`
2. `PUT uploadUrl` or each `parts[].uploadUrl`
3. `POST /api/upload/complete`
4. return `url` and optionally `playUrl`

### 2. API Key Publish

1. request a magic link and log in
2. create an API key in `/account`
3. call `POST /api/upload/prepare` with `apiKey`
4. upload file data to signed URLs
5. call `POST /api/upload/complete`

### 3. Manual Upload

Users can also use:

- `/zh/upload/`
- `/en/upload/`

This path is kept as a fallback entry, while API integration remains the recommended flow.

## Architecture

### Runtime

- Cloudflare Pages Functions for routing and API handling
- Cloudflare R2 for file storage
- Cloudflare D1 for auth and API key metadata
- Resend for email magic links

### Frontend

- static `index.html` for homepage
- static `upload.html` for manual upload
- server-side localization and SEO injection in `worker-app.js`

### Backend Responsibilities

- issue presigned R2 upload URLs
- complete multipart uploads
- activate public file routes
- manage sessions, magic links, and API keys
- enforce anonymous and per-key quota limits

## Core Routes

### Pages

- `/zh/` and `/en/`: localized home pages
- `/zh/upload/` and `/en/upload/`: manual upload pages
- `/account`: redirects to localized account page
- `/zh/account/` and `/en/account/`: localized account pages
- `/admin`: admin console

### Upload APIs

- `POST /api/upload/prepare`
- `POST /api/upload/complete`
- `GET /api/upload/status/{id}`

### Auth APIs

- `POST /api/auth/request-link`
- `GET /auth/verify?token=...`
- `GET /api/account/me`
- `POST /api/account/api-keys`

### File URLs

- `/i/{id}`: direct file URL
- `/i/{id}?play=1`: preview/playback page
- `/d/{id}`: controlled download route

## Repository Layout

```text
.
|- worker-app.js                      # main Pages Function entry
|- index.html                         # homepage
|- upload.html                        # manual upload page
|- schema.sql                         # D1 schema
|- wrangler.toml                      # Cloudflare config
|- SKILL.md                           # root skill document
|- .trae/skills/okfile/SKILL.md       # Trae skill definition
|- okfile-upload-pitfalls.md          # upload pitfalls and debugging notes
```

## Local Development

Install dependencies:

```bash
npm install
```

Run local development:

```bash
npx wrangler pages dev .
```

Deploy to Cloudflare Pages:

```bash
npx wrangler pages deploy . --project-name okfile --branch main
```

## Configuration

Store secrets in Cloudflare, not in the repository.

### Secrets

- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `RESEND_API_KEY`

### Plain-Text Vars

- `R2_ACCOUNT_ID`
- `RESEND_FROM_EMAIL`
- `ADMIN_EMAILS`

## Database

The D1 schema is defined in `schema.sql` and includes:

- `users`
- `magic_links`
- `sessions`
- `api_keys`
- `api_key_usage_windows`

## Upload Notes

See these repo docs for integration details:

- `SKILL.md`
- `.trae/skills/okfile/SKILL.md`
- `okfile-upload-pitfalls.md`

The pitfalls doc includes practical notes such as:

- Cloudflare requiring a normal `User-Agent` for some requests
- explicit `Content-Length` on R2 PUT
- multipart retry strategy
- large-file client recommendations on Windows

## Contributing

Please read `CONTRIBUTING.md` before opening pull requests.

## Security

Please read `SECURITY.md` for reporting instructions and secret-handling rules.

## Changelog

See `CHANGELOG.md` for release notes tracked in-repo.

## License

Apache-2.0
