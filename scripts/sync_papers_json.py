#!/usr/bin/env python3
"""DB → papers.json 동기화 스크립트

서버 DB(kdbc.sqlite)에 등록된 논문 정보를 읽어
papers/vol{}_no{}/papers.json 파일의 다음 필드를 갱신합니다:
  - title
  - authors
  - affiliation
  - abstracted_text

매칭 기준 (우선순위):
  1. PDF 파일 SHA-256 해시 비교 (100% 정확)
  2. 정규화된 제목 일치
  매칭 실패 시 해당 항목 건너뜀

Usage:
  python scripts/sync_papers_json.py [--db <db_path>] [--dry-run]
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAPERS_ROOT = ROOT / "papers"
UPLOADS_ROOT = ROOT / "backend" / "uploads" / "papers"
DEFAULT_DB = ROOT / "backend" / "data" / "kdbc.sqlite"

VOL_NO_RE = re.compile(r"vol(\d+)_no(\d+)", re.IGNORECASE)
UPDATE_FIELDS = ("title", "authors", "affiliation", "abstracted_text")


def normalize_title(text: str) -> str:
    """공백 정규화 후 소문자 변환 (매칭 용)"""
    return re.sub(r"\s+", " ", text).strip().lower()


def file_sha256(path: Path) -> str | None:
    """파일의 SHA-256 해시 반환. 파일이 없으면 None."""
    try:
        h = hashlib.sha256()
        with path.open("rb") as f:
            for chunk in iter(lambda: f.read(65536), b""):
                h.update(chunk)
        return h.hexdigest()
    except OSError:
        return None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="DB → papers.json 필드 동기화"
    )
    parser.add_argument(
        "--db",
        default=str(DEFAULT_DB),
        help=f"SQLite DB 경로 (기본값: {DEFAULT_DB})",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="변경 내용을 출력만 하고 파일을 저장하지 않음",
    )
    return parser.parse_args()


def fetch_papers_by_vol_no(
    con: sqlite3.Connection, vol: int, no: int
) -> list[dict]:
    """DB에서 특정 vol/no의 논문 목록을 id 순으로 반환"""
    cur = con.execute(
        "SELECT id, title, authors, affiliation, abstracted_text, pdf_url "
        "FROM papers WHERE vol = ? AND no = ? ORDER BY id",
        (vol, no),
    )
    cols = [d[0] for d in cur.description]
    return [dict(zip(cols, row)) for row in cur.fetchall()]


def build_hash_map(db_papers: list[dict]) -> dict[str, dict]:
    """업로드된 PDF SHA-256 해시 → DB 레코드 매핑 구축.

    pdf_url 예: /uploads/papers/1777207430870-[01]007.pdf
    실제 파일:   backend/uploads/papers/1777207430870-[01]007.pdf
    """
    hash_map: dict[str, dict] = {}
    for paper in db_papers:
        pdf_url = paper.get("pdf_url") or ""
        if not pdf_url:
            continue
        filename = Path(pdf_url).name
        uploaded_path = UPLOADS_ROOT / filename
        digest = file_sha256(uploaded_path)
        if digest:
            hash_map[digest] = paper
    return hash_map


def build_local_hash_map(issue_dir: Path) -> dict[str, Path]:
    """issue_dir 내 PDF 파일 SHA-256 해시 → 파일 경로 매핑 구축."""
    local_map: dict[str, Path] = {}
    if not issue_dir.is_dir():
        return local_map
    for pdf_file in sorted(issue_dir.glob("*.pdf")):
        digest = file_sha256(pdf_file)
        if digest:
            local_map[digest] = pdf_file
    return local_map


def create_json_file(
    json_path: Path,
    vol: int,
    no: int,
    db_papers: list[dict],
    dry_run: bool,
) -> int:
    """papers.json이 없는 경우 DB 데이터로 신규 생성. 생성된 논문 수 반환."""
    issue_dir = json_path.parent
    issue_dir.mkdir(parents=True, exist_ok=True)

    # 로컬 PDF 해시 맵 (업로드 해시와 교차 매칭하여 pdf_path 복원)
    upload_hash_to_db = build_hash_map(db_papers)
    local_hash_to_path = build_local_hash_map(issue_dir)

    # 업로드 해시 기준으로 로컬 PDF 경로 역매핑
    db_id_to_local_pdf: dict[int, Path] = {}
    for digest, local_path in local_hash_to_path.items():
        if digest in upload_hash_to_db:
            db_record = upload_hash_to_db[digest]
            db_id_to_local_pdf[db_record["id"]] = local_path

    papers_list = []
    for paper in db_papers:
        local_pdf = db_id_to_local_pdf.get(paper["id"])
        pdf_path = f"./{local_pdf.name}" if local_pdf else None

        entry = {
            "title": paper["title"],
            "vol": vol,
            "no": no,
            "authors": paper["authors"],
            "affiliation": paper["affiliation"],
            "abstracted_text": paper.get("abstracted_text"),
            "pdf_path": pdf_path,
        }
        papers_list.append(entry)

    matched = sum(1 for p in papers_list if p["pdf_path"] is not None)
    unmatched = len(papers_list) - matched

    if not dry_run:
        with json_path.open("w", encoding="utf-8") as f:
            json.dump({"papers": papers_list}, f, ensure_ascii=False, indent=2)

    print(f"  [CREATE] {len(papers_list)}개 논문 생성 (pdf 매칭: {matched}개", end="")
    if unmatched:
        print(f", 미매칭: {unmatched}개)", end="")
    print(")")

    return len(papers_list)


def build_title_map(db_papers: list[dict]) -> dict[str, dict]:
    """정규화된 제목 → DB 레코드 매핑"""
    return {normalize_title(p["title"]): p for p in db_papers}


def match_paper(
    json_paper: dict,
    hash_map: dict[str, dict],
    title_map: dict[str, dict],
    issue_dir: Path,
) -> tuple[dict | None, str]:
    """JSON 항목에 대응하는 DB 레코드 탐색.

    1순위: PDF SHA-256 해시 일치
    2순위: 정규화 제목 일치
    실패 시: (None, 실패 사유)
    """
    # 1순위: PDF 해시 비교
    pdf_path_str = json_paper.get("pdf_path", "")
    if pdf_path_str and hash_map:
        local_pdf = (issue_dir / pdf_path_str).resolve()
        digest = file_sha256(local_pdf)
        if digest and digest in hash_map:
            return hash_map[digest], "hash"
        if digest and digest not in hash_map:
            # 해시 계산은 됐지만 DB에 없는 경우 → 제목으로 폴백
            pass

    # 2순위: 정규화 제목
    norm = normalize_title(json_paper.get("title", ""))
    if norm and norm in title_map:
        return title_map[norm], "title"

    return None, "no_match"


def sync_json_file(
    json_path: Path,
    vol: int,
    no: int,
    con: sqlite3.Connection,
    db_papers: list[dict],
    dry_run: bool,
) -> tuple[int, int]:
    """단일 papers.json 동기화. (updated, skipped) 개수 반환"""
    issue_dir = json_path.parent

    with json_path.open("r", encoding="utf-8") as f:
        data = json.load(f)

    papers_list: list[dict] = data.get("papers", [])
    if not papers_list:
        print(f"  [SKIP] 빈 파일: {json_path.relative_to(ROOT)}")
        return 0, 0

    hash_map = build_hash_map(db_papers)
    title_map = build_title_map(db_papers)
    updated = skipped = 0

    for idx, paper in enumerate(papers_list):
        db_rec, method = match_paper(paper, hash_map, title_map, issue_dir)
        if db_rec is None:
            print(
                f"  [WARN] 매칭 실패 (idx={idx}): \"{paper.get('title', '')}\" → 건너뜀"
            )
            skipped += 1
            continue

        changed_fields: list[str] = []
        for field in UPDATE_FIELDS:
            old_val = paper.get(field)
            new_val = db_rec.get(field)
            if old_val != new_val:
                if not dry_run:
                    paper[field] = new_val
                changed_fields.append(field)

        if changed_fields:
            updated += 1
            label = paper.get("title") or db_rec.get("title", "(제목 없음)")
            method_tag = f"[{method}]"
            print(f"  [UPDATE]{method_tag} \"{label[:50]}\" → {', '.join(changed_fields)}")

    if not dry_run and updated > 0:
        data["papers"] = papers_list
        with json_path.open("w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    return updated, skipped


def main() -> None:
    args = parse_args()
    db_path = Path(args.db)

    if not db_path.exists():
        print(f"[ERROR] DB 파일을 찾을 수 없습니다: {db_path}", file=sys.stderr)
        sys.exit(1)

    if not PAPERS_ROOT.exists():
        print(f"[ERROR] papers 디렉토리를 찾을 수 없습니다: {PAPERS_ROOT}", file=sys.stderr)
        sys.exit(1)

    con = sqlite3.connect(str(db_path))
    con.row_factory = None

    # DB에 등록된 모든 (vol, no) 조합 수집
    cur = con.execute(
        "SELECT DISTINCT vol, no FROM papers ORDER BY vol, no"
    )
    db_issues = [(row[0], row[1]) for row in cur.fetchall()]

    if not db_issues:
        print("[WARN] DB에 논문 데이터가 없습니다.")
        con.close()
        return

    total_updated = total_created = total_skipped = 0
    processed = 0

    prefix = "[DRY-RUN] " if args.dry_run else ""
    print(f"{prefix}DB: {db_path}")
    print(f"{prefix}papers 루트: {PAPERS_ROOT}\n")

    for vol, no in db_issues:
        issue_dir = PAPERS_ROOT / f"vol{vol}_no{no}"
        json_path = issue_dir / "papers.json"

        db_papers = fetch_papers_by_vol_no(con, vol, no)
        if not db_papers:
            continue

        processed += 1
        print(f"{prefix}vol={vol}, no={no}  ({json_path.relative_to(ROOT)})")

        if not json_path.exists():
            # papers.json 없음 → 신규 생성
            created = create_json_file(json_path, vol, no, db_papers, args.dry_run)
            total_created += created
        else:
            # papers.json 있음 → 동기화
            updated, skipped = sync_json_file(json_path, vol, no, con, db_papers, args.dry_run)
            total_updated += updated
            total_skipped += skipped

    con.close()

    print(f"\n{'='*50}")
    print(f"{prefix}처리된 이슈: {processed}개")
    if total_created:
        print(f"{prefix}신규 생성 논문: {total_created}개")
    print(f"{prefix}갱신된 논문: {total_updated}개")
    if total_skipped:
        print(f"{prefix}건너뜀: {total_skipped}개 (매칭 실패)")
    if args.dry_run:
        print("\n※ --dry-run 모드: 파일이 저장되지 않았습니다.")


if __name__ == "__main__":
    main()
