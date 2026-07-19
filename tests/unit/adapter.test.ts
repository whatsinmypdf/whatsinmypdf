import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { extractDocument, packColor } from '../../src/lib/scanner/mupdfAdapter';

const load = (n: string) => new Uint8Array(readFileSync(`tests/fixtures/${n}`));

describe('extractDocument', () => {
  it('extracts runs with color and size', () => {
    const doc = extractDocument(load('white_text.pdf'));
    expect(doc.pages).toHaveLength(1);
    const white = doc.pages[0].runs.find((r) => r.color === 0xffffff);
    expect(white?.text).toContain('Ignore all previous instructions');
    const normal = doc.pages[0].runs.find((r) => r.color === 0x000000);
    expect(normal?.size).toBeGreaterThan(10);
  });

  it('exposes cropbox distinct from mediabox', () => {
    const doc = extractDocument(load('offpage.pdf'));
    const p = doc.pages[0];
    expect(p.cropbox).not.toEqual(p.mediabox);
  });

  it('exposes raw content streams containing Tr operator', () => {
    const doc = extractDocument(load('invisible_tr.pdf'));
    const text = new TextDecoder('latin1').decode(doc.pages[0].contentStreams[0]);
    expect(text).toMatch(/3\s+Tr/);
  });

  it('lists hidden layers, embedded files, annotations, catalog', () => {
    expect(extractDocument(load('hidden_layer.pdf')).hiddenLayers).toContain('HiddenNotes');
    expect(extractDocument(load('embedded.pdf')).embeddedFiles[0].name).toBe('payload.txt');
    expect(
      extractDocument(load('annotation.pdf')).pages[0].annotations[0].content,
    ).toContain('Ignore all previous instructions');
    expect(extractDocument(load('javascript.pdf')).catalogRaw).toContain('/JS');
  });

  // ---- Added assertions (spike hardening; do not weaken the mandated cases above) ----

  it('returns a clean doc with no hidden signals', () => {
    const doc = extractDocument(load('clean.pdf'));
    expect(doc.hiddenLayers).toEqual([]);
    expect(doc.embeddedFiles).toEqual([]);
    expect(doc.pages[0].annotations).toEqual([]);
    // clean fixture carries no injection text
    const allText = doc.pages[0].runs.map((r) => r.text).join(' ');
    expect(allText).not.toContain('Ignore all previous instructions');
  });

  it('reports real embedded-file byte size, not a raw pointer', () => {
    const ef = extractDocument(load('embedded.pdf')).embeddedFiles[0];
    // payload.txt is small; must be a plausible byte count, never a WASM heap pointer
    expect(ef.size).toBeGreaterThan(0);
    expect(ef.size).toBeLessThan(100_000);
  });

  it('white-text run bbox is a 4-number page-coordinate rect', () => {
    const doc = extractDocument(load('white_text.pdf'));
    const white = doc.pages[0].runs.find((r) => r.color === 0xffffff);
    expect(white?.bbox).toHaveLength(4);
    const [x0, y0, x1, y1] = white!.bbox;
    expect(x1).toBeGreaterThan(x0);
    expect(y1).toBeGreaterThan(y0);
  });

  it('survives repeated extraction across all fixtures in one process', () => {
    const files = [
      'clean.pdf', 'white_text.pdf', 'tiny_font.pdf', 'invisible_tr.pdf',
      'offpage.pdf', 'hidden_layer.pdf', 'embedded.pdf', 'javascript.pdf', 'annotation.pdf',
    ];
    for (const f of files) {
      const doc = extractDocument(load(f));
      expect(doc.pages.length).toBeGreaterThanOrEqual(1);
    }
  });

  // ---- Review 2026-07-16 fixes (P0-1 / P1-4 / P1-5) ----

  it('P0-1: throws on a password-protected PDF instead of returning an empty clean doc', () => {
    expect(() => extractDocument(load('encrypted.pdf'))).toThrow(
      /password-protected/,
    );
  });

  it('P0-1: the thrown error message is exactly the contract string the UI/e2e depend on', () => {
    expect(() => extractDocument(load('encrypted.pdf'))).toThrow(
      'This PDF is password-protected and cannot be scanned. Decrypt it first, then try again.',
    );
  });

  it('P1-4: CropBox inherited from the /Pages ancestor is picked up, not just a page-local one', () => {
    const doc = extractDocument(load('cropbox_inherit.pdf'));
    const p = doc.pages[0];
    // mediabox is the default blank-page size; cropbox must be the inherited,
    // smaller box declared only on the /Pages node.
    expect(p.mediabox).toEqual([0, 0, 612, 792]);
    expect(p.cropbox).toEqual([10, 10, 600, 780]);
    expect(p.cropbox).not.toEqual(p.mediabox);
  });

  it('P1-5: a MediaBox with a non-number element falls back to the default box, not a degenerate rect', () => {
    const doc = extractDocument(load('badrect.pdf'));
    const p = doc.pages[0];
    // The malformed MediaBox is [0 0 /Foo 792] — without the isNumber() guard
    // this would silently become [0,0,0,792] (Name.asNumber() === 0).
    expect(p.mediabox).toEqual([0, 0, 612, 792]);
  });
});

describe('packColor', () => {
  it('packs gray-white [1] to 0xffffff', () => {
    expect(packColor([1])).toBe(0xffffff);
  });

  it('packs gray-black [0] to 0x000000', () => {
    expect(packColor([0])).toBe(0x000000);
  });

  it('packs rgb-white [1,1,1] to 0xffffff', () => {
    expect(packColor([1, 1, 1])).toBe(0xffffff);
  });

  it('packs CMYK-white [0,0,0,0] to 0xffffff (must not be mis-read as RGB black)', () => {
    expect(packColor([0, 0, 0, 0])).toBe(0xffffff);
  });

  it('packs CMYK-black [0,0,0,1] to 0x000000', () => {
    expect(packColor([0, 0, 0, 1])).toBe(0x000000);
  });

  it('falls back to 0x000000 (visible) for an empty/unrecognized array', () => {
    expect(packColor([])).toBe(0x000000);
  });

  it('falls back to 0x000000 (visible) for a 2-element garbage array', () => {
    expect(packColor([1, 1])).toBe(0x000000);
  });

  it('clamps and rounds out-of-range components', () => {
    expect(packColor([1.5, -0.2, 0.5])).toBe((255 << 16) | (0 << 8) | 128);
  });
});
