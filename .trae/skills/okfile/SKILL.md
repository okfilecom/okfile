---
name: "okfile"
description: "Uploads and publishes files to OkFile with direct links, preview URLs, and multipart support. Invoke when users ask to upload, publish, or share files."
---

# OkFile

## Purpose

Use this skill to upload and publish files to OkFile and return usable links for downstream tasks.

Choose this skill when the user wants to:
- upload images, videos, PDFs, or common files
- publish a file and get a public URL
- generate a preview or playback link
- upload large files with multipart support
- retry incomplete multipart uploads by missing part list

## Core Flow

1. `POST /api/upload/prepare`
2. `PUT uploadUrl` or each `parts[].uploadUrl`
3. `POST /api/upload/complete`
4. Optionally `GET /api/upload/status/{id}`

## Minimal Example

```bash
curl -X POST "https://www.okfile.com/api/upload/prepare" \
  -H "Content-Type: application/json" \
  --data '{"filename":"photo.jpg","size":12345,"contentType":"image/jpeg"}'
```

```bash
curl -X POST "https://www.okfile.com/api/upload/complete" \
  -H "Content-Type: application/json" \
  --data '{"id":"a3k7m92x"}'
```

## Rules

- Send `apiKey` only to `prepare` when authenticated publishing is needed.
- Send only `id` to `complete`.
- If `complete` returns `missingParts`, re-upload only those parts.
- Prefer returning `url` for direct consumption.
- Return `playUrl` for preview-heavy scenarios like image, video, or PDF.

## Limits

- Max file size: `500MB`
- Large files switch to multipart automatically
- Anonymous uploads are IP rate-limited
- API key uploads follow backend quota rules

## Useful URLs

- Home: `https://www.okfile.com/en/`
- Upload: `https://www.okfile.com/en/upload/`
- Account: `https://www.okfile.com/account`
- Admin: `https://www.okfile.com/admin`
- Repo doc: `/SKILL.md`
