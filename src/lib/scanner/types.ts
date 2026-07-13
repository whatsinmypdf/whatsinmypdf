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
