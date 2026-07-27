#!/usr/bin/env python3
"""Download a corpus of real PDFs for the false-positive sweep.

    uv run python scripts/fetch_corpus.py /tmp/corpus
    CORPUS_DIR=/tmp/corpus pnpm sweep

Why this exists: every file in tests/fixtures/ was built to trip a detector.
That proves the detectors fire; it says nothing about how often they fire on
documents nobody designed to be caught, which is the number that decides
whether a visitor's first scan reads as a useful tool or as a smoke alarm.
The corpus is not committed — these are other people's documents, and 40 MB of
them — so this script rebuilds an equivalent one from public sources.

The exact papers change over time (arXiv is queried for the most recent
submissions), so re-running reproduces the method rather than the byte-identical
set. Category mix and document count are what matter.

Two kinds of source, deliberately:

  arXiv preprints across seven subject areas — different LaTeX toolchains and,
  more to the point, different figure pipelines, which is where sub-4pt text
  and white-on-dark labels come from.

  Government forms and an RFC — professionally typeset documents full of the
  things that look like hiding techniques and are not: white text on filled
  header bars, embedded files, tiny print.

Findings recorded on a 48-document corpus (42 arXiv + 6 forms/RFC) on
2026-07-28, after the near-white background check and the off-page fix:

    clean                 31/48 (65%)
    near_white_text        2/48   65 findings
    tiny_font             16/48 5294 findings
    embedded_files         2/48    2 findings
    the other seven        0/48    0 findings
"""

import os
import re
import sys
import time
import urllib.request
import xml.etree.ElementTree as ET

ARXIV_CATEGORIES = ["cs.CL", "cs.CR", "cs.LG", "math.AG", "hep-th", "q-bio.NC", "econ.EM"]

# Stable, publicly downloadable, and representative of the "ordinary business
# document" side of the corpus. A 404 here is not fatal — the sweep works on
# whatever was fetched.
DIRECT_URLS = [
    "https://www.irs.gov/pub/irs-pdf/f1040.pdf",
    "https://www.irs.gov/pub/irs-pdf/fw9.pdf",
    "https://www.irs.gov/pub/irs-pdf/f1099msc.pdf",
    "https://www.irs.gov/pub/irs-pdf/f8949.pdf",
    "https://www.irs.gov/pub/irs-pdf/p15.pdf",
    "https://www.rfc-editor.org/rfc/rfc9110.pdf",
]

UA = {"User-Agent": "whatsinmypdf-corpus/1.0 (+https://github.com/whatsinmypdf/whatsinmypdf)"}
PDF_DELAY = 3  # arXiv asks for a pause between requests; be a good citizen
QUERY_DELAY = 15


def get(url: str, timeout: int = 90) -> bytes:
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout).read()


def save_pdf(data: bytes, path: str) -> bool:
    if not data.startswith(b"%PDF"):
        print(f"  ! not a PDF, skipped: {os.path.basename(path)}", flush=True)
        return False
    with open(path, "wb") as f:
        f.write(data)
    print(f"  {os.path.basename(path)}  {len(data) / 1024:.0f} KB", flush=True)
    return True


def fetch_arxiv(out_dir: str, per_category: int) -> int:
    ns = {"a": "http://www.w3.org/2005/Atom"}
    count = 0
    for category in ARXIV_CATEGORIES:
        query = (
            "https://export.arxiv.org/api/query?"
            f"search_query=cat:{category}&start=0&max_results={per_category}"
            "&sortBy=submittedDate&sortOrder=descending"
        )
        feed = None
        for attempt in range(5):
            try:
                feed = ET.fromstring(get(query))
                break
            except Exception as e:  # noqa: BLE001 - the query API rate-limits; back off
                wait = 20 * (attempt + 1)
                print(f"  ! {category}: attempt {attempt + 1} failed ({e}); waiting {wait}s", flush=True)
                time.sleep(wait)
        if feed is None:
            print(f"  ! {category}: giving up", flush=True)
            continue

        for entry in feed.findall("a:entry", ns):
            arxiv_id = entry.find("a:id", ns).text.rsplit("/", 1)[-1]
            name = re.sub(r"[^A-Za-z0-9._-]", "_", f"{category}_{arxiv_id}") + ".pdf"
            path = os.path.join(out_dir, name)
            if os.path.exists(path):
                continue
            try:
                data = get(f"https://arxiv.org/pdf/{arxiv_id}")
            except Exception as e:  # noqa: BLE001 - one bad paper must not end the run
                print(f"  ! {arxiv_id}: {e}", flush=True)
                time.sleep(PDF_DELAY)
                continue
            if save_pdf(data, path):
                count += 1
            time.sleep(PDF_DELAY)
        time.sleep(QUERY_DELAY)
    return count


def fetch_direct(out_dir: str) -> int:
    count = 0
    for url in DIRECT_URLS:
        path = os.path.join(out_dir, os.path.basename(url))
        if os.path.exists(path):
            continue
        try:
            data = get(url)
        except Exception as e:  # noqa: BLE001
            print(f"  ! {url}: {e}", flush=True)
            continue
        if save_pdf(data, path):
            count += 1
        time.sleep(1)
    return count


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit("usage: fetch_corpus.py <output-dir> [papers-per-category]")
    out_dir = sys.argv[1]
    per_category = int(sys.argv[2]) if len(sys.argv) > 2 else 6
    os.makedirs(out_dir, exist_ok=True)

    print(f"arXiv ({len(ARXIV_CATEGORIES)} categories x {per_category}):", flush=True)
    n = fetch_arxiv(out_dir, per_category)
    print("forms and specifications:", flush=True)
    n += fetch_direct(out_dir)

    total = len([f for f in os.listdir(out_dir) if f.lower().endswith(".pdf")])
    print(f"\n{n} new, {total} PDFs total in {out_dir}")
    print(f"now run:  CORPUS_DIR={out_dir} pnpm sweep")


if __name__ == "__main__":
    main()
