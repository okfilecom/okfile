# Published Article Archive

All outward-facing articles must be archived as Markdown files directly under `docs/`.

## Rule

- keep one Markdown file per article in `docs/*.md`
- do not store published article copies in the repository root
- keep the repo copy even if the article is still pending review on the target platform
- update the same file when revising the article for submission or publication

## File Naming

Use this flat naming pattern:

```text
docs/{platform}-{slug}.md
```

Naming rules:

- `platform`: target publication platform in lowercase ASCII, such as `tencent`, `zhihu`, `juejin`
- `slug`: short kebab-case topic summary in lowercase ASCII
- use hyphens only; do not use spaces, uppercase letters, or dates unless they are required to disambiguate

Examples:

- `docs/tencent-workbuddy-agent-publish-file-or-site.md`
- `docs/juejin-okfile-site-release-guide.md`
- `docs/zhihu-okfile-upload-api-notes.md`

## Current Archive

- `docs/tencent-workbuddy-agent-publish-file-or-site.md`
