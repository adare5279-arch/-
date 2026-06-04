// Client-only text extraction from uploaded files.
// Supported for in-browser body extraction: txt/csv/md/json, docx (mammoth), pdf (pdf.js).
// Not extractable in-browser (original is stored & linked only): hwp/hwpx/doc/xlsx/etc.

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

  // hwp, hwpx, doc, xlsx, images, ... — cannot extract in browser
  return { text: '', supported: false, ext };
}

export const UPLOAD_ACCEPT =
  '.txt,.csv,.md,.json,.docx,.pdf,.hwp,.hwpx,.doc';
