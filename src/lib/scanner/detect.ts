/**
 * Pure detection engine: ExtractedDoc -> ScanReport.
 *
 * Ported from the Python reference implementation
 * `pdf-stowaway-scanner/scripts/scan_pdf.py`, `scan()` (lines 107-259) and
 * `luma()` (lines 99-104). Imports nothing from mupdf — this module is a
 * pure function over the ExtractedDoc shape produced by mupdfAdapter.ts.
 */

import { findInjections } from './patterns';
import type { CategoryId, ExtractedDoc, Finding, PageData, ScanReport } from './types';

type Rect4 = [number, number, number, number];

const MIN_FONT_SIZE = 4;
const BG_LUMA = 240;
const TEXT_TRUNCATE = 200;

const CATEGORY_ORDER: CategoryId[] = [
  'near_white_text',
  'invisible_render_mode',
  'tiny_font',
  'outside_cropbox',
  'cropbox_mismatch',
  'hidden_layers',
  'embedded_files',
  'javascript',
  'annotations',
  'prompt_injection',
];

// Perceived brightness 0..255 from a packed 0xRRGGBB int. Ported verbatim
// from scan_pdf.py:99-104 (`luma`). TextRun.color arrives already packed as
// 0xRRGGBB (mupdfAdapter.packColor handles gray/RGB/CMYK uniformly), so this
// unpacks r/g/b exactly the way the Python does from PyMuPDF's packed int.
export function luma(colorInt: number): number {
  const r = (colorInt >> 16) & 0xff;
  const g = (colorInt >> 8) & 0xff;
  const b = colorInt & 0xff;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function truncate(text: string): string {
  return text.length > TEXT_TRUNCATE ? text.slice(0, TEXT_TRUNCATE) : text;
}

function hexColor(colorInt: number): string {
  return `#${(colorInt & 0xffffff).toString(16).toUpperCase().padStart(6, '0')}`;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function sameBox(a: Rect4, b: Rect4): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
}

// outside_cropbox: is a span's bbox fully separated from the cropbox on at
// least one axis? Ported verbatim from scan_pdf.py:205
// (`bx1 <= cb.x0 or bx0 >= cb.x1 or by1 <= cb.y0 or by0 >= cb.y1`).
//
// COORDINATE-SPACE CAVEAT (Task 3 spike, see task-3-report.md "spike
// findings"): stext run bboxes are y-down page space while mediabox/cropbox
// arrays are y-up PDF space. This function is a pure geometric separation
// test over whatever single coordinate space its two arguments are given in
// — it does not itself reconcile the two spaces. Callers (below, and the
// hand-built unit tests) must supply bbox/cropbox already expressed in one
// consistent space for the predicate's result to be meaningful. On real
// extractions this rarely fires: MuPDF's text extraction is already clipped
// to the cropbox before spans reach us (see tests/fixtures/EXPECTED.md,
// "Deviation from the plan brief" section) — that is expected and
// documented, not a bug in this predicate.
export function isOutsideCropbox(bbox: Rect4, cropbox: Rect4): boolean {
  const [bx0, by0, bx1, by1] = bbox;
  const [cx0, cy0, cx1, cy1] = cropbox;
  return bx1 <= cx0 || bx0 >= cx1 || by1 <= cy0 || by0 >= cy1;
}

function detectPage(page: PageData, pageNum: number, findings: Finding[]): void {
  if (!sameBox(page.mediabox, page.cropbox)) {
    findings.push({
      category: 'cropbox_mismatch',
      page: pageNum,
      detail: `mediabox=[${page.mediabox.join(',')}], cropbox=[${page.cropbox.join(',')}]`,
    });
  }

  for (const a of page.annotations) {
    const content = a.content.trim();
    findings.push({
      category: 'annotations',
      page: pageNum,
      text: truncate(content),
      detail: a.type,
    });
  }

  for (const run of page.runs) {
    if (!run.text.trim()) continue; // mirror Python's empty-span guard

    if (luma(run.color) >= BG_LUMA) {
      findings.push({
        category: 'near_white_text',
        page: pageNum,
        text: truncate(run.text),
        detail: `${hexColor(run.color)}, ${round2(run.size)}pt`,
      });
    }

    if (run.size > 0 && run.size < MIN_FONT_SIZE) {
      findings.push({
        category: 'tiny_font',
        page: pageNum,
        text: truncate(run.text),
        detail: `${round2(run.size)}pt`,
      });
    }

    if (isOutsideCropbox(run.bbox, page.cropbox)) {
      findings.push({
        category: 'outside_cropbox',
        page: pageNum,
        text: truncate(run.text),
      });
    }
  }

  // Invisible text rendering mode (PDF operator `3 Tr`). contentStreams
  // arrives as a single concatenated element per adapter decision; iterate
  // the array with no assumption about its length.
  const decoder = new TextDecoder('latin1');
  const invisibleTrRe = /(?<![0-9.])3\s+Tr\b/g;
  for (const stream of page.contentStreams) {
    const text = decoder.decode(stream);
    for (const m of text.matchAll(invisibleTrRe)) {
      findings.push({
        category: 'invisible_render_mode',
        page: pageNum,
        detail: `stream offset ${m.index}`,
      });
    }
  }

  // Prompt-injection scan: visible page text + annotation content, scanned
  // as two separate sources (matches scan_pdf.py:225-243).
  const body = page.runs.map((r) => r.text).join('\n');
  const annotText = page.annotations.map((a) => a.content.trim().slice(0, 200)).join('\n');
  const sources: [string, string][] = [
    ['body', body],
    ['annotation', annotText],
  ];
  for (const [source, text] of sources) {
    if (!text) continue;
    for (const hit of findInjections(text)) {
      findings.push({
        category: 'prompt_injection',
        page: pageNum,
        text: truncate(hit.match),
        detail: `${source}, ${hit.severity}, ${hit.description}`,
      });
    }
  }
}

export function detect(doc: ExtractedDoc, fileName: string): ScanReport {
  const findings: Finding[] = [];

  for (const ef of doc.embeddedFiles) {
    findings.push({
      category: 'embedded_files',
      detail: `${ef.name}, ${ef.size} bytes`,
    });
  }

  for (const name of doc.hiddenLayers) {
    findings.push({ category: 'hidden_layers', detail: name });
  }

  for (let i = 0; i < doc.pages.length; i++) {
    detectPage(doc.pages[i], i + 1, findings);
  }

  // Document-level JavaScript: catalog reference and content-stream token
  // are each checked once for the whole document (max one finding per
  // location), matching scan_pdf.py:246-253.
  if (doc.catalogRaw.includes('/JavaScript') || doc.catalogRaw.includes('/JS')) {
    findings.push({
      category: 'javascript',
      detail: 'catalog: /JS or /JavaScript reference',
    });
  }
  const decoder = new TextDecoder('latin1');
  const anyStreamHasJs = doc.pages.some((p) =>
    p.contentStreams.some((s) => decoder.decode(s).includes('/JS')),
  );
  if (anyStreamHasJs) {
    findings.push({
      category: 'javascript',
      detail: 'content_stream: /JS token found',
    });
  }

  const counts = Object.fromEntries(CATEGORY_ORDER.map((c) => [c, 0])) as Record<
    CategoryId,
    number
  > & { total: number };
  counts.total = 0;
  for (const f of findings) {
    counts[f.category] += 1;
    counts.total += 1;
  }

  return {
    fileName,
    pages: doc.pages.length,
    producer: doc.producer,
    creator: doc.creator,
    counts,
    findings,
  };
}
