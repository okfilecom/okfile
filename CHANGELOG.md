# Changelog

All notable changes to this repository are documented in this file.

## [1.2.2] - 2026-06-16

### Fixed

- CLI single-file signed uploads now send `bytes` bodies instead of file-handle streams, avoiding hangs during large-file presigned `PUT` requests in the current Windows `requests` environment
- CLI site publish now progresses past the first large file in the same environment instead of stalling during the first signed upload

### Updated

- pinned CLI install examples now reference `okfile==1.2.2`
- direct wheel download filename now references `okfile-1.2.2-py3-none-any.whl`

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

## [Unreleased]

- repository About/Topics metadata is still pending higher GitHub permission scope
