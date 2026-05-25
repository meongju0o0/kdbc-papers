#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAPERS_ROOT = ROOT / "papers"

ISSUE_RE = re.compile(r"제\s*(\d+)\s*권\s*(\d+)\s*호")
VOL_NO_RE = re.compile(r"vol\s*(\d+)\s*_?\s*no\s*(\d+)", re.IGNORECASE)
AUTHOR_RE = re.compile(r"([가-힣]{2,4})\s*\([^\n\)]*\)\s*\d*")
FUNDING_RE = re.compile(
    r"(논문접수|심사완료|게재승인|이 논문은|이 연구는|본 연구는|본 논문은|연구결과로 수행|지원을 받아|사업의 일환|수행된 연구임|수행되었음)"
)


def run_pdftotext(pdf_path: Path) -> str:
    cmd = [
        "pdftotext",
        "-enc",
        "UTF-8",
        "-f",
        "1",
        "-l",
        "3",
        str(pdf_path),
        "-",
    ]
    result = subprocess.run(cmd, check=False, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"pdftotext failed: {pdf_path}: {result.stderr.strip()}")
    return result.stdout


def normalize_space(text: str) -> str:
    text = text.replace("\u00a0", " ")
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def split_lines(text: str) -> list[str]:
    return [ln.strip() for ln in text.splitlines() if ln.strip()]


def find_marker_index(lines: list[str], marker: str) -> int:
    compact_marker = marker.replace(" ", "")
    for idx, line in enumerate(lines):
        if marker in line:
            return idx
        if line.replace(" ", "") == compact_marker:
            return idx
    return -1


def find_any_marker_index(lines: list[str], markers: tuple[str, ...]) -> int:
    for marker in markers:
        idx = find_marker_index(lines, marker)
        if idx >= 0:
            return idx
    return -1


def line_looks_english(line: str) -> bool:
    if not line:
        return False
    alpha = re.findall(r"[A-Za-z]", line)
    if not alpha:
        return False
    return len(alpha) / max(len(line), 1) > 0.45


def line_looks_author(line: str) -> bool:
    if AUTHOR_RE.search(line):
        return True
    return bool(re.search(r"[가-힣]{2,4}\s*\([^\)]{2,}\)", line))


def extract_title(lines: list[str], abstract_idx: int) -> str:
    upper = lines[: abstract_idx if abstract_idx > 0 else min(len(lines), 30)]
    title_lines: list[str] = []

    for line in upper:
        compact = line.replace(" ", "")
        if compact in {"요약", "Abstract", "ABSTRACT"}:
            break
        if line_looks_author(line):
            break
        if line_looks_english(line):
            if title_lines:
                break
            continue
        if "한국데이터베이스" in line or "Korea Database" in line:
            continue
        if re.fullmatch(r"\d+", line):
            continue
        if re.search(r"[가-힣]", line):
            title_lines.append(line)

    if not title_lines:
        for line in upper:
            if re.search(r"[가-힣]", line):
                return normalize_space(line)
        return normalize_space(upper[0]) if upper else ""

    return normalize_space(" ".join(title_lines))


def extract_authors(lines: list[str], abstract_idx: int) -> str:
    section = "\n".join(lines[: abstract_idx if abstract_idx > 0 else min(len(lines), 50)])
    names: list[str] = []
    for match in AUTHOR_RE.finditer(section):
        name = match.group(1).strip()
        if name and name not in names:
            names.append(name)

    if names:
        return ", ".join(names)

    # Fallback for papers with unusual author formatting.
    candidates = re.findall(r"[가-힣]{2,4}", section)
    filtered: list[str] = []
    blocked = {"요약", "주제어", "논문", "접수", "심사", "완료", "게재", "승인", "한국", "데이터", "베이스", "학회"}
    for cand in candidates:
        if cand in blocked:
            continue
        if cand not in filtered:
            filtered.append(cand)
    return ", ".join(filtered[:6])


def clean_affiliation_line(line: str) -> str:
    text = re.sub(r"^\d+\s*", "", line).strip()
    text = re.sub(r"[†‡+*]+\s*", "", text)
    text = re.sub(r"\s+", " ", text)
    text = text.rstrip(".")
    return text


def trim_affiliation_segment(segment: str) -> str:
    segment = segment.strip().rstrip(".")
    if not segment:
        return ""

    bad_tokens = (
        "교수",
        "교신저자",
        "석사과정",
        "박사과정",
        "박사후연구원",
        "박사후 연구원",
        "석사",
        "박사",
        "연구원",
        "부교수",
        "조교수",
        "전임교원",
        "겸임교수",
    )
    if segment in bad_tokens:
        return ""

    if re.fullmatch(r"\d+", segment):
        return ""

    if any(token in segment for token in bad_tokens) and not any(
        token in segment for token in ("대학교", "대학", "연구소", "센터", "학과", "학부", "학원", "회사", "원")
    ):
        return ""

    institution_tokens = ("대학교", "대학", "연구소", "센터", "학과", "학부", "학원", "회사", "병원", "원", "학교")
    if not any(token in segment for token in institution_tokens):
        return ""

    # Keep only the institutional portion if the line also contains role/degree details.
    for separator in (",", "("):
        if separator in segment:
            head = segment.split(separator, 1)[0].strip()
            if any(token in head for token in institution_tokens):
                segment = head
                break

    return segment


def extract_affiliation(lines: list[str], abstract_idx: int) -> str:
    keyword_idx = find_any_marker_index(lines, ("주제어", "중심어", "Keywords", "Key words"))
    english_idx = find_any_marker_index(lines, ("Abstract", "ABSTRACT"))

    if keyword_idx >= 0:
        scan = lines[keyword_idx + 1:]
    elif abstract_idx >= 0 and english_idx > abstract_idx:
        scan = lines[abstract_idx + 1:]
    else:
        scan = lines[max(0, abstract_idx): min(len(lines), max(0, abstract_idx) + 140)]

    affiliations: list[str] = []
    pending_number = False
    for line in scan:
        compact = line.replace(" ", "")
        funding_match = FUNDING_RE.search(line)
        if funding_match:
            if affiliations:
                prefix = line[:funding_match.start()].strip()
                if prefix:
                    cleaned_prefix = clean_affiliation_line(prefix)
                    if cleaned_prefix:
                        parts = [trim_affiliation_segment(part) for part in cleaned_prefix.split(",")]
                        for part in parts:
                            if part and part not in affiliations:
                                affiliations.append(part)
                break
            continue
        if compact in {"Abstract", "ABSTRACT"} or line.startswith("Abstract"):
            break
        if re.fullmatch(r"[+†‡*]?\d+[+†‡*]?", compact):
            pending_number = True
            continue

        cleaned = clean_affiliation_line(line)
        if not cleaned:
            continue

        if re.match(r"^[+†‡*]\s*", cleaned):
            continue

        if pending_number:
            pending_number = False
            candidate = trim_affiliation_segment(cleaned)
            if candidate and candidate not in affiliations:
                affiliations.append(candidate)
            continue

        if re.match(r"^\d+\s+", cleaned):
            cleaned = re.sub(r"^\d+\s*", "", cleaned).strip()

        if "," in cleaned:
            parts = [trim_affiliation_segment(part) for part in cleaned.split(",")]
            for part in parts:
                if part and part not in affiliations:
                    affiliations.append(part)
            continue

        candidate = trim_affiliation_segment(cleaned)
        if candidate and candidate not in affiliations:
            affiliations.append(candidate)

    if affiliations:
        return ", ".join(affiliations)

    return "미상"


def extract_korean_abstract(lines: list[str]) -> str:
    abs_idx = find_marker_index(lines, "요 약")
    if abs_idx < 0:
        abs_idx = find_marker_index(lines, "요약")

    key_idx = -1
    for i in range(abs_idx + 1 if abs_idx >= 0 else 0, len(lines)):
        compact = lines[i].replace(" ", "")
        if compact.startswith("주제어") or compact.startswith("중심어"):
            key_idx = i
            break
        if lines[i].startswith("Abstract") or compact == "Abstract":
            key_idx = i
            break

    if abs_idx >= 0 and key_idx > abs_idx:
        body = lines[abs_idx + 1:key_idx]
        # Remove obvious footnotes in the abstract section.
        body = [ln for ln in body if not re.match(r"^[+†‡*]\s*", ln)]
        return normalize_space(" ".join(body))

    # Fallback: return empty string rather than wrong language summary.
    return ""


def parse_issue_dir(issue_dir: Path) -> tuple[int, int]:
    m = ISSUE_RE.search(issue_dir.name) or VOL_NO_RE.search(issue_dir.name)
    if not m:
        raise ValueError(f"Cannot parse vol/no from folder name: {issue_dir}")
    return int(m.group(1)), int(m.group(2))


def build_entry(pdf_path: Path, vol: int, no: int) -> dict[str, object]:
    raw_text = run_pdftotext(pdf_path)
    lines = split_lines(raw_text)
    abs_idx = find_marker_index(lines, "요 약")
    if abs_idx < 0:
        abs_idx = find_marker_index(lines, "요약")

    title = extract_title(lines, abs_idx)
    authors = extract_authors(lines, abs_idx)
    affiliation = extract_affiliation(lines, abs_idx)
    abstracted_text = extract_korean_abstract(lines)

    return {
        "title": title,
        "vol": vol,
        "no": no,
        "authors": authors,
        "affiliation": affiliation,
        "abstracted_text": abstracted_text,
        "pdf_path": f"./{pdf_path.name}",
    }


def main() -> int:
    issue_dirs = sorted([d for d in PAPERS_ROOT.iterdir() if d.is_dir()])
    total_papers = 0

    for issue_dir in issue_dirs:
        vol, no = parse_issue_dir(issue_dir)
        pdfs = sorted([p for p in issue_dir.iterdir() if p.is_file() and p.suffix.lower() == ".pdf"], key=lambda p: p.name)
        if not pdfs:
            continue

        papers = [build_entry(pdf_path, vol, no) for pdf_path in pdfs]
        total_papers += len(papers)

        output_path = issue_dir / "papers.json"
        with output_path.open("w", encoding="utf-8") as f:
            json.dump({"papers": papers}, f, ensure_ascii=False, indent=2)
            f.write("\n")

        print(f"[OK] {issue_dir.name}: {len(papers)} papers -> {output_path}")

    print(f"[DONE] generated papers.json for {len(issue_dirs)} issue directories, total papers={total_papers}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
