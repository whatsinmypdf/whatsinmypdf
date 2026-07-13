import * as mupdf from 'mupdf';
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
  const r = [0, 1, 2, 3].map((i) => obj.get(i).asNumber());
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
  const doc: mupdf.PDFDocument | null = mupdf.Document.openDocument(
    data,
    'application/pdf',
  ).asPDF();
  if (!doc) throw new Error('not a PDF document');
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
          // Per the fixed interface: cropbox equals mediabox when the page dict
          // has no CropBox of its own.
          const cropbox = objToRect(pobj.get('CropBox'), mediabox);

          const runs = extractRuns(page);
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
