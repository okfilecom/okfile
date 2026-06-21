---
name: "okfile"
description: "Uploads and publishes files to OkFile with quick upload for small files, direct links, preview URLs, static site publishing, and multipart support. Invoke when users ask to upload, publish, or share files."
---

# OkFile

## Purpose

Use this skill to upload and publish files to OkFile and return usable links for downstream tasks.

Choose this skill when the user wants to:
- upload images, videos, PDFs, or common files
- publish a file and get a public URL
- generate a preview or playback link
- use the small-file quick-upload path
- upload large files with multipart support
- retry incomplete multipart uploads by missing part list
- publish a static site folder to a subdomain
- use the Python CLI for upload, publish, status, or config workflows

## Core Flow

1. `GET /api/upload/config`
2. If the file is within `quickUploadMaxSize`, use `POST /api/upload/quick`
3. Otherwise use `POST /api/upload/prepare`, `PUT uploadUrl` or `parts[].uploadUrl`, then `POST /api/upload/complete`
4. Optionally `GET /api/upload/status/{id}`
5. For folders, use `POST /api/site/prepare` and `POST /api/site/complete`

## Minimal Example

```bash
curl "https://www.okfile.com/api/upload/config"
```

```bash
curl -X POST "https://www.okfile.com/api/upload/quick" \
  -F "file=@photo.jpg"
```

```bash
curl -X POST "https://www.okfile.com/api/upload/prepare" \
  -H "Content-Type: application/json" \
  --data '{"filename":"photo.jpg","size":12345,"contentType":"image/jpeg"}'
```

```bash
curl -X POST "https://www.okfile.com/api/upload/prepare" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: okf_..." \
  --data '{"filename":"photo.jpg","size":12345,"contentType":"image/jpeg"}'
```

```bash
curl -X POST "https://www.okfile.com/api/upload/complete" \
  -H "Content-Type: application/json" \
  --data '{"id":"a3k7m92x"}'
```

## Python CLI

Prefer installing the latest published PyPI package:

```bash
py -3 -m pip install okfile
okfile --version
```

Pinned install example:

```bash
py -3 -m pip install okfile==1.3.0
```

Fallback wheel install:

```bash
py -3 -m pip install "https://www.okfile.com/downloads/okfile-1.3.0-py3-none-any.whl"
```

Common commands:

```bash
okfile upload photo.jpg
okfile upload photo.jpg --max-downloads 10
okfile upload photo.jpg --expires-at 2026-12-31T23:59:59Z
okfile publish ./my-site/
okfile publish ./my-site/ --expires-at 2026-12-31T23:59:59Z
okfile status a3k7m92x
okfile status a3k7m92x --verbose
okfile config --key okf_xxxxx
okfile config --clear-origin
```

Debugging:

```bash
okfile upload photo.jpg --origin https://www.okfile.com --verbose
```

## Rules

- Discover limits from `GET /api/upload/config` instead of hardcoding them.
- Prefer `POST /api/upload/quick` for files within the advertised quick-upload size.
- For authenticated `prepare` calls, send `X-API-Key`.
- The CLI supports `--max-downloads` and `--expires-at`; `--verbose` shows traceback details for debugging.
- `okfile config --clear-origin` removes the stored default origin and falls back to `https://www.okfile.com`.
- Send only `id` to `complete`.
- If `complete` returns `missingParts`, re-upload only those parts.
- Prefer returning `url` for direct consumption.
- Return `playUrl` for preview-heavy scenarios like image, video, or PDF.

## Limits

- Max file size: `500MB`
- Quick-upload limit: currently exposed by `/api/upload/config`, typically `<= 5MB`
- Large files switch to multipart automatically
- Anonymous uploads are IP rate-limited
- API key uploads follow backend quota rules

## Useful URLs

- Home: `https://www.okfile.com/en/`
- Upload: `https://www.okfile.com/en/upload/`
- Account: `https://www.okfile.com/account`
- Admin: `https://www.okfile.com/admin`
- PyPI package: `https://pypi.org/project/okfile/`
- CLI wheel: `https://www.okfile.com/downloads/okfile-1.3.0-py3-none-any.whl`
- Repo CLI entry: `okfile_cli/__main__.py`
- Repo doc: `/SKILL.md`
