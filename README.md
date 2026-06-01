# OkFile

OkFile is an agent-first file upload and publish service built on Cloudflare Pages Functions, R2, and D1.

- Website: `https://www.okfile.com`
- Repo: `https://github.com/okfilecom/okfile`

## Features

- Anonymous upload and authenticated upload with user API keys
- Direct file URLs and preview/playback URLs
- Multipart upload for large files up to `500MB`
- Missing-part retry flow for incomplete multipart uploads
- Email magic-link login and account center
- Admin quota controls for API keys
- Localized home, upload, and account pages

## Stack

- Cloudflare Pages Functions
- Cloudflare R2
- Cloudflare D1
- Resend for email magic links
- Plain HTML + JavaScript frontend

## Main Routes

- `/zh/` and `/en/`: localized home pages
- `/zh/upload/` and `/en/upload/`: manual upload entry
- `/account`: redirects to localized account page
- `/api/upload/prepare`: create single or multipart upload URLs
- `/api/upload/complete`: finalize upload and publish file
- `/api/upload/status/{id}`: query multipart upload progress
- `/i/{id}`: direct file URL
- `/i/{id}?play=1`: preview/playback page

## Development

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

Set secrets in Cloudflare, not in the repository:

- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `RESEND_API_KEY`

Plain-text vars configured in `wrangler.toml`:

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

## Skill Docs

- Root doc: `SKILL.md`
- Trae skill: `.trae/skills/okfile/SKILL.md`

## License

Apache-2.0
