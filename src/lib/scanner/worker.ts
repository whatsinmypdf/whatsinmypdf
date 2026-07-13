/// <reference lib="webworker" />
//
// Scan worker. mupdf (the ~5-8MB WASM) is imported lazily inside the handler,
// so it only downloads after the user hands us a file — never on page load.
// Message protocol (worker -> main):
//   { type: 'progress', stage: 'loading' | 'scanning' }
//   { type: 'done', report: ScanReport }
//   { type: 'error', message: string }

import type { ScanReport } from './types';

export type WorkerRequest = { buffer: ArrayBuffer; fileName: string };

export type WorkerResponse =
  | { type: 'progress'; stage: 'loading' | 'scanning' }
  | { type: 'done'; report: ScanReport }
  | { type: 'error'; message: string };

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  try {
    postMessage({ type: 'progress', stage: 'loading' } satisfies WorkerResponse);
    // Dynamic import: pulls in mupdf + WASM only now, on first scan.
    const { scanPdf } = await import('./scanPdf');
    postMessage({ type: 'progress', stage: 'scanning' } satisfies WorkerResponse);
    const report = scanPdf(new Uint8Array(e.data.buffer), e.data.fileName);
    postMessage({ type: 'done', report } satisfies WorkerResponse);
  } catch (err) {
    postMessage({
      type: 'error',
      message: err instanceof Error ? err.message : 'Failed to parse PDF',
    } satisfies WorkerResponse);
  }
};
