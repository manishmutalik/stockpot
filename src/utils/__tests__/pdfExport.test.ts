import { describe, it, expect, vi, beforeEach } from 'vitest';

const TINY_JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1RV19iZ2hnPk1xeXBkeFxlZ2P/2wBDARESEhgVGC8aGi9jQjhCY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2P/wAARCAAIAAgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD0CiiigD//2Q==';
const html2canvas = vi.fn();
vi.mock('html2canvas', () => ({ default: (...a: any[]) => html2canvas(...a) }));

import { elementsToPdf, imagesToPdf } from '../pdfExport';

const readText = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = reject;
  reader.readAsBinaryString(blob);
});
const pageCount = (pdf: string) => (pdf.match(/\/Type\s*\/Page\b(?!s)/g) ?? []).length;

beforeEach(() => {
  html2canvas.mockReset();
  html2canvas.mockResolvedValue({ toDataURL: () => TINY_JPEG });
});

describe('imagesToPdf', () => {
  it('produces a real PDF file with one A4 page per image', async () => {
    const blob = await imagesToPdf([TINY_JPEG, TINY_JPEG, TINY_JPEG]);
    expect(blob.type).toBe('application/pdf');
    const text = await readText(blob);
    expect(text.startsWith('%PDF-')).toBe(true);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(pageCount(text)).toBe(3);
    expect(text).toMatch(/MediaBox\s*\[\s*0\s+0\s+595\.2[78]\d*\s+841\.8[89]\d*\s*\]/); // A4
  });
  it('works for a single page', async () => {
    expect(pageCount(await readText(await imagesToPdf([TINY_JPEG])))).toBe(1);
  });
});

describe('elementsToPdf', () => {
  const el = () => document.createElement('div');
  it('draws each element at 2x and returns a named PDF file', async () => {
    const file = await elementsToPdf([el(), el()], 'asha-bakes-menu.pdf');
    expect(file).not.toBeNull();
    expect(file!.name).toBe('asha-bakes-menu.pdf');
    expect(file!.type).toBe('application/pdf');
    expect(html2canvas).toHaveBeenCalledTimes(2);
    expect(html2canvas.mock.calls[0][1]).toMatchObject({ scale: 2, backgroundColor: '#ffffff' });
    const text = await readText(file!);
    expect(text.startsWith('%PDF-')).toBe(true);
    expect(pageCount(text)).toBe(2);
  });
  it('returns null when there is nothing to draw, or drawing fails', async () => {
    expect(await elementsToPdf([], 'x.pdf')).toBeNull();
    html2canvas.mockRejectedValue(new Error('unsupported color'));
    expect(await elementsToPdf([el()], 'x.pdf')).toBeNull();
  });
});
