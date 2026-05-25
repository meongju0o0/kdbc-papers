#!/usr/bin/env python3
"""Bulk upload papers from a JSON file to backend API.

JSON format:
{
  "papers": [
    {
      "title": "논문 제목",
      "vol": 41,
      "no": 3,
      "authors": "신주영, 이영구",
      "affiliation": "경희대학교 인공지능학과",
      "abstracted_text": "Recent advances in large language models (LLMs) have rapidly increased the supported context length from thousands to millions of tokens, enabling applications such as long-form reasoning, agent-based interaction, and full-document understanding. However, long-context inference introduces a critical systems bottleneck: the explosive growth of the key-value (KV) cache, which exceeds GPU memory capacity and necessitates frequent offloading to CPU memory. This results in significant latency dominated by PCIe data transfer rather than computation. Existing lossless long-context decoding methods primarily focus on reducing computational overhead, but fail to effectively address the offloading bottleneck due to limited acceptance rates and misalignment between draft and target models. Meanwhile, sparse attention methods reduce memory usage but suffer from degraded decoding quality over long sequences due to limited KV cache budget. In this paper, we propose SparseSpec, an offloading-aware speculative decoding framework for lossless long-context LLM inference acceleration. SparseSpec employes a weight-sharing design where a sparse-attention-based draft model operates entirely within GPU memory, while a full-attention target model verifies using the complete KV cache, including offloaded memory. By maximizing acceptance length and minimizaing verification frequency, SparseSpec significantly reduces KV cache transfer overhead. Additionally, we introduce a dynamic KV cache update mechanism that leverages target-side attention scores to refine the sparse cache, improving alignment during long decoding.",
      "pdf_path": "./pdfs/paper1.pdf"
    }
  ]
}

You can also provide a top-level array instead of {"papers": [...]}.
"""

from __future__ import annotations

import argparse
import json
import sys
import uuid
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Set, Tuple
from urllib import error, request


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Upload multiple papers from JSON to backend /api/papers endpoint."
    )
    parser.add_argument("--json", required=True, help="Path to input JSON file")
    parser.add_argument(
        "--base-url",
        default="http://localhost:4000",
        help="Backend base URL (default: http://localhost:4000)",
    )
    parser.add_argument("--token", help="Bearer token (if omitted, login is used)")
    parser.add_argument("--username", help="Login username")
    parser.add_argument("--password", help="Login password")
    parser.add_argument(
        "--continue-on-error",
        action="store_true",
        help="Continue uploading next items even if one item fails",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate and print payload info without API calls",
    )
    parser.add_argument(
        "--skip-health-check",
        action="store_true",
        help="Skip /api/health preflight check",
    )
    parser.add_argument(
        "--skip-issue-check",
        action="store_true",
        help="Skip preflight check for existing (vol,no) in paper issues",
    )
    return parser.parse_args()


def read_json_file(json_path: Path) -> List[Dict[str, Any]]:
    with json_path.open("r", encoding="utf-8") as f:
        payload = json.load(f)

    if isinstance(payload, list):
        papers = payload
    elif isinstance(payload, dict) and isinstance(payload.get("papers"), list):
        papers = payload["papers"]
    else:
        raise ValueError("JSON must be a list or an object containing a 'papers' list.")

    normalized: List[Dict[str, Any]] = []
    for idx, item in enumerate(papers, start=1):
        if not isinstance(item, dict):
            raise ValueError(f"papers[{idx - 1}] must be an object.")
        normalized.append(item)

    return normalized


def ensure_required_fields(item: Dict[str, Any], index: int) -> None:
    required = ["title", "vol", "no", "authors", "affiliation"]
    missing = [k for k in required if str(item.get(k, "")).strip() == ""]
    if missing:
        raise ValueError(f"papers[{index}] missing required fields: {', '.join(missing)}")

    try:
        volume = int(item.get("vol"))
        issue_no = int(item.get("no"))
    except (TypeError, ValueError) as exc:
        raise ValueError(f"papers[{index}] vol/no must be integers.") from exc

    if volume < 1 or issue_no < 1:
        raise ValueError(f"papers[{index}] vol/no must be >= 1.")


def build_multipart_body(
    fields: Dict[str, str],
    pdf_path: Optional[Path],
) -> Tuple[bytes, str]:
    boundary = f"----kdbc-boundary-{uuid.uuid4().hex}"
    lines: List[bytes] = []

    for key, value in fields.items():
        lines.append(f"--{boundary}\r\n".encode("utf-8"))
        lines.append(
            f'Content-Disposition: form-data; name="{key}"\r\n\r\n'.encode("utf-8")
        )
        lines.append(value.encode("utf-8"))
        lines.append(b"\r\n")

    if pdf_path is not None:
        pdf_bytes = pdf_path.read_bytes()
        file_name = pdf_path.name
        lines.append(f"--{boundary}\r\n".encode("utf-8"))
        lines.append(
            (
                "Content-Disposition: form-data; "
                f'name="pdf"; filename="{file_name}"\r\n'
            ).encode("utf-8")
        )
        lines.append(b"Content-Type: application/pdf\r\n\r\n")
        lines.append(pdf_bytes)
        lines.append(b"\r\n")

    lines.append(f"--{boundary}--\r\n".encode("utf-8"))
    body = b"".join(lines)
    return body, boundary


def http_json_request(
    method: str,
    url: str,
    headers: Dict[str, str],
    body: Optional[bytes],
) -> Tuple[int, Dict[str, Any], str]:
    req = request.Request(url=url, data=body, headers=headers, method=method)

    try:
        with request.urlopen(req) as resp:
            status = resp.getcode()
            raw_text = resp.read().decode("utf-8", errors="replace")
    except error.HTTPError as e:
        status = e.code
        raw_text = e.read().decode("utf-8", errors="replace")
    except error.URLError as e:
        raise RuntimeError(f"Network error while calling {url}: {e}") from e

    parsed: Dict[str, Any] = {}
    if raw_text.strip():
        try:
            parsed = json.loads(raw_text)
        except json.JSONDecodeError:
            parsed = {"raw": raw_text}

    return status, parsed, raw_text


def login_and_get_token(base_url: str, username: str, password: str) -> str:
    login_url = f"{base_url.rstrip('/')}/api/auth/login"
    body = json.dumps({"username": username, "password": password}).encode("utf-8")
    status, data, raw = http_json_request(
        "POST",
        login_url,
        headers={"Content-Type": "application/json"},
        body=body,
    )

    if status != 200 or not isinstance(data.get("token"), str):
        message = data.get("message") if isinstance(data, dict) else None
        raise RuntimeError(
            f"Login failed (HTTP {status}). {message or raw or 'No response body.'}"
        )

    return data["token"]


def run_health_check(base_url: str) -> None:
    health_url = f"{base_url.rstrip('/')}/api/health"
    status, data, raw = http_json_request("GET", health_url, headers={}, body=None)
    if status != 200:
        raise RuntimeError(f"Health check failed (HTTP {status}): {raw}")

    if not isinstance(data, dict) or data.get("status") != "ok" or data.get("db") is not True:
        raise RuntimeError(
            "Health check response is not ready for uploads. "
            f"Expected status=ok and db=true, got: {data}"
        )


def fetch_issue_pairs(base_url: str) -> Set[Tuple[str, str]]:
    issues_url = f"{base_url.rstrip('/')}/api/papers/issues"
    status, data, raw = http_json_request("GET", issues_url, headers={}, body=None)
    if status != 200:
        raise RuntimeError(f"Failed to fetch issues (HTTP {status}): {raw}")
    if not isinstance(data, list):
        raise RuntimeError("Unexpected issues response format. Expected a JSON array.")

    pairs: Set[Tuple[str, str]] = set()
    for row in data:
        if not isinstance(row, dict):
            continue
        vol = row.get("volume")
        issue_no = row.get("issue_no")
        if vol is None or issue_no is None:
            continue
        pairs.add((str(vol), str(issue_no)))
    return pairs


def preflight_validate_issue_pairs(
    upload_rows: List[Tuple[int, Dict[str, str], Optional[Path]]],
    issue_pairs: Set[Tuple[str, str]],
) -> None:
    missing: List[str] = []
    for idx, fields, _ in upload_rows:
        key = (fields["vol"], fields["no"])
        if key not in issue_pairs:
            missing.append(f"papers[{idx - 1}] -> vol={fields['vol']}, no={fields['no']}")

    if missing:
        joined = "\n".join(missing)
        raise RuntimeError(
            "Preflight failed: some papers reference missing issues. "
            "Create these in 권(호) 관리 first:\n"
            f"{joined}"
        )


def resolve_pdf_path(raw_path: str, json_file_dir: Path) -> Path:
    p = Path(raw_path)
    if not p.is_absolute():
        p = (json_file_dir / p).resolve()
    return p


def iter_upload_payloads(
    papers: List[Dict[str, Any]],
    json_file_dir: Path,
) -> Iterable[Tuple[int, Dict[str, str], Optional[Path]]]:
    for idx, paper in enumerate(papers, start=1):
        ensure_required_fields(paper, idx - 1)

        fields = {
            "title": str(paper["title"]).strip(),
            "vol": str(paper["vol"]).strip(),
            "no": str(paper["no"]).strip(),
            "authors": str(paper["authors"]).strip(),
            "affiliation": str(paper["affiliation"]).strip(),
            "abstracted_text": str(paper.get("abstracted_text", "")).strip(),
        }

        pdf_path: Optional[Path] = None
        raw_pdf_path = str(paper.get("pdf_path", "")).strip()
        if raw_pdf_path:
            pdf_path = resolve_pdf_path(raw_pdf_path, json_file_dir)
            if not pdf_path.exists():
                raise FileNotFoundError(f"papers[{idx - 1}] pdf not found: {pdf_path}")
            if pdf_path.suffix.lower() != ".pdf":
                raise ValueError(f"papers[{idx - 1}] pdf_path must end with .pdf: {pdf_path}")

        yield idx, fields, pdf_path


def upload_papers(args: argparse.Namespace) -> int:
    json_path = Path(args.json).resolve()
    if not json_path.exists():
        raise FileNotFoundError(f"JSON file not found: {json_path}")

    papers = read_json_file(json_path)
    if not papers:
        print("No papers found in JSON.")
        return 0

    upload_rows = list(iter_upload_payloads(papers, json_path.parent))

    if not args.dry_run and not args.skip_health_check:
        run_health_check(args.base_url)
        print("[CHECKPOINT] /api/health passed (status=ok, db=true)")

    token = args.token
    if not token and args.username and args.password:
        token = login_and_get_token(args.base_url, args.username, args.password)
        print("[CHECKPOINT] login succeeded")
    if not token and not args.dry_run:
        raise ValueError("Provide --token or both --username and --password.")

    if not args.dry_run and not args.skip_issue_check:
        issue_pairs = fetch_issue_pairs(args.base_url)
        preflight_validate_issue_pairs(upload_rows, issue_pairs)
        print("[CHECKPOINT] issue pair validation passed")

    post_url = f"{args.base_url.rstrip('/')}/api/papers"
    success = 0
    failure = 0

    for idx, fields, pdf_path in upload_rows:
        title = fields.get("title", "")

        if args.dry_run:
            pdf_label = str(pdf_path) if pdf_path else "(no pdf)"
            print(f"[DRY-RUN] #{idx}: {title} | vol={fields['vol']} no={fields['no']} | {pdf_label}")
            continue

        body, boundary = build_multipart_body(fields, pdf_path)
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        }
        status, data, raw = http_json_request("POST", post_url, headers=headers, body=body)

        if status in (200, 201):
            success += 1
            paper_id = data.get("id") if isinstance(data, dict) else None
            print(f"[OK] #{idx}: {title} (id={paper_id})")
        else:
            failure += 1
            message = data.get("message") if isinstance(data, dict) else raw
            print(f"[FAIL] #{idx}: {title} | HTTP {status} | {message}")
            if not args.continue_on_error:
                break

    if args.dry_run:
        print(f"Dry-run complete. Validated {len(papers)} item(s).")
        return 0

    print(f"Upload complete. success={success}, failure={failure}")
    return 0 if failure == 0 else 1


def main() -> int:
    args = parse_args()
    try:
        return upload_papers(args)
    except Exception as exc:  # noqa: BLE001
        print(f"Error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
