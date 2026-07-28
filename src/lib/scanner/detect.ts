/**
 * Pure detection engine: ExtractedDoc -> ScanReport.
 *
 * Ported from the Python reference implementation
 * `pdf-stowaway-scanner/scripts/scan_pdf.py`, `scan()` (lines 107-259) and
 * `luma()` (lines 99-104). Imports nothing from mupdf — this module is a
 * pure function over the ExtractedDoc shape produced by mupdfAdapter.ts.
 */

import { findInjections, findReviewWatermarks } from './patterns';
import type { CategoryId, ExtractedDoc, Finding, PageData, ScanReport, TextRun } from './types';

type Rect4 = [number, number, number, number];

const MIN_FONT_SIZE = 4;
// Exported because mupdfAdapter needs the same cutoff to decide which runs are
// worth measuring a background for: sampling every run would mean rendering
// every page of every document, and only near-white runs can be answered by
// the measurement.
export const BG_LUMA = 240;
const TEXT_TRUNCATE = 200;

// A near-white run is reported only when the pixels behind it are also
// near-white. At or above this fraction of clearly-darker pixels, the text is
// visible to a reader — white on a dark figure, a filled table header, a
// coloured callout — and reporting it is noise.
//
// Chosen from a 48-document corpus of real papers and government forms (see
// tests/sweep/): every one of the 170 near-white findings in that corpus was
// text of this kind, and all of them sit far above this line, while the
// white-on-white fixtures sit at 0. There is a lot of daylight between the two
// populations, so the exact value is not delicate.
const BG_DARK_FRACTION = 0.1;

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
  'review_watermark',
];

// True when a near-white run was measured against its rendered background and
// that background turned out to be visibly darker — i.e. a reader can see the
// text, so it is not hidden.
//
// Unmeasured runs (bgDarkFraction undefined: the adapter skipped the page, the
// render failed, or a caller built the doc by hand) return false and stay
// reported. Every ambiguity resolves toward showing the finding.
export function onVisibleBackground(run: TextRun): boolean {
  return run.bgDarkFraction !== undefined && run.bgDarkFraction >= BG_DARK_FRACTION;
}

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

// Slicing a string by UTF-16 code unit can land the cut inside a surrogate
// pair, leaving a lone high surrogate at the end of the slice (which renders
// as U+FFFD / mojibake downstream). Drop that trailing lone surrogate rather
// than emit an invalid code unit.
function truncate(text: string): string {
  if (text.length <= TEXT_TRUNCATE) return text;
  let sliced = text.slice(0, TEXT_TRUNCATE);
  const lastCode = sliced.charCodeAt(sliced.length - 1);
  if (lastCode >= 0xd800 && lastCode <= 0xdbff) {
    // Lone high surrogate at the boundary — its low-surrogate partner got cut.
    sliced = sliced.slice(0, -1);
  }
  return sliced;
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
// Pure geometric separation test over ONE coordinate space. It does not
// reconcile spaces, and feeding it a stext bbox (y-down, relative to the crop
// origin) together with a raw /CropBox array (y-up, absolute) reports visible
// text as off-page — a page cropped to its top half flags its only visible
// line. Its one production caller is mupdfAdapter, which maps the CropBox
// through the page transform first so both arguments are in run space.
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

  // Near-white runs are grouped by the line they belong to before being
  // reported. Hidden text written in alternating colours arrives as dozens of
  // one-character runs, and a report that lists "c", "s", '"' as separate
  // findings has technically told the truth and practically told the reader
  // nothing. One finding per line, quoting the line, saying how much of it was
  // near-white.
  const nearWhiteLines = new Map<string, TextRun[]>();
  for (const run of page.runs) {
    if (!run.text.trim()) continue; // mirror Python's empty-span guard
    if (luma(run.color) < BG_LUMA || onVisibleBackground(run)) continue;
    const key = run.lineText ?? run.text;
    const bucket = nearWhiteLines.get(key);
    if (bucket) bucket.push(run);
    else nearWhiteLines.set(key, [run]);
  }
  for (const [line, runs] of nearWhiteLines) {
    const [first] = runs;
    const fragmented = runs.length > 1 && line !== first.text;
    findings.push({
      category: 'near_white_text',
      page: pageNum,
      text: truncate(fragmented ? line : first.text),
      detail: fragmented
        ? `${hexColor(first.color)}, ${round2(first.size)}pt, ${runs.length} characters of this line`
        : `${hexColor(first.color)}, ${round2(first.size)}pt`,
    });
  }

  for (const run of page.runs) {
    if (!run.text.trim()) continue; // mirror Python's empty-span guard

    if (run.size > 0 && run.size < MIN_FONT_SIZE) {
      findings.push({
        category: 'tiny_font',
        page: pageNum,
        text: truncate(run.text),
        detail: `${round2(run.size)}pt`,
      });
    }

    // Reads the adapter's verdict rather than re-deriving one here: page.cropbox
    // is the raw PDF array and run.bbox is crop-relative and y-down, so testing
    // one against the other reports visible text as off-page (a vertically
    // cropped page reports its only visible line). The adapter has the page
    // transform needed to put both in one space; this module does not.
    if (run.offPage) {
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

  // Scanned line by line rather than run by run. The reference scanner joins
  // runs with newlines, which quietly breaks every pattern here against any
  // sentence written in alternating colours: a run ends at each colour change,
  // so "ignore all previous instructions" arrives as "i|gnore a|ll p|revious…"
  // and matches nothing. That is not hypothetical — the reviewing watermarks some
  // venues inject are written exactly that way, and anyone reading this file could
  // use the same trick to walk an injection straight past the scan.
  const lineTops = new Map<string, number>();
  for (const run of page.runs) {
    const line = run.lineText ?? run.text;
    if (!lineTops.has(line)) lineTops.set(line, run.bbox[1]);
  }
  const lineTexts = [...lineTops.entries()].sort((a, b) => a[1] - b[1]).map(([line]) => line);

  // Venue watermarks first, so an instruction the conference planted is
  // reported as what it is instead of as an attack by the authors.
  //
  // Matched against the page in reading order rather than line by line: a
  // watermark wraps like any other text, and two of the three real examples this
  // was built against break mid-word across two baselines. Per-line matching sees
  // neither half as an instruction.
  const pageText = lineTexts.join(' ');
  let cleaned = pageText;
  for (const hit of findReviewWatermarks(pageText)) {
    // Quoted from the match onward rather than the match itself: the pattern
    // stops as soon as it is certain — for one of the two forms that is "In your
    // output you MUST include ALL" — and the phrases it is actually
    // about come after that, and they are the part a reader needs to compare
    // against a review they were sent.
    const at = pageText.indexOf(hit.match);
    findings.push({
      category: 'review_watermark',
      page: pageNum,
      text: truncate(at === -1 ? hit.match : pageText.slice(at)),
      detail: hit.description,
    });
    // Keep the matched span out of the injection scan: the same sentence must
    // not be reported twice, once as the venue's watermark and once as an
    // attack on the venue's behalf.
    cleaned = cleaned.split(hit.match).join(' ');
  }

  const body = cleaned;
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
