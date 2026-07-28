# WhatsInMyPDF

Find hidden content in PDFs — white-on-white text, invisible render modes, tiny
fonts, hidden layers, embedded files/JavaScript, and prompt-injection phrasing
aimed at AI reviewers — entirely in your browser.

Live at [whatsinmypdf.com](https://whatsinmypdf.com). Pushes to `main` deploy
automatically via GitHub Actions after the test suite passes.

## Privacy model

The scan runs 100% locally. The PDF is parsed and analyzed by [mupdf](https://www.npmjs.com/package/mupdf)
compiled to WebAssembly, running inside a Web Worker in the visitor's own
browser. The file is never uploaded to any server, and no scan results are
sent anywhere either.

This isn't just a claim in the copy: `tests/e2e/scan.spec.ts` includes a test
("no network request carries the PDF, and WASM only loads after a scan is
requested") that asserts on the page's actual network traffic during a scan.
If a future change accidentally introduced an upload, that test would fail.

The site ships with no analytics or tracking scripts of any kind, and no
third party is allowed to run one: the CSP in `public/_headers` permits
scripts from this origin only. Cloudflare Web Analytics was briefly injected
at the edge by a zone-level setting — that setting is off, and
`tests/smoke/prod.spec.ts` asserts that a live scan on the deployed site
contacts no host but its own origin.

## License

AGPL-3.0-or-later. This is required because the scanner bundles mupdf's WASM
build, and mupdf itself is AGPL-licensed — any product built on top of it
(including this site) must be distributed under a compatible copyleft license.
See `LICENSE`.

## Relationship to the reference scanner

The detection logic in `src/lib/scanner/` (`detect.ts`, `patterns.ts`,
`mupdfAdapter.ts`) is a TypeScript/WASM port of a Python reference
implementation: a local PyMuPDF-based scanner script (`scan_pdf.py`) this
project derives from. The ten finding categories, thresholds, and injection-pattern
list are intentionally kept in parity with that script so the two
implementations agree on the same input file. `tests/fixtures/EXPECTED.md`
documents a few places where perfect parity wasn't reachable (e.g.
`offpage.pdf`) and why, verified against the reference scanner's actual
output rather than the original plan's assumptions.

One divergence is deliberate. `near_white_text` here also looks at what is
painted *behind* the text: for pages containing near-white runs, the adapter
renders the page and measures how dark the pixels under each run are, and a run
sitting on a visibly darker background is not reported. The reference script
compares text colour alone, which means it flags every white-on-dark form
header, table header row and figure label as hidden text. On a 48-document
corpus of real papers and government forms that accounted for all 170
near-white findings; with the background check, 2 documents still report, one
of them genuinely invisible text (0.01pt white runs in an IRS publication).
Rendering is bounded: only pages that contain near-white text are rendered, at
most 40 per document, and any failure leaves the runs unmeasured and reported
as before. See `tests/sweep/` for the measurement harness.

A second divergence covers off-page text. PDF engines clip text extraction to
the CropBox, so text parked outside the visible page never reaches the
detectors at all — including the injection patterns, which is why the
reference scanner reports nothing for `tests/fixtures/offpage.pdf` even though
the file contains an injection phrase. The adapter widens the CropBox to the
MediaBox before extracting and maps the original crop through the page
transform (so rotation and a non-zero crop origin are handled) to decide which
runs are off-page. Text beyond the MediaBox is still out of reach: that is off
the sheet of paper, not merely cropped away.

## Dev commands

```bash
pnpm install
pnpm dev        # local dev server
pnpm build      # static build to dist/
pnpm preview    # serve the built dist/ locally
pnpm test       # vitest unit tests (all passing)
pnpm e2e        # playwright e2e tests against a local build (all passing)
pnpm smoke      # playwright tests against the live site, run after every deploy
pnpm sweep      # false-positive measurement; needs CORPUS_DIR (see below)
```

## Regenerating test fixtures

The fixture PDFs under `tests/fixtures/` are generated, not hand-authored:

```bash
uv run --with pymupdf python scripts/make_fixtures.py
```

Each fixture's expected finding counts are cross-validated by running the
reference Python scanner against the same generated file and comparing
output; see `tests/fixtures/EXPECTED.md` for the full cross-validation table
and the ground-truth counts the unit tests assert against.

Fixtures are count-stable (regenerating produces PDFs with the same findings
and the same per-category counts) but not byte-reproducible — PyMuPDF embeds
a `CreationDate` timestamp in each saved PDF, so the file bytes (and hashes)
differ between runs even though the content and detected findings don't.

## Measuring false positives against real documents

Every fixture was built to trip a detector, which proves the detectors fire and
says nothing about how often they fire on documents nobody designed to be
caught. That second number is the one that decides whether a visitor's first
scan reads as a useful tool or as a smoke alarm, so it is measured rather than
assumed:

```bash
uv run python scripts/fetch_corpus.py /tmp/corpus   # ~48 real PDFs, a few minutes
CORPUS_DIR=/tmp/corpus pnpm sweep
```

The corpus is not committed (other people's documents, tens of megabytes); the
script rebuilds an equivalent one from public sources — recent arXiv preprints
across seven subject areas, four IRS forms and an RFC. arXiv is queried for the
newest submissions, so a re-run reproduces the method rather than the identical
files.

`pnpm sweep` prints per-category hit rates and every finding, and asserts only
one thing: that no real document made the scanner throw. It is a measurement,
not a gate, and it is not part of `pnpm test` — it needs a corpus that is not
in the repo.

On a 48-document corpus (2026-07-28): 31 of 48 clean, `tiny_font` on 16 files
(scaled-down charts, which is why that category is labelled high false-positive
risk and collapsed in the report), `near_white_text` on 2 (one of them
genuinely invisible text — 0.01pt white runs in an IRS publication),
`embedded_files` on 2 (an RFC carrying its own XML source, an IRS publication
carrying Distiller settings), and nothing at all from the other eight
categories.

The two "try an example" demo files under `public/demo/` are generated the
same way — `uv run --with pymupdf python scripts/make_demo_pdfs.py` — and
that script is likewise idempotent, skipping any file that already exists.
