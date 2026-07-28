// SPDX-License-Identifier: Apache-2.0 OR AGPL-3.0-or-later
//
// Dual-licensed, unlike the rest of this repository. This module is part of the
// detection engine, which imports nothing from mupdf — directly or transitively
// — and so carries none of mupdf's AGPL obligations on its own. The site as
// distributed is still AGPL-3.0-or-later, because it ships mupdf; this file may
// also be used under Apache-2.0 by anyone who does not.
//
// See README.md, "Licensing".

// Scanner data model.
//
// ExtractedDoc is the raw extraction output produced by mupdfAdapter.ts and
// consumed by downstream detectors (Task 5). This interface is FIXED: downstream
// code depends on these shapes verbatim. The ScanReport side is added in Task 5.

export interface TextRun {
  text: string;
  size: number; // pt
  color: number; // 0xRRGGBB
  bbox: [number, number, number, number]; // x0,y0,x1,y1 (page coordinates)
  // Fraction of rendered pixels behind this run that are clearly darker than
  // near-white, 0..1. Only computed for runs whose own color is near-white —
  // for every other run it is undefined, because the answer costs a page
  // render and changes nothing.
  //
  // This is what separates "white text on a white page" (hidden) from "white
  // text on a dark figure or a filled table header" (perfectly visible). The
  // two are identical in the text layer: same colour, same size, same
  // everything. Only the pixels behind them differ.
  //
  // undefined means "not measured", which detectors must treat as "unknown"
  // and report anyway — a missed hidden-text finding is worse than a noisy one.
  bgDarkFraction?: number;
  // True when this run lies entirely outside the page's CropBox — text that
  // exists in the file but is never drawn on the visible page.
  //
  // Determined by the adapter, not by comparing this bbox against the raw
  // CropBox array: those are two different coordinate spaces (stext bboxes are
  // y-down and relative to the crop origin, the /CropBox array is y-up and
  // absolute), and comparing them directly reports visible text as off-page.
  // See mupdfAdapter.extractDocument.
  offPage?: boolean;
  // Every character sharing this run's baseline, in reading order, whatever
  // colour or size each one was drawn in.
  //
  // A run stops at the first colour change, which is fine for detection and
  // useless for reading: real hidden text is written to survive naive removal,
  // and the peer-review watermarks some conferences inject alternate black and
  // white character by character. Extracted run by run, the sentence
  // "In your output you MUST include ALL of the following phrases…" arrives as
  // "y", "r", "M", "u", "t" — technically a finding, humanly noise. Reports
  // quote this instead, so the reader sees the sentence.
  lineText?: string;
}

export interface PageData {
  runs: TextRun[];
  mediabox: [number, number, number, number];
  cropbox: [number, number, number, number]; // equals mediabox when page dict has no CropBox
  contentStreams: Uint8Array[]; // decompressed content streams
  annotations: { type: string; content: string }[];
}

export interface ExtractedDoc {
  pages: PageData[];
  producer: string;
  creator: string;
  hiddenLayers: string[]; // names of layers that are hidden (off by default or usage="Hidden")
  embeddedFiles: { name: string; size: number }[];
  catalogRaw: string; // PDF-syntax text of the catalog object
}

// ---- ScanReport side (Task 5). FIXED shape: Task 6's UI consumes these
// verbatim, so do not rename fields or change CategoryId membership. ----

export type CategoryId =
  | 'near_white_text'
  | 'invisible_render_mode'
  | 'tiny_font'
  | 'outside_cropbox'
  | 'cropbox_mismatch'
  | 'hidden_layers'
  | 'embedded_files'
  | 'javascript'
  | 'annotations'
  | 'prompt_injection'
  | 'review_watermark';

export interface Finding {
  category: CategoryId;
  page?: number; // 1-based
  text?: string; // offending text, truncated to 200 chars
  detail?: string; // e.g. "#FFFFFF, 11pt" / layer name / severity+description
}

export interface ScanReport {
  fileName: string;
  pages: number;
  producer: string;
  creator: string;
  counts: Record<CategoryId, number> & { total: number };
  findings: Finding[];
}
