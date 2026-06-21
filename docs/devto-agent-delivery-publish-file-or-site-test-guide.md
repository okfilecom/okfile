# How I Tested an Agent Delivery Flow: Publish a File or a Static Site and Get a Shareable URL

When you build an Agent workflow, “generation” is rarely the hardest part.

The hard part is delivery:

- upload the artifact reliably
- get a shareable URL back
- support previews for common formats (image/video/PDF)
- publish a whole static folder as a website
- update a site without exposing a half-updated state

This post is not a product pitch. It’s a test-oriented walkthrough of how I validate a delivery pipeline end-to-end, with the concrete checks I care about and a couple of code snippets I actually use.

Repository reference (for a runnable implementation):  
https://github.com/okfilecom/okfile

## 1) What I Test (Checklist)

I split the tests into four groups:

1. **Single file publish** returns a stable URL
2. **Preview behavior** for image/video/PDF works as expected
3. **Static folder publish** keeps nested paths and serves as a site
4. **Site updates** do not leak “mixed versions” during upload

If these pass, the delivery layer is safe to be called by an Agent in an automated workflow.

## 2) End-to-End Single File Publish

### Inputs

- `fileName`
- `contentType`
- `size` (I always include it)
- optional `X-API-Key` header (for authenticated usage)

### Steps

1. Call `POST /api/upload/prepare`
2. Upload bytes to the returned `uploadUrl` (or multipart `parts[].uploadUrl`)
3. Call `POST /api/upload/complete`
4. Validate the returned URLs are actually reachable

### Minimal code example

```js
async function publishFile(file, apiKey) {
  const prepareRes = await fetch("https://www.okfile.com/api/upload/prepare", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey
    },
    body: JSON.stringify({
      fileName: file.name,
      contentType: file.type || "application/octet-stream",
      size: file.size
    })
  });

  const prepare = await prepareRes.json();

  await fetch(prepare.uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      "Content-Length": String(file.size)
    },
    body: file
  });

  const completeRes = await fetch("https://www.okfile.com/api/upload/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      uploadId: prepare.uploadId,
      id: prepare.id
    })
  });

  return completeRes.json();
}
```

### What I validate after `complete`

- there is a stable public `url`
- there is a `downloadUrl` (if the system provides it)
- there is a preview/play page for image/video/PDF (often named `playUrl`)
- the URL is reachable in a browser (not just “API returned 200”)

## 3) Agent-Friendly Output Contract

For automation, I want the final output to be a JSON object that downstream workflow steps can consume without guessing:

```json
{
  "success": true,
  "fileName": "report.pdf",
  "url": "https://...",
  "downloadUrl": "https://...",
  "playUrl": "https://..."
}
```

This is what makes “delivery” a real workflow node instead of a manual post-processing step.

## 4) Publish a Static Folder as a Website

When an Agent generates an HTML report or a docs folder, I don’t want to zip it and ask a human to upload it somewhere.

I test a folder publish flow with two samples:

- a standard static site that contains root `index.html`
- a “report directory” that does **not** contain root `index.html`

### Things I check

- nested paths are preserved (`assets/`, `images/`, `scripts/`, etc.)
- site root `/` renders `index.html` when present
- site root `/` shows a directory listing when `index.html` is missing
- direct asset URLs under `/path/to/file` work

### Pseudocode sketch

```js
async function publishSite(files, apiKey) {
  const prepare = await fetch("https://www.okfile.com/api/site/prepare", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey
    },
    body: JSON.stringify({
      files: files.map((f) => ({
        path: f.relativePath,
        size: f.size,
        contentType: f.contentType
      }))
    })
  }).then((r) => r.json());

  for (const item of prepare.files) {
    const local = files.find((f) => f.relativePath === item.path);
    await fetch(item.uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": item.contentType,
        "Content-Length": String(item.size)
      },
      body: local.blob
    });
  }

  return fetch("https://www.okfile.com/api/site/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      siteId: prepare.siteId,
      token: prepare.token
    })
  }).then((r) => r.json());
}
```

## 5) The Update Test: Avoid “Half Updated” Sites

This is the most important test.

I run two consecutive publishes against the same site:

1. publish an initial version
2. change HTML + CSS + a couple of images
3. publish an update
4. refresh the site while the update is happening

What I want:

- the entry URL stays stable
- the old version remains accessible until the new one is fully ready
- once switched, the site is consistently on the new version (no mixed assets)

## 6) Notes That Matter in Practice

- Always include file size (and use `Content-Length` on uploads when possible).
- Never rewrite folder paths before upload (static sites break on relative paths).
- Don’t stop at “API success”; verify URLs in a real browser.
- Test updates, not just first publish.

## 7) Reference Implementation

If you want to inspect a runnable implementation of these flows:

https://github.com/okfilecom/okfile
