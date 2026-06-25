---
name: okfile
description: Uploads and publishes files or static site folders to OkFile, with direct links, preview URLs, and multipart support. Use when the user asks to upload, publish, or share files or folders.
---

# OkFile

Use this standalone skill entry when installing OkFile through the open Agent Skills ecosystem.

## When to use

- upload an image, video, PDF, or common file to OkFile
- publish a folder as a static site to an OkFile subdomain
- return a direct file link via `url`
- return a preview or playback link via `playUrl`
- handle small files with quick upload or large files with multipart upload
- use the published CLI through PyPI or the npm launcher

## Core flow

1. Call `GET /api/upload/config` to discover `quickUploadMaxSize`, `multipartThreshold`, and `partSize`.
2. If the file is within `quickUploadMaxSize`, prefer `POST /api/upload/quick`.
3. Otherwise use `POST /api/upload/prepare`, upload to `uploadUrl` or `parts[].uploadUrl`, then finish with `POST /api/upload/complete`.
4. For static sites, use `POST /api/site/prepare`, upload all files with their relative paths preserved, then call `POST /api/site/complete`.
5. Return the best output for the task:
   - `url` for direct consumption or downloads
   - `playUrl` for image, video, or PDF preview
   - `siteUrl` or `entryUrl` for published sites

## CLI options

Python CLI:

```bash
py -3 -m pip install okfile
okfile --version
okfile upload ./photo.jpg
okfile publish ./my-site
```

npm launcher:

```bash
npx @okfilecom/okfile --version
npx @okfilecom/okfile upload ./photo.jpg
npx @okfilecom/okfile publish ./my-site
```

skills.sh install:

```bash
npx skills add okfilecom/okfile
```

## Rules

- Discover upload limits dynamically from `GET /api/upload/config`; do not hardcode quick-upload thresholds.
- Send `X-API-Key` or `apiKey` only when an authenticated workflow needs it.
- Send only `id` to `POST /api/upload/complete`.
- If completion returns `missingParts`, re-upload only the missing part numbers.
- Preserve nested relative paths for site publish; do not flatten folders.
- If the site intentionally has no root `index.html`, let OkFile render the directory listing automatically instead of generating a fake index page.

## Useful URLs

- Home: `https://www.okfile.com/en/`
- Upload: `https://www.okfile.com/en/upload/`
- PyPI: `https://pypi.org/project/okfile/`
- npm: `https://www.npmjs.com/package/@okfilecom/okfile`
- Repo skill source: `../SKILL.md`
