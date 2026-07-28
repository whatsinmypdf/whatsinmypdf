# Contributing

The most useful contribution is a file that the scanner gets wrong. Open an
issue with what fired, what the document actually is, and what produced it —
[the templates](.github/ISSUE_TEMPLATE) ask for the fields that turn out to
matter. Please do not attach a PDF you would not publish: GitHub issues are
public, and the scan runs in your browser, so nothing about your file has
reached anyone.

## Licensing of contributions

Most of this repository is AGPL-3.0-or-later, and a contribution to it is
accepted under that licence.

Four files are dual-licensed under `Apache-2.0 OR AGPL-3.0-or-later` — the
detection engine, marked with an SPDX header:

- `src/lib/scanner/detect.ts`
- `src/lib/scanner/patterns.ts`
- `src/lib/scanner/categories.ts`
- `src/lib/scanner/types.ts`

A contribution to one of those is accepted under the same dual licence, so that
the file keeps a single, consistent licence rather than becoming a patchwork
that nobody can reuse. Opening a pull request against them means you are happy
with that. No agreement to sign, no paperwork — the same arrangement Rust uses.

If that does not suit you, say so in the pull request and we will find another
way, or take the change as an issue instead. Nobody's patch is worth a licence
argument.

## Working on the code

```bash
pnpm install
pnpm test    # unit
pnpm e2e     # against a local build
```

Both suites must pass. If you change detection behaviour, add a fixture to
`scripts/make_fixtures.py` and an expectation to `tests/fixtures/EXPECTED.md` —
every fixture in that file is there because something was wrong once, and the
new rule is that a claim which can go stale should live somewhere that fails
when it does.

If you change anything a visitor can see, `README.md` explains how to check the
false-positive rate against real documents rather than guessing at it.
