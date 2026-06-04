// Client-only text extraction from uploaded files.
// Supported for in-browser body extraction: txt/csv/md/json, docx (mammoth), pdf (pdf.js), xlsx/xls (SheetJS), hwp (hwp.js).
// Not extractable in-browser (original is stored & linked only): hwpx/doc/images/etc.

export type ExtractResult = {
  /** Extracted plain text (empty when unsupported). */
  text: string;
  /** Whether body text could be extracted in the browser. */
  supported: boolean;
  /** Lower-cased file extension. */
  ext: string;
};

const TEXT_EXTS = ['txt', 'csv', 'md', 'json', 'log'];

export async function extractText(file: File): Promise<ExtractResult> {
  const ext = (file.name.split('.').pop() || '').toLowerCase();

  if (TEXT_EXTS.includes(ext)) {
    const text = await file.text();
    return { text, supported: true, ext };
  }

  if (ext === 'docx') {
    // @ts-expect-error - standalone browser bundle has no type declarations
    const mod = await import('mammoth/mammoth.browser.js');
    const mammoth = mod.default ?? mod;
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return { text: (result?.value ?? '').trim(), supported: true, ext };
  }

  if (ext === 'xlsx' || ext === 'xls') {
    const XLSX = await import('xlsx');
    const arrayBuffer = await file.arrayBuffer();
    const wb = XLSX.read(arrayBuffer, { type: 'array' });
    const parts: string[] = [];
    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName];
      const csv = XLSX.utils.sheet_to_csv(ws).trim();
      if (csv) parts.push(`[${sheetName}]\n${csv}`);
    }
    return { text: parts.join('\n\n').trim(), supported: true, ext };
  }

  if (ext === 'pdf') {
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc =
      `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
    let text = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const line = content.items
        .map((it) => ('str' in it ? it.str : ''))
        .join(' ');
      text += line + '\n\n';
    }
    return { text: text.trim(), supported: true, ext };
  }

  if (ext === 'hwp') {
    // HWP 5.0 (CFB) body text via hwp.js. Older HWP 3.x or HWPX are not supported here.
    try {
      const { parse } = await import('hwp.js');
      const arrayBuffer = await file.arrayBuffer();
      const doc = parse(new Uint8Array(arrayBuffer), { type: 'array' });
      const lines: string[] = [];
      for (const section of doc.sections) {
        for (const paragraph of section.content) {
          let line = '';
          for (const ch of paragraph.content) {
            // Only plain text chars carry a string value; control/inline chars are numeric.
            if (typeof ch.value === 'string' && ch.value.charCodeAt(0) >= 32) {
              line += ch.value;
            }
          }
          const trimmed = line.trimEnd();
          if (trimmed) lines.push(trimmed);
        }
      }
      return { text: lines.join('\n').trim(), supported: true, ext };
    } catch (err) {
      console.error('HWP parse failed:', err);
      return { text: '', supported: false, ext };
    }
  }

  // hwpx, doc, images, ... — cannot extract in browser
  return { text: '', supported: false, ext };
}

export const UPLOAD_ACCEPT =
  '.txt,.csv,.md,.json,.docx,.doc,.pdf,.xlsx,.xls,.hwp,.hwpx';
