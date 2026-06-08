import * as XLSX from 'xlsx';

/**
 * Read the first sheet of an .xlsx/.csv file and return its rows as objects
 * keyed by the (trimmed) header cells. Cell values are returned raw so that
 * dates can be normalized by the caller via `normalizeDate`.
 */
export async function parseSheetRows(file: File): Promise<Record<string, unknown>[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const first = wb.SheetNames[0];
  if (!first) return [];
  const ws = wb.Sheets[first];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
  return rows.map((r) => {
    const o: Record<string, unknown> = {};
    for (const k of Object.keys(r)) o[String(k).trim()] = r[k];
    return o;
  });
}

/** Convert a raw cell value to a trimmed string (dates → yyyy-mm-dd). */
export function cellText(v: unknown): string {
  if (v == null) return '';
  if (v instanceof Date) return normalizeDate(v);
  return String(v).trim();
}

/**
 * Normalize a cell value into an ISO date string (yyyy-mm-dd), or '' if empty.
 * Handles JS Date objects, Excel serial numbers, and yyyy[.-/]mm[.-/]dd text.
 */
export function normalizeDate(v: unknown): string {
  if (v == null || v === '') return '';
  if (v instanceof Date && !isNaN(v.getTime())) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(v).trim();
  if (!s) return '';
  // Excel serial date number (days since 1899-12-30)
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const epoch = Date.UTC(1899, 11, 30);
    const dt = new Date(epoch + Math.round(Number(s)) * 86400000);
    return normalizeDate(dt);
  }
  const m = s.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  return s;
}
