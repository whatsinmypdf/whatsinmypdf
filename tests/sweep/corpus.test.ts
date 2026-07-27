import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { scanPdf } from '../../src/lib/scanner/scanPdf';
import { CATEGORIES } from '../../src/lib/scanner/categories';
import type { CategoryId, ScanReport } from '../../src/lib/scanner/types';

// False-positive sweep. Not part of `pnpm test`: it needs a corpus of real
// PDFs that this repo does not ship, and it measures rather than asserts.
//
//   CORPUS_DIR=/path/to/pdfs pnpm sweep
//
// Every fixture in tests/fixtures/ was built to trip a specific detector, so
// the suite proves the detectors fire — it says nothing about how often they
// fire on documents nobody designed to be caught. That number decides whether
// a visitor's first scan of an ordinary file reads as a useful tool or as a
// smoke alarm, and the only way to get it is to run real files through.
const CORPUS_DIR = process.env.CORPUS_DIR;
const REPORT_PATH = process.env.SWEEP_REPORT;
// Every finding as JSON, for working out *why* a category fires on a corpus —
// the summary table says a threshold is noisy, the dump says what to change it
// to. Kept out of the printed report because it runs to megabytes.
const JSON_PATH = process.env.SWEEP_JSON;

type Row = { file: string; pages: number; producer: string; report: ScanReport };

const pct = (n: number, total: number): string =>
  total === 0 ? '—' : `${((n / total) * 100).toFixed(0)}%`;

describe.skipIf(!CORPUS_DIR)('false-positive sweep', () => {
  it('scans every PDF in CORPUS_DIR and reports per-category hit rates', () => {
    const files = readdirSync(CORPUS_DIR!)
      .filter((f) => f.toLowerCase().endsWith('.pdf'))
      .sort();
    expect(files.length, `no PDFs found in ${CORPUS_DIR}`).toBeGreaterThan(0);

    const rows: Row[] = [];
    const failures: string[] = [];
    for (const file of files) {
      const bytes = new Uint8Array(readFileSync(join(CORPUS_DIR!, file)));
      try {
        rows.push({
          file,
          pages: 0,
          producer: '',
          report: scanPdf(bytes, file),
        });
      } catch (e) {
        // A parse failure on a real-world file is itself a finding: the UI
        // shows the visitor an error instead of a report.
        failures.push(`${file}: ${(e as Error).message}`);
      }
    }

    const ids = Object.keys(CATEGORIES) as CategoryId[];
    const filesWith = (id: CategoryId): number =>
      rows.filter((r) => r.report.counts[id] > 0).length;
    const findingsOf = (id: CategoryId): number =>
      rows.reduce((n, r) => n + r.report.counts[id], 0);

    const lines: string[] = [];
    const say = (s = '') => {
      lines.push(s);
      console.log(s);
    };

    say(`\ncorpus: ${CORPUS_DIR}`);
    say(`scanned: ${rows.length} of ${files.length} PDFs${failures.length ? `, ${failures.length} failed to parse` : ''}`);
    const clean = rows.filter((r) => r.report.counts.total === 0).length;
    say(`clean: ${clean}/${rows.length} (${pct(clean, rows.length)})`);
    say('');
    say('category                 files   rate   findings  strong  fp-risk');
    for (const id of ids) {
      const n = filesWith(id);
      const info = CATEGORIES[id];
      say(
        [
          id.padEnd(22),
          String(n).padStart(5),
          pct(n, rows.length).padStart(6),
          String(findingsOf(id)).padStart(10),
          (info.strongSignal ? 'yes' : '').padStart(7),
          `  ${info.falsePositiveRisk}`,
        ].join(''),
      );
    }

    say('');
    say('per-file findings (non-clean only):');
    for (const r of rows.filter((x) => x.report.counts.total > 0)) {
      const hits = ids
        .filter((id) => r.report.counts[id] > 0)
        .map((id) => `${id}=${r.report.counts[id]}`)
        .join(' ');
      say(`  ${r.file.padEnd(34)} ${hits}`);
      for (const f of r.report.findings.slice(0, 3)) {
        const snippet = (f.text ?? f.detail ?? '').replace(/\s+/g, ' ').slice(0, 100);
        say(`      p${f.page ?? '?'} [${f.category}] ${snippet}`);
      }
    }

    if (failures.length) {
      say('');
      say('parse failures:');
      for (const f of failures) say(`  ${f}`);
    }

    if (REPORT_PATH) writeFileSync(REPORT_PATH, `${lines.join('\n')}\n`);
    if (JSON_PATH) {
      writeFileSync(
        JSON_PATH,
        JSON.stringify(
          rows.map((r) => ({ file: r.file, pages: r.report.pages, findings: r.report.findings })),
          null,
          1,
        ),
      );
    }

    // The sweep measures; it does not gate. The one thing it does assert is
    // that the scanner survived every real file — an exception here means a
    // visitor would see "the scanner failed to start" on a normal document.
    expect(failures).toEqual([]);
  });
});
