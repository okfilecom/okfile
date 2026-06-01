# Contributing

Thanks for contributing to OkFile.

## Before You Start

- read `README.md`
- read `okfile-upload-pitfalls.md` if your changes touch upload flows
- avoid committing secrets, tokens, local caches, or deployment artifacts

## Development Setup

```bash
npm install
npx wrangler pages dev .
```

## Scope Guidelines

Good contribution areas:

- upload flow correctness
- multipart performance and retry logic
- account and API key UX
- localization for `zh` and `en`
- docs, examples, and integration notes

Please keep changes focused. Small, reviewable pull requests are preferred.

## Coding Guidelines

- keep edits ASCII unless the file already uses non-ASCII content
- preserve compatibility with older mobile Chrome/WebView where relevant
- do not remove user-facing localization support
- do not hardcode secrets in source files, examples, or tests
- prefer targeted fixes over broad refactors

## Testing Checklist

When relevant, verify:

- homepage renders in `/zh/` and `/en/`
- manual upload page still works
- `prepare -> PUT -> complete` works for single uploads
- multipart uploads still complete correctly
- account pages render correctly in both languages

## Pull Request Notes

Please include:

- what changed
- why it changed
- how you tested it
- any production or migration impact

## Security

If your change touches secrets, auth, API keys, magic links, or presigned URLs, review `SECURITY.md` before submitting.
