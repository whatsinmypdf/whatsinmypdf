import * as mupdf from 'mupdf';
import { BG_LUMA, isOutsideCropbox, luma } from './detect';
import type { ExtractedDoc, PageData, TextRun } from './types';

type Rect4 = [number, number, number, number];

// mupdf's stext walker hands colors back as normalized float components in
// 0..1, per the source colorspace's component count — NOT always RGB (see
// mupdf.d.ts: `Color = [number] | [number,number,number] | [number,number,number,number]`,
// i.e. gray, RGB, or CMYK). Pack to 0xRRGGBB, converting CMYK properly so a
// CMYK-white run (e.g. `[0,0,0,0]`) doesn't get mis-packed as black.
export function packColor(color: number[]): number {
  const to255 = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)));
  let r: number;
  let g: number;
  let b: number;
  if (color.length === 1) {
    const v = color[0];
    r = g = b = v;
  } else if (color.length === 3) {
    [r, g, b] = color;
  } else if (color.length === 4) {
    const [c, m, y, k] = color;
    r = (1 - c) * (1 - k);
    g = (1 - m) * (1 - k);
    b = (1 - y) * (1 - k);
  } else {
    // Unrecognized shape — fail toward "visible", never toward "hidden".
    return 0x000000;
  }
  return (to255(r) << 16) | (to255(g) << 8) | to255(b);
}

// A stext quad is a flat 8-tuple: [ulx,uly, urx,ury, llx,lly, lrx,lry].
function quadToBbox(q: number[]): Rect4 {
  const xs = [q[0], q[2], q[4], q[6]];
  const ys = [q[1], q[3], q[5], q[7]];
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

function objToRect(obj: mupdf.PDFObject | null | undefined, fallback: Rect4): Rect4 {
  if (!obj || !obj.isArray() || obj.length < 4) return fallback;
  const elems = [0, 1, 2, 3].map((i) => obj.get(i));
  if (elems.some((e) => !e.isNumber())) return fallback;
  const r = elems.map((e) => e.asNumber());
  return r as Rect4;
}

function asNameSafe(obj: mupdf.PDFObject): string {
  try {
    return obj.isName() ? obj.asName() : '';
  } catch {
    return '';
  }
}

// A PDF layer (OCG) is "hidden" for our purposes when it is off by default in
// the document's default config OR it carries usage metadata that marks it
// hidden. The second case is the important one: a layer can be ON (and thus
// visible to text extraction) yet flagged /Usage/CreatorInfo/Subtype = /Hidden
// (or /Usage/View/ViewState = /OFF). isLayerVisible() only reflects the ON/OFF
// config, so it reports such a layer as visible; we must inspect usage too.
function ocgUsageHidden(ocg: mupdf.PDFObject): boolean {
  const usage = ocg.get('Usage');
  if (!usage || !usage.isDictionary()) return false;
  const creatorInfo = usage.get('CreatorInfo');
  if (creatorInfo.isDictionary() && asNameSafe(creatorInfo.get('Subtype')) === 'Hidden') return true;
  const view = usage.get('View');
  if (view.isDictionary() && asNameSafe(view.get('ViewState')) === 'OFF') return true;
  return false;
}

function collectHiddenLayers(doc: mupdf.PDFDocument): string[] {
  const hidden = new Set<string>();

  // (1) Layers the default config turns off.
  const count = doc.countLayers();
  for (let i = 0; i < count; i++) {
    if (!doc.isLayerVisible(i)) hidden.add(doc.getLayerName(i));
  }

  // (2) Layers flagged hidden via usage metadata (may still be ON). Malformed
  // OCG structures (bad trailer/catalog shape, a poisoned entry) must not sink
  // the whole extraction — return whatever we collected so far, and let one
  // bad entry skip rather than abort the loop.
  try {
    const ocp = doc.getTrailer().get('Root').get('OCProperties');
    if (ocp && ocp.isDictionary()) {
      const ocgs = ocp.get('OCGs');
      if (ocgs && ocgs.isArray()) {
        for (let i = 0; i < ocgs.length; i++) {
          try {
            const ocg = ocgs.get(i).resolve();
            if (!ocg.isDictionary()) continue;
            if (ocgUsageHidden(ocg)) {
              const name = ocg.get('Name');
              if (name.isString()) {
                hidden.add(name.asString());
              } else if (name.isName()) {
                const n = asNameSafe(name);
                if (n) hidden.add(n);
              }
              // else: not a genuine PDF string/name — skip rather than stringify garbage.
            }
          } catch {
            // one bad OCG entry — skip it, keep walking the rest.
          }
        }
      }
    }
  } catch {
    // malformed OCProperties walk — return whatever layers we already found.
  }

  return [...hidden];
}

// Map a rect through a mupdf matrix by transforming its corners. Used to
// express the page's original CropBox in the same space as the extracted run
// bboxes; going through mupdf's own page transform means page rotation is
// handled by construction rather than by hand-rolled trigonometry.
function sameRect(a: Rect4, b: Rect4): boolean {
  return a.every((v, i) => Math.abs(v - b[i]) < 0.01);
}

function transformRect(r: Rect4, m: mupdf.Matrix): Rect4 {
  const [a, b, c, d, e, f] = m;
  const corners: [number, number][] = [
    [r[0], r[1]],
    [r[2], r[1]],
    [r[2], r[3]],
    [r[0], r[3]],
  ];
  const xs = corners.map(([x, y]) => a * x + c * y + e);
  const ys = corners.map(([x, y]) => b * x + d * y + f);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

// Pixels per point for the background sample. 1.0 keeps a 9pt line about 9px
// tall, which is enough to tell a white page from a dark figure without
// rendering anything close to full quality.
const BG_SAMPLE_SCALE = 1;
// A sampled pixel this dark or darker is "clearly not a near-white background".
// Deliberately below BG_LUMA (240): a #F5F5F5 page must still read as white,
// or white-on-very-light-grey — a real hiding technique — would be suppressed.
const BG_DARK_PIXEL_LUMA = 200;
// Rendering is the one expensive thing this scanner does, so it is bounded.
// Beyond this many pages carrying near-white text in a single document, runs
// are left unmeasured and their findings are reported unfiltered.
const MAX_BG_SAMPLED_PAGES = 40;

// Measure what is behind each near-white run, in place.
//
// The text layer cannot distinguish hidden white-on-white text from white text
// on a dark figure or a filled table header: both are #FFFFFF at a normal size.
// The only difference is in the pixels, so for pages that actually contain
// near-white text — a small minority of real documents — render the page once
// and look.
//
// Failure is silent by design: if anything here throws, runs keep
// bgDarkFraction === undefined and the detector reports them as before.
function sampleBackgrounds(page: mupdf.PDFPage, runs: TextRun[]): void {
  const candidates = runs.filter((r) => luma(r.color) >= BG_LUMA && r.text.trim());
  if (candidates.length === 0) return;

  let pixmap: mupdf.Pixmap | undefined;
  try {
    const bounds = page.getBounds();
    pixmap = page.toPixmap(
      mupdf.Matrix.scale(BG_SAMPLE_SCALE, BG_SAMPLE_SCALE),
      mupdf.ColorSpace.DeviceGray, // one component per pixel; we only need luma
      false,
      // Annotations and widgets are part of what a reader sees, so they are
      // part of the background: text over a filled form widget is not hidden.
      true,
    );
    const w = pixmap.getWidth();
    const h = pixmap.getHeight();
    const stride = pixmap.getStride();
    const comps = pixmap.getNumberOfComponents();
    const px = pixmap.getPixels();

    for (const run of candidates) {
      // stext quads and getBounds() are in the same space, so the mapping is
      // just "offset by the page origin, then scale". The origin is not
      // always 0: a cropped page can start at a non-zero x0/y0.
      const x0 = Math.floor((run.bbox[0] - bounds[0]) * BG_SAMPLE_SCALE);
      const y0 = Math.floor((run.bbox[1] - bounds[1]) * BG_SAMPLE_SCALE);
      const x1 = Math.ceil((run.bbox[2] - bounds[0]) * BG_SAMPLE_SCALE);
      const y1 = Math.ceil((run.bbox[3] - bounds[1]) * BG_SAMPLE_SCALE);

      const cx0 = Math.max(0, Math.min(w, x0));
      const cy0 = Math.max(0, Math.min(h, y0));
      const cx1 = Math.max(0, Math.min(w, x1));
      const cy1 = Math.max(0, Math.min(h, y1));
      // Fully off-page text has no background to measure. Leaving it
      // unmeasured is right: off-page white text is exactly the case that
      // should still be reported.
      if (cx1 <= cx0 || cy1 <= cy0) continue;

      let dark = 0;
      let total = 0;
      for (let y = cy0; y < cy1; y++) {
        const row = y * stride;
        for (let x = cx0; x < cx1; x++) {
          if (px[row + x * comps] <= BG_DARK_PIXEL_LUMA) dark++;
          total++;
        }
      }
      if (total > 0) run.bgDarkFraction = dark / total;
    }
  } catch {
    // Leave every candidate unmeasured; detect() then reports them all.
  } finally {
    pixmap?.destroy();
  }
}

function extractRuns(page: mupdf.PDFPage): TextRun[] {
  const runs: TextRun[] = [];
  let cur: TextRun | null = null;
  const flush = () => {
    if (cur && cur.text.trim()) runs.push(cur);
    cur = null;
  };
  const stext = page.toStructuredText('preserve-whitespace');
  try {
    stext.walk({
      onChar(c: string, _origin: number[], _font: unknown, size: number, quad: number[], color: number[]) {
        const bbox = quadToBbox(quad);
        const rgb = packColor(color);
        if (cur && cur.size === size && cur.color === rgb) {
          cur.text += c;
          cur.bbox = [
            Math.min(cur.bbox[0], bbox[0]),
            Math.min(cur.bbox[1], bbox[1]),
            Math.max(cur.bbox[2], bbox[2]),
            Math.max(cur.bbox[3], bbox[3]),
          ];
        } else {
          flush();
          cur = { text: c, size, color: rgb, bbox };
        }
      },
      endLine: flush,
    });
    flush();
  } finally {
    stext.destroy();
  }
  return runs;
}

// A page's /Contents may be a single stream or an array of streams. Per the PDF
// spec, an array of content streams is a SINGLE logical stream: the pieces are
// concatenated (with whitespace between, or a token could split across a
// boundary) before interpretation. The reference scanner reads them the same
// way (PyMuPDF page.read_contents()). We therefore return one decoded byte
// array holding the whole page content — this is why the injecting `3 Tr` in a
// second /Contents entry is still visible at contentStreams[0].
function extractContentStreams(pobj: mupdf.PDFObject): Uint8Array[] {
  const parts: Uint8Array[] = [];
  const grab = (o: mupdf.PDFObject) => {
    let buf: mupdf.Buffer | undefined;
    try {
      buf = o.readStream();
      parts.push(buf.asUint8Array().slice()); // copy out before the buffer is freed
    } catch {
      // not a stream / undecodable — skip
    } finally {
      buf?.destroy();
    }
  };
  const contents = pobj.get('Contents');
  if (contents && contents.isArray()) {
    for (let j = 0; j < contents.length; j++) grab(contents.get(j));
  } else if (contents && !contents.isNull()) {
    grab(contents);
  }
  if (parts.length === 0) return [];

  const NL = 0x0a;
  const total = parts.reduce((n, p) => n + p.length + 1, 0);
  const merged = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    merged.set(p, off);
    off += p.length;
    merged[off] = NL; // separator so tokens never merge across a boundary
    off += 1;
  }
  return [merged];
}

function extractEmbeddedFiles(doc: mupdf.PDFDocument): { name: string; size: number }[] {
  const files: { name: string; size: number }[] = [];
  let efs: Record<string, mupdf.PDFObject>;
  try {
    efs = doc.getEmbeddedFiles();
  } catch {
    return files;
  }
  for (const [name, spec] of Object.entries(efs)) {
    let size = 0;
    let contents: mupdf.Buffer | null = null;
    try {
      // NB: getFilespecParams(spec).size is a raw WASM heap pointer, not a byte
      // count — do not use it. The reliable size is the decoded stream length.
      contents = doc.getEmbeddedFileContents(spec);
      size = contents?.getLength() ?? 0;
    } catch {
      // leave size 0
    } finally {
      contents?.destroy();
    }
    files.push({ name, size });
  }
  return files;
}

export function extractDocument(data: Uint8Array): ExtractedDoc {
  const raw = mupdf.Document.openDocument(data, 'application/pdf');
  if (raw.needsPassword()) {
    raw.destroy();
    throw new Error(
      'This PDF is password-protected and cannot be scanned. Decrypt it first, then try again.',
    );
  }
  const doc: mupdf.PDFDocument | null = raw.asPDF();
  if (!doc) {
    raw.destroy();
    throw new Error('not a PDF document');
  }
  try {
    const meta = (k: string): string => {
      try {
        return doc.getMetaData(k) ?? '';
      } catch {
        return '';
      }
    };

    const hiddenLayers = collectHiddenLayers(doc);
    const embeddedFiles = extractEmbeddedFiles(doc);
    const catalogRaw = doc.getTrailer().get('Root').resolve().toString();

    const FALLBACK_BOX: Rect4 = [0, 0, 612, 792];
    const pages: PageData[] = [];
    let bgSampledPages = 0;
    for (let i = 0; i < doc.countPages(); i++) {
      const page = doc.loadPage(i);
      try {
        // A throw anywhere in this page's body (malformed page dict, a stext
        // walk that trips on adversarial content, an undecodable stream) must
        // not abort extraction of the rest of the document — fall back to an
        // empty-but-valid PageData for this page and keep going.
        try {
          const pobj = page.getObject();
          const mediabox = objToRect(pobj.getInheritable('MediaBox'), FALLBACK_BOX);
          // CropBox is inheritable from ancestor /Pages nodes per the PDF spec,
          // same as MediaBox — use getInheritable so a CropBox declared only on
          // the /Pages tree is still picked up. Falls back to mediabox when no
          // CropBox is found anywhere in the inheritance chain.
          const cropbox = objToRect(pobj.getInheritable('CropBox'), mediabox);

          // Text outside the CropBox is dropped by mupdf before extraction —
          // the very text that "off-page text" as a hiding technique is about,
          // invisible not just to this category but to every detector,
          // injection patterns included. So when a page is cropped, widen the
          // CropBox to the MediaBox first and extract the whole page, then
          // mark the runs that fall outside the original crop.
          //
          // The document was opened from bytes this process owns and is never
          // written back, so mutating the in-memory page box affects nothing
          // but this scan. Text beyond the MediaBox stays out of reach: that
          // is off the sheet of paper entirely, not merely cropped away.
          const cropped = !sameRect(mediabox, cropbox);
          let cropInRunSpace: Rect4 | null = null;
          if (cropped) {
            try {
              page.setPageBox('CropBox', mediabox);
              // Read the transform *after* widening: it is what maps PDF
              // space to the space the run bboxes will arrive in.
              cropInRunSpace = transformRect(cropbox, page.getTransform());
            } catch {
              // Could not widen — fall back to clipped extraction, where no
              // run can be outside the crop and none gets marked.
              cropInRunSpace = null;
            }
          }

          const runs = extractRuns(page);
          if (cropInRunSpace) {
            for (const run of runs) {
              if (isOutsideCropbox(run.bbox, cropInRunSpace)) run.offPage = true;
            }
          }
          if (bgSampledPages < MAX_BG_SAMPLED_PAGES) {
            const before = runs.some((r) => r.bgDarkFraction !== undefined);
            sampleBackgrounds(page, runs);
            // Only count pages that actually rendered — a page with no
            // near-white text costs nothing and must not eat the budget.
            if (!before && runs.some((r) => r.bgDarkFraction !== undefined)) bgSampledPages++;
          }
          const contentStreams = extractContentStreams(pobj);
          const annotations: { type: string; content: string }[] = [];
          for (const a of page.getAnnotations()) {
            try {
              annotations.push({ type: String(a.getType()), content: String(a.getContents()) });
            } catch {
              // one bad annotation — skip it, keep the rest of the page.
            }
          }

          pages.push({ runs, mediabox, cropbox, contentStreams, annotations });
        } catch {
          pages.push({
            runs: [],
            mediabox: FALLBACK_BOX,
            cropbox: FALLBACK_BOX,
            contentStreams: [],
            annotations: [],
          });
        }
      } finally {
        page.destroy();
      }
    }

    return {
      pages,
      producer: meta('info:Producer'),
      creator: meta('info:Creator'),
      hiddenLayers,
      embeddedFiles,
      catalogRaw,
    };
  } finally {
    doc.destroy();
  }
}
