# Changelog

All notable changes to this repository are documented in this file.

## [1.3.0] - 2026-06-21

### Breaking

- authenticated upload and site prepare requests now accept API keys only via the `X-API-Key` header; JSON body and form field `apiKey` support has been removed

### Added

- CLI `upload` now supports multipart part concurrency with `--multipart-concurrency`, defaulting to `3`
- README and skill docs now include multipart CLI examples and `--help` examples

### Updated

- Python package metadata now aligns on version `1.3.0`
- pinned CLI install examples and wheel download examples now reference `okfile 1.3.0`
- README, skill docs, and agent-facing guides now document `X-API-Key` as the only supported authentication input for upload and site prepare flows
- Python CLI now sends API keys only through the `X-API-Key` header for upload and site prepare requests

## [1.2.1] - 2026-06-08

### Added

- CLI `publish` now supports parallel site file uploads with `--concurrency` for faster multi-file publish workflows
- CLI upload and publish summaries now include human-readable size and elapsed time details

### Fixed

- `okfile config --clear-origin` now removes the stored default origin cleanly without leaving an empty config file
- upload prepare now rejects missing or unsafe filenames, including control characters and path-like values
- site prepare now rejects unsafe `siteName` values that contain dangerous HTML characters
- API endpoints now return `405 Method Not Allowed` for unsupported methods instead of falling through to the homepage
- double file completion now returns `Upload already completed` instead of a confusing size mismatch

### Updated

- pinned CLI install examples now reference `okfile==1.2.1`
- direct wheel download filename now references `okfile-1.2.1-py3-none-any.whl`

## [1.2.0] - 2026-06-07

### Changed

- Python package distribution name moved from `okfile-cli` to `okfile`
- CLI installation guidance now defaults to `py -3 -m pip install okfile`, with `okfile==1.2.0` documented as a pinned example
- direct wheel download filename changed to `okfile-1.2.0-py3-none-any.whl`

### Added

- PyPI project page for `okfile`: `https://pypi.org/project/okfile/`
- README CLI install section with PyPI and wheel fallback commands

### Updated

- homepage, root `SKILL.md`, and Trae skill docs now reference `okfile 1.2.0`
- site cache version bumped to refresh public installation docs

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

- repository About/Topics metadata is still pending higher GitHub permission scope
