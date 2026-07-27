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

## Dev commands

```bash
pnpm install
pnpm dev        # local dev server
pnpm build      # static build to dist/
pnpm preview    # serve the built dist/ locally
pnpm test       # vitest unit tests (all passing)
pnpm e2e        # playwright e2e tests (all passing)
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

The two "try an example" demo files under `public/demo/` are generated the
same way — `uv run --with pymupdf python scripts/make_demo_pdfs.py` — and
that script is likewise idempotent, skipping any file that already exists.
