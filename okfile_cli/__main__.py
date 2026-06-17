from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import datetime as dt
import json
import mimetypes
import os
import sys
import time
import traceback
from pathlib import Path
from typing import Any

import requests

from okfile_cli import __version__


DEFAULT_ORIGIN = "https://www.okfile.com"
DEFAULT_TIMEOUT = 60
UPLOAD_TIMEOUT = 900
FALLBACK_QUICK_UPLOAD_MAX_SIZE = 5 * 1024 * 1024
FALLBACK_MULTIPART_THRESHOLD = 25 * 1024 * 1024
FALLBACK_PART_SIZE = 10 * 1024 * 1024
DEFAULT_PUBLISH_CONCURRENCY = 5
MAX_PUBLISH_CONCURRENCY = 10
PROGRESS_ENABLED = True


class OkFileError(RuntimeError):
    pass


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    if not getattr(args, "command", None):
        parser.print_help()
        return 0

    global PROGRESS_ENABLED
    PROGRESS_ENABLED = not bool(getattr(args, "no_progress", False))

    try:
        return args.func(args)
    except KeyboardInterrupt:
        print("Aborted by user", file=sys.stderr)
        return 130
    except requests.RequestException as exc:
        if getattr(args, "verbose", False):
            traceback.print_exc()
        print(f"Network error: {exc}", file=sys.stderr)
        return 1
    except OkFileError as exc:
        if getattr(args, "verbose", False):
            traceback.print_exc()
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    except Exception as exc:
        if getattr(args, "verbose", False):
            traceback.print_exc()
            return 1
        print(f"Unexpected error: {exc}", file=sys.stderr)
        print("Run again with --verbose for a traceback.", file=sys.stderr)
        return 1


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="okfile", description="Upload files and publish static sites to OkFile")
    parser.add_argument("--version", action="version", version=f"%(prog)s {__version__}")
    parser.add_argument("--no-progress", action="store_true", help="Disable progress output")

    subparsers = parser.add_subparsers(dest="command")

    upload_parser = subparsers.add_parser("upload", help="Upload a single file")
    upload_parser.add_argument("path", type=Path, help="Path to the file to upload")
    upload_parser.add_argument("--key", help="API key to use for this command")
    upload_parser.add_argument("--origin", help="OkFile origin, defaults to config or https://www.okfile.com")
    upload_parser.add_argument("--max-downloads", type=int, help="Optional max download count")
    upload_parser.add_argument("--expires-at", help="Optional ISO 8601 expiration timestamp")
    upload_parser.add_argument("--verbose", action="store_true", help="Show debug details for request failures")
    upload_parser.set_defaults(func=cmd_upload)

    publish_parser = subparsers.add_parser("publish", help="Publish a local directory as a static site")
    publish_parser.add_argument("path", type=Path, help="Path to the site directory")
    publish_parser.add_argument("--name", help="Published site name")
    publish_parser.add_argument("--key", help="API key to use for this command")
    publish_parser.add_argument("--origin", help="OkFile origin, defaults to config or https://www.okfile.com")
    publish_parser.add_argument("--expires-at", help="Optional ISO 8601 expiration timestamp")
    publish_parser.add_argument(
        "--concurrency",
        type=int,
        default=DEFAULT_PUBLISH_CONCURRENCY,
        help=f"Parallel file uploads for site publish (default: {DEFAULT_PUBLISH_CONCURRENCY}, max: {MAX_PUBLISH_CONCURRENCY})",
    )
    publish_parser.add_argument("--verbose", action="store_true", help="Show debug details for request failures")
    publish_parser.set_defaults(func=cmd_publish)

    status_parser = subparsers.add_parser("status", help="Get upload status by file ID")
    status_parser.add_argument("id", help="Upload ID")
    status_parser.add_argument("--origin", help="OkFile origin, defaults to config or https://www.okfile.com")
    status_parser.add_argument("--verbose", action="store_true", help="Show debug details for request failures")
    status_parser.set_defaults(func=cmd_status)

    config_parser = subparsers.add_parser("config", help="Store CLI defaults")
    config_parser.add_argument("--key", help="Persist an API key for future commands")
    config_parser.add_argument("--origin", help="Persist a default OkFile origin")
    config_parser.add_argument("--clear-key", action="store_true", help="Remove the stored API key")
    config_parser.add_argument("--clear-origin", action="store_true", help="Remove the stored default OkFile origin")
    config_parser.add_argument("--verbose", action="store_true", help="Show debug details for request failures")
    config_parser.set_defaults(func=cmd_config)

    return parser


def cmd_upload(args: argparse.Namespace) -> int:
    config = load_config()
    origin = resolve_origin(args.origin, config)
    api_key = resolve_api_key(args.key, config)
    path = ensure_file(args.path)
    max_downloads = validate_max_downloads(args.max_downloads)
    expires_at = validate_expires_at(args.expires_at)
    started_at = time.perf_counter()

    with requests.Session() as session:
        upload_config = get_upload_config(session, origin)
        result = upload_path(
            session=session,
            origin=origin,
            path=path,
            api_key=api_key,
            upload_config=upload_config,
            max_downloads=max_downloads,
            expires_at=expires_at,
        )

    elapsed_seconds = time.perf_counter() - started_at
    print_upload_result(result, path=path, elapsed_seconds=elapsed_seconds)
    return 0


def cmd_publish(args: argparse.Namespace) -> int:
    config = load_config()
    origin = resolve_origin(args.origin, config)
    api_key = resolve_api_key(args.key, config)
    root = ensure_directory(args.path)
    files = collect_site_files(root)
    if not files:
        raise OkFileError(f"No files found under {root}")
    expires_at = validate_expires_at(args.expires_at)
    concurrency = max(1, min(int(args.concurrency or DEFAULT_PUBLISH_CONCURRENCY), MAX_PUBLISH_CONCURRENCY))
    started_at = time.perf_counter()
    total_size = sum(path.stat().st_size for _, path in files)

    entry_path = "index.html" if (root / "index.html").is_file() else None
    site_name = (args.name or root.name).strip() or "site"

    with requests.Session() as session:
        upload_config = get_upload_config(session, origin)
        prepare_body: dict[str, Any] = {
            "siteName": site_name,
            "entryPath": entry_path,
            "expiresAt": expires_at,
            "files": [
                {
                    "path": relative,
                    "size": path.stat().st_size,
                    "contentType": guess_content_type(path),
                }
                for relative, path in files
            ],
        }
        if api_key:
            prepare_body["apiKey"] = api_key
        prepared = api_json(
            session,
            "POST",
            f"{origin}/api/site/prepare",
            json_body=prepare_body,
            headers=auth_headers(api_key),
            timeout=DEFAULT_TIMEOUT,
        )

        total = len(files)
        print(f"Publishing {total} files with concurrency={concurrency}", file=sys.stderr)
        uploaded_files = upload_site_files(
            files=files,
            origin=origin,
            api_key=api_key,
            upload_config=upload_config,
            expires_at=expires_at,
            concurrency=concurrency,
        )

        completed = api_json(
            session,
            "POST",
            f"{origin}/api/site/complete",
            json_body={
                "siteId": prepared["siteId"],
                "siteToken": prepared["siteToken"],
                "files": uploaded_files,
            },
            headers=auth_headers(api_key),
            timeout=DEFAULT_TIMEOUT,
        )

    elapsed_seconds = time.perf_counter() - started_at
    print_site_result(
        completed,
        file_count=len(files),
        total_size=total_size,
        elapsed_seconds=elapsed_seconds,
    )
    return 0


def upload_site_files(
    files: list[tuple[str, Path]],
    origin: str,
    api_key: str | None,
    upload_config: dict[str, Any],
    expires_at: str | None,
    concurrency: int,
) -> list[dict[str, str]]:
    if concurrency <= 1 or len(files) <= 1:
        uploaded_files: list[dict[str, str]] = []
        total = len(files)
        with requests.Session() as session:
            for index, (relative, path) in enumerate(files, start=1):
                print(f"[{index}/{total}] Uploading {relative}", file=sys.stderr)
                result = upload_path(
                    session=session,
                    origin=origin,
                    path=path,
                    api_key=api_key,
                    upload_config=upload_config,
                    max_downloads=None,
                    expires_at=expires_at,
                )
                uploaded_files.append({"relativePath": relative, "fileId": result["id"]})
        return uploaded_files

    total = len(files)
    completed = 0
    uploaded_by_relative: dict[str, dict[str, str]] = {}
    with ThreadPoolExecutor(max_workers=concurrency) as executor:
        future_to_file = {
            executor.submit(
                upload_site_file,
                origin=origin,
                relative=relative,
                path=path,
                api_key=api_key,
                upload_config=upload_config,
                expires_at=expires_at,
            ): (relative, path)
            for relative, path in files
        }
        for future in as_completed(future_to_file):
            relative, _path = future_to_file[future]
            result = future.result()
            completed += 1
            print(f"[{completed}/{total}] Uploaded {relative}", file=sys.stderr)
            uploaded_by_relative[relative] = {"relativePath": relative, "fileId": result["id"]}

    return [uploaded_by_relative[relative] for relative, _path in files]


def upload_site_file(
    origin: str,
    relative: str,
    path: Path,
    api_key: str | None,
    upload_config: dict[str, Any],
    expires_at: str | None,
) -> dict[str, Any]:
    with requests.Session() as session:
        return upload_path(
            session=session,
            origin=origin,
            path=path,
            api_key=api_key,
            upload_config=upload_config,
            max_downloads=None,
            expires_at=expires_at,
        )


def cmd_status(args: argparse.Namespace) -> int:
    config = load_config()
    origin = resolve_origin(args.origin, config)
    status_url = f"{origin}/api/upload/status/{args.id}"
    with requests.Session() as session:
        response = request_or_error(session, "GET", status_url, timeout=DEFAULT_TIMEOUT)
        if not is_json_response(response):
            raise OkFileError(f"Upload not found or invalid ID: {args.id}")
        result = decode_json_response(response)
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


def cmd_config(args: argparse.Namespace) -> int:
    config = load_config()
    changed = False

    if args.clear_key:
        config.pop("api_key", None)
        changed = True
    if args.clear_origin:
        config.pop("origin", None)
        changed = True
    if args.key:
        config["api_key"] = args.key.strip()
        changed = True
    if args.origin:
        config["origin"] = normalize_origin(args.origin)
        changed = True

    if changed:
        save_config(config)

    print(f"Config file: {config_path()}")
    print(json.dumps(config, indent=2, sort_keys=True))
    return 0


def resolve_origin(cli_value: str | None, config: dict[str, Any]) -> str:
    return normalize_origin(cli_value or config.get("origin") or DEFAULT_ORIGIN)


def resolve_api_key(cli_value: str | None, config: dict[str, Any]) -> str | None:
    value = (cli_value or config.get("api_key") or "").strip()
    return value or None


def normalize_origin(value: str) -> str:
    normalized = str(value or "").strip().rstrip("/")
    if not normalized:
        raise OkFileError("Origin cannot be empty")
    if "://" not in normalized:
        normalized = "https://" + normalized
    return normalized.rstrip("/")


def ensure_file(path: Path) -> Path:
    resolved = Path(path).expanduser().resolve()
    if not resolved.is_file():
        raise OkFileError(f"File not found: {resolved}")
    return resolved


def ensure_directory(path: Path) -> Path:
    resolved = Path(path).expanduser().resolve()
    if not resolved.is_dir():
        raise OkFileError(f"Directory not found: {resolved}")
    return resolved


def collect_site_files(root: Path) -> list[tuple[str, Path]]:
    items: list[tuple[str, Path]] = []
    for path in sorted(root.rglob("*")):
        if path.is_file():
            relative = path.relative_to(root).as_posix()
            items.append((relative, path))
    return items


def get_upload_config(session: requests.Session, origin: str) -> dict[str, Any]:
    try:
        data = api_json(session, "GET", f"{origin}/api/upload/config", timeout=DEFAULT_TIMEOUT)
    except OkFileError:
        data = {}
    except requests.RequestException:
        data = {}
    return {
        "quickUploadMaxSize": int(data.get("quickUploadMaxSize") or FALLBACK_QUICK_UPLOAD_MAX_SIZE),
        "multipartThreshold": int(data.get("multipartThreshold") or FALLBACK_MULTIPART_THRESHOLD),
        "partSize": int(data.get("partSize") or FALLBACK_PART_SIZE),
    }


def upload_path(
    session: requests.Session,
    origin: str,
    path: Path,
    api_key: str | None,
    upload_config: dict[str, Any],
    max_downloads: int | None,
    expires_at: str | None,
) -> dict[str, Any]:
    size = path.stat().st_size
    quick_limit = int(upload_config.get("quickUploadMaxSize") or FALLBACK_QUICK_UPLOAD_MAX_SIZE)
    if size <= quick_limit:
        return quick_upload(
            session=session,
            origin=origin,
            path=path,
            api_key=api_key,
            max_downloads=max_downloads,
            expires_at=expires_at,
        )
    return prepare_upload(
        session=session,
        origin=origin,
        path=path,
        api_key=api_key,
        upload_config=upload_config,
        max_downloads=max_downloads,
        expires_at=expires_at,
    )


def quick_upload(
    session: requests.Session,
    origin: str,
    path: Path,
    api_key: str | None,
    max_downloads: int | None,
    expires_at: str | None,
) -> dict[str, Any]:
    fields = {}
    if max_downloads is not None:
        fields["maxDownloads"] = str(max_downloads)
    if expires_at:
        fields["expiresAt"] = expires_at

    mime = guess_content_type(path)
    with path.open("rb") as handle:
        response = request_or_error(
            session,
            "POST",
            f"{origin}/api/upload/quick",
            headers=auth_headers(api_key),
            data=fields,
            files={"file": (path.name, handle, mime)},
            timeout=UPLOAD_TIMEOUT,
        )
    return decode_json_response(response)


def prepare_upload(
    session: requests.Session,
    origin: str,
    path: Path,
    api_key: str | None,
    upload_config: dict[str, Any],
    max_downloads: int | None,
    expires_at: str | None,
) -> dict[str, Any]:
    prepare_body: dict[str, Any] = {
        "filename": path.name,
        "size": path.stat().st_size,
        "contentType": guess_content_type(path),
    }
    if api_key:
        prepare_body["apiKey"] = api_key
    if max_downloads is not None:
        prepare_body["maxDownloads"] = max_downloads
    if expires_at:
        prepare_body["expiresAt"] = expires_at

    prepared = api_json(
        session,
        "POST",
        f"{origin}/api/upload/prepare",
        json_body=prepare_body,
        headers=auth_headers(api_key),
        timeout=DEFAULT_TIMEOUT,
    )

    if prepared.get("mode") == "multipart":
        parts = upload_multipart_file(session, path, prepared)
        completed = complete_upload(session, origin, prepared["id"], None, parts, api_key=api_key)
        retries = 0
        while completed.get("missingParts") and retries < 3:
            retries += 1
            parts = upload_multipart_file(session, path, prepared, missing_parts=set(completed["missingParts"]), existing_parts=parts)
            completed = complete_upload(session, origin, prepared["id"], None, parts, api_key=api_key)
        if not completed.get("success"):
            raise OkFileError(str(completed.get("error") or "Upload complete failed"))
        return completed

    upload_etag = upload_single_file(session, path, prepared["uploadUrl"])
    completed = complete_upload(session, origin, prepared["id"], upload_etag, None, api_key=api_key)
    if not completed.get("success"):
        raise OkFileError(str(completed.get("error") or "Upload complete failed"))
    return completed


def upload_single_file(session: requests.Session, path: Path, upload_url: str) -> str:
    size = path.stat().st_size
    headers = {
        "Content-Type": guess_content_type(path),
        "Content-Length": str(size),
    }

    print(f"Uploading {path.name} ({size} bytes)", file=sys.stderr)
    body = path.read_bytes()
    response = request_or_error(
        session,
        "PUT",
        upload_url,
        data=body,
        headers=headers,
        timeout=UPLOAD_TIMEOUT,
    )

    if not response.ok:
        raise OkFileError(f"Signed upload failed with HTTP {response.status_code}: {response.text}")

    print_progress(size, size)
    print("", file=sys.stderr)
    return normalize_etag(response.headers.get("ETag", ""))


def upload_multipart_file(
    session: requests.Session,
    path: Path,
    prepared: dict[str, Any],
    missing_parts: set[int] | None = None,
    existing_parts: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    part_size = int(prepared["partSize"])
    uploaded_by_number = {int(item["partNumber"]): item for item in (existing_parts or [])}

    with path.open("rb") as handle:
        for part in prepared.get("parts", []):
            part_number = int(part["partNumber"])
            if missing_parts is not None and part_number not in missing_parts:
                continue
            start = (part_number - 1) * part_size
            handle.seek(start)
            chunk = handle.read(part_size)
            headers = {
                "Content-Length": str(len(chunk)),
                "Content-Type": "application/octet-stream",
            }
            response = request_or_error(
                session,
                "PUT",
                part["uploadUrl"],
                data=chunk,
                headers=headers,
                timeout=UPLOAD_TIMEOUT,
            )
            if not response.ok:
                raise OkFileError(
                    f"Multipart upload failed at part {part_number} with HTTP {response.status_code}: {response.text}"
                )
            uploaded_by_number[part_number] = {
                "partNumber": part_number,
                "etag": normalize_etag(response.headers.get("ETag", "")),
            }
            print(f"Uploaded part {part_number}/{prepared['totalParts']} for {path.name}", file=sys.stderr)

    return [uploaded_by_number[index] for index in sorted(uploaded_by_number)]


def complete_upload(
    session: requests.Session,
    origin: str,
    file_id: str,
    etag: str | None,
    parts: list[dict[str, Any]] | None,
    *,
    api_key: str | None,
) -> dict[str, Any]:
    body: dict[str, Any] = {"id": file_id}
    if etag:
        body["etag"] = etag
    if parts:
        body["parts"] = parts

    response = request_or_error(
        session,
        "POST",
        f"{origin}/api/upload/complete",
        headers={"Content-Type": "application/json", **auth_headers(api_key)},
        json=body,
        timeout=DEFAULT_TIMEOUT,
    )
    return decode_json_response(response, allow_error_json=True)


def api_json(
    session: requests.Session,
    method: str,
    url: str,
    *,
    json_body: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
    timeout: int = DEFAULT_TIMEOUT,
) -> dict[str, Any]:
    merged_headers = dict(headers or {})
    if json_body is not None:
        merged_headers.setdefault("Content-Type", "application/json")
    response = request_or_error(session, method, url, json=json_body, headers=merged_headers, timeout=timeout)
    return decode_json_response(response)


def request_or_error(session: requests.Session, method: str, url: str, **kwargs: Any) -> requests.Response:
    try:
        return session.request(method, url, **kwargs)
    except requests.ConnectionError as exc:
        raise OkFileError(f"Could not connect to {url}. Check --origin and your network connection.") from exc
    except requests.Timeout as exc:
        raise OkFileError(f"Request timed out for {method.upper()} {url}") from exc
    except requests.RequestException as exc:
        raise OkFileError(f"Request failed for {method.upper()} {url}: {exc}") from exc


def is_json_response(response: requests.Response) -> bool:
    content_type = response.headers.get("Content-Type", "").lower()
    return "application/json" in content_type or content_type.endswith("+json")


def decode_json_response(response: requests.Response, allow_error_json: bool = False) -> dict[str, Any]:
    try:
        data = response.json()
    except ValueError as exc:
        content_type = response.headers.get("Content-Type", "").strip() or "unknown"
        body_preview = response.text.strip().replace("\r", " ").replace("\n", " ")
        body_preview = body_preview[:160] + ("..." if len(body_preview) > 160 else "")
        if response.status_code == 404:
            raise OkFileError(
                f"Server returned HTTP 404 from {response.url}. The endpoint may be missing or the resource does not exist."
            ) from exc
        raise OkFileError(
            f"Server returned HTTP {response.status_code} with non-JSON content ({content_type}) from {response.url}. "
            f"Body preview: {body_preview or '<empty>'}"
        ) from exc

    if not response.ok and not allow_error_json:
        message = data.get("error") if isinstance(data, dict) else None
        raise OkFileError(str(message or f"HTTP {response.status_code}"))
    if not response.ok and allow_error_json:
        return data
    if not isinstance(data, dict):
        raise OkFileError("Server returned JSON that is not an object")
    return data


def print_upload_result(result: dict[str, Any], *, path: Path | None = None, elapsed_seconds: float | None = None) -> None:
    print("Upload complete")
    if path is not None:
        print(f"File: {path.name}")
        print(f"Size: {format_size(path.stat().st_size)}")
    if elapsed_seconds is not None:
        print(f"Elapsed: {format_duration(elapsed_seconds)}")
    print(f"ID: {result.get('id', '-')}")
    print(f"URL: {result.get('url', '-')}")
    print(f"Download URL: {result.get('downloadUrl', '-')}")
    print(f"Preview URL: {result.get('playUrl', '-')}")


def print_site_result(
    result: dict[str, Any],
    *,
    file_count: int | None = None,
    total_size: int | None = None,
    elapsed_seconds: float | None = None,
) -> None:
    print("Site publish complete")
    if file_count is not None:
        print(f"Files: {file_count}")
    if total_size is not None:
        print(f"Size: {format_size(total_size)}")
    if elapsed_seconds is not None:
        print(f"Elapsed: {format_duration(elapsed_seconds)}")
    print(f"Site ID: {result.get('siteId', '-')}")
    print(f"Site URL: {result.get('siteUrl', '-')}")
    print(f"Entry URL: {result.get('entryUrl', '-')}")
    print(f"Hostname: {result.get('siteHostname', '-')}")


def auth_headers(api_key: str | None) -> dict[str, str]:
    return {"X-API-Key": api_key} if api_key else {}


def validate_max_downloads(value: int | None) -> int | None:
    if value is None:
        return None
    if value <= 0:
        raise OkFileError("--max-downloads must be greater than 0")
    return value


def validate_expires_at(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    if not normalized:
        return None
    probe = normalized.replace("Z", "+00:00")
    try:
        dt.datetime.fromisoformat(probe)
    except ValueError as exc:
        raise OkFileError("--expires-at must be a valid ISO 8601 timestamp") from exc
    return normalized


def guess_content_type(path: Path) -> str:
    guessed, _ = mimetypes.guess_type(path.name)
    return guessed or "application/octet-stream"


def normalize_etag(value: str) -> str:
    return str(value or "").strip().removeprefix("W/").strip('"')


def iter_file(handle, total_size: int, chunk_size: int = 1024 * 1024):
    sent = 0
    while True:
        chunk = handle.read(chunk_size)
        if not chunk:
            break
        sent += len(chunk)
        print_progress(sent, total_size)
        yield chunk


def print_progress(done: int, total: int) -> None:
    if not PROGRESS_ENABLED:
        return
    if not sys.stderr.isatty():
        return
    total = max(total, 1)
    ratio = min(max(done / total, 0.0), 1.0)
    percent = int(ratio * 100)
    print(f"\rProgress: {percent:3d}% ({done}/{total} bytes)", end="", file=sys.stderr, flush=True)


def format_size(size: int) -> str:
    amount = max(int(size), 0)
    units = ["B", "KB", "MB", "GB", "TB"]
    value = float(amount)
    unit = units[0]
    for unit in units:
        if value < 1024 or unit == units[-1]:
            break
        value /= 1024
    if unit == "B":
        return f"{amount} B"
    precision = 1 if value >= 10 else 2
    return f"{value:.{precision}f} {unit} ({amount} bytes)"


def format_duration(seconds: float) -> str:
    elapsed = max(float(seconds), 0.0)
    if elapsed < 1:
        return f"{elapsed * 1000:.0f} ms"
    if elapsed < 60:
        return f"{elapsed:.2f} s"
    minutes, remaining = divmod(elapsed, 60)
    if minutes < 60:
        return f"{int(minutes)}m {remaining:.1f}s"
    hours, minutes = divmod(minutes, 60)
    return f"{int(hours)}h {int(minutes)}m {remaining:.0f}s"


def config_path() -> Path:
    if os.name == "nt":
        base = Path(os.environ.get("APPDATA", Path.home() / "AppData" / "Roaming"))
    else:
        base = Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config"))
    return base / "okfile" / "config.json"


def load_config() -> dict[str, Any]:
    path = config_path()
    if not path.is_file():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise OkFileError(f"Failed to read config file {path}: {exc}") from exc


def save_config(config: dict[str, Any]) -> None:
    path = config_path()
    if not config:
        try:
            path.unlink()
        except FileNotFoundError:
            pass
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(config, indent=2, sort_keys=True) + "\n", encoding="utf-8")


if __name__ == "__main__":
    raise SystemExit(main())
