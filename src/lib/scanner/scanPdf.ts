import { detect } from './detect';
import { extractDocument } from './mupdfAdapter';
import type { ScanReport } from './types';

/**
 * Scan a PDF's raw bytes and produce a ScanReport: extractDocument() (mupdf)
 * followed by detect() (pure). This is the only module in the scanner that
 * wires the mupdf-dependent adapter to the pure detection engine.
 */
export function scanPdf(data: Uint8Array, fileName: string): ScanReport {
  const doc = extractDocument(data);
  return detect(doc, fileName);
}
