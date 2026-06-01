# Changelog

All notable changes to this repository are documented in this file.

## [1.0.0] - 2026-06-01

### Added

- public GitHub repository for the OkFile project
- `README.md` with architecture, routes, setup, and configuration notes
- Apache-2.0 `LICENSE`
- Trae skill definition at `.trae/skills/okfile/SKILL.md`
- homepage links to `www.okfile.com` and the GitHub repository
- first GitHub release `v1.0.0`

### Improved

- localized account pages under `/zh/account/` and `/en/account/`
- homepage feature card layout for a more compact mobile presentation
- homepage and upload page static response caching
- multipart prepare flow with signer reuse and parallel URL generation
- frontend multipart upload concurrency and progress handling

### Fixed

- old mobile Chrome/WebView parsing failure caused by optional chaining
- upload list not appearing after file selection on affected mobile browsers
- debug panel intercepting clicks on desktop upload actions

### Cleaned Up

- temporary debug probes, banners, and diagnostic overlays removed from production

## [Unreleased]

- repository About/Topics metadata is still pending higher GitHub permission scope
