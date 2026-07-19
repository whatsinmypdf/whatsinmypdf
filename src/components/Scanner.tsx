import { useCallback, useEffect, useRef, useState } from 'react';
import { UploadCloud, Loader2, RotateCcw, Download, FileWarning } from 'lucide-react';
import clsx from 'clsx';
import type { ScanReport } from '../lib/scanner/types';
import type { WorkerRequest, WorkerResponse } from '../lib/scanner/worker';
import ReportView from './ReportView';

const MAX_BYTES = 100 * 1024 * 1024; // 100 MB
const WATCHDOG_MS = 90 * 1000; // 90s — terminate a stuck scan rather than leave the user stranded

type State =
  | { phase: 'idle' }
  | { phase: 'loading'; fileName: string }
  | { phase: 'scanning'; fileName: string }
  | { phase: 'done'; report: ScanReport }
  | { phase: 'error'; message: string };

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Scanner() {
  const [state, setState] = useState<State>({ phase: 'idle' });
  const [dragOver, setDragOver] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reportHeadingRef = useRef<HTMLHeadingElement>(null);
  const scanGen = useRef(0);

  const terminateWorker = useCallback(() => {
    if (watchdogRef.current !== null) {
      clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
    workerRef.current?.terminate();
    workerRef.current = null;
  }, []);

  useEffect(() => terminateWorker, [terminateWorker]);

  useEffect(() => {
    if (state.phase === 'done') reportHeadingRef.current?.focus();
  }, [state.phase]);

  const scan = useCallback(
    async (file: File) => {
      const gen = ++scanGen.current;
      // Pre-checks before spinning up the worker or loading WASM.
      if (!(file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'))) {
        setState({ phase: 'error', message: 'That file is not a PDF. Choose a .pdf file to scan.' });
        return;
      }
      if (file.size > MAX_BYTES) {
        setState({
          phase: 'error',
          message: `File is ${formatBytes(file.size)}. The limit is 100 MB — everything runs in your browser, so larger files are declined.`,
        });
        return;
      }
      if (file.size === 0) {
        setState({ phase: 'error', message: 'That file is empty.' });
        return;
      }

      setState({ phase: 'loading', fileName: file.name });
      let buffer: ArrayBuffer;
      try {
        buffer = await file.arrayBuffer();
      } catch {
        if (gen === scanGen.current) {
          setState({ phase: 'error', message: 'Could not read that file from disk.' });
        }
        return;
      }
      if (gen !== scanGen.current) return;

      terminateWorker();
      const worker = new Worker(new URL('../lib/scanner/worker.ts', import.meta.url), {
        type: 'module',
      });
      workerRef.current = worker;
      watchdogRef.current = setTimeout(() => {
        terminateWorker();
        setState({
          phase: 'error',
          message: 'Scan timed out. The file may be malformed or too complex.',
        });
      }, WATCHDOG_MS);

      worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
        const msg = e.data;
        if (msg.type === 'progress') {
          setState({ phase: msg.stage, fileName: file.name });
        } else if (msg.type === 'done') {
          setState({ phase: 'done', report: msg.report });
          terminateWorker();
        } else {
          setState({ phase: 'error', message: msg.message });
          terminateWorker();
        }
      };
      worker.onerror = () => {
        setState({ phase: 'error', message: 'The scanner failed to start.' });
        terminateWorker();
      };

      const req: WorkerRequest = { buffer, fileName: file.name };
      worker.postMessage(req, [buffer]); // transfer the buffer, don't copy
    },
    [terminateWorker],
  );

  const onFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (file) void scan(file);
    },
    [scan],
  );

  const reset = useCallback(() => {
    scanGen.current++;
    terminateWorker();
    if (inputRef.current) inputRef.current.value = '';
    setState({ phase: 'idle' });
  }, [terminateWorker]);

  const downloadJson = useCallback((report: ScanReport) => {
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const base = report.fileName.replace(/\.pdf$/i, '') || 'report';
    a.download = `${base}.stowaway-report.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const busy = state.phase === 'loading' || state.phase === 'scanning';

  // ---- Result / progress views ----
  if (state.phase === 'done') {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-mono text-sm text-muted-foreground">
            Scanned <span className="text-foreground">{state.report.fileName}</span>
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => downloadJson(state.report)}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3.5 py-2 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <Download className="size-4" aria-hidden />
              Download JSON report
            </button>
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <RotateCcw className="size-4" aria-hidden />
              Scan another file
            </button>
          </div>
        </div>
        <ReportView report={state.report} headingRef={reportHeadingRef} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <label
        htmlFor="pdf-input"
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (!busy) onFiles(e.dataTransfer.files);
        }}
        className={clsx(
          'group relative flex min-h-64 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-10 text-center transition-colors',
          dragOver ? 'border-primary bg-primary/5' : 'border-border bg-card hover:border-primary/60',
          'has-[:focus-visible]:border-primary has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary',
          busy && 'cursor-progress',
        )}
      >
        <input
          ref={inputRef}
          id="pdf-input"
          type="file"
          accept="application/pdf"
          className="sr-only"
          disabled={busy}
          onChange={(e) => onFiles(e.target.files)}
        />

        {busy ? (
          <>
            <Loader2 className="size-10 animate-spin text-primary" aria-hidden />
            <div role="status" aria-live="polite">
              <p className="mt-5 text-base font-medium">
                {state.phase === 'loading' ? 'Loading scan engine…' : 'Scanning for hidden content…'}
              </p>
              <p className="mt-1 font-mono text-sm text-muted-foreground">
                {'fileName' in state ? state.fileName : ''}
              </p>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Everything runs on this page. Nothing is uploaded.
            </p>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                reset();
              }}
              className="mt-4 text-sm font-medium text-primary underline underline-offset-2"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <span className="flex size-14 items-center justify-center rounded-full bg-muted text-primary transition-transform group-hover:scale-105">
              <UploadCloud className="size-7" aria-hidden />
            </span>
            <p className="mt-5 text-base font-medium">Drop a PDF here, or click to choose one</p>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Scanned locally in your browser · up to 100 MB
            </p>
          </>
        )}
      </label>

      {state.phase === 'error' && (
        <div
          role="alert"
          className="mt-5 flex items-start gap-3 rounded-xl border border-danger/40 bg-danger/10 p-4"
        >
          <FileWarning className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden />
          <div className="space-y-2">
            <p className="text-sm leading-relaxed">{state.message}</p>
            <button
              type="button"
              onClick={reset}
              className="text-sm font-medium text-primary underline underline-offset-2"
            >
              Try another file
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
