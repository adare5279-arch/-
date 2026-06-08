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

export type ImportField = {
  /** Target DB column name. */
  key: string;
  /** Candidate header names in the sheet; first non-empty match wins. */
  aliases: string[];
  /** Normalize the value as a date (yyyy-mm-dd). */
  type?: 'date';
  /** Restrict the value to this set; otherwise use `fallback`. */
  allowed?: readonly string[];
  /** Value used when the cell is empty or not in `allowed`. */
  fallback?: string;
  /** Skip the whole row when this cell is empty. */
  required?: boolean;
};

function pickCell(row: Record<string, unknown>, aliases: string[]): unknown {
  for (const a of aliases) {
    if (a in row) {
      const v = row[a];
      if (v != null && String(v).trim() !== '') return v;
    }
  }
  return '';
}

/**
 * Map parsed rows into DB records using field definitions. Rows missing a
 * required field are skipped (counted separately).
 */
export function buildRecords(
  rows: Record<string, unknown>[],
  fields: ImportField[],
  base: Record<string, unknown> = {}
): { records: Record<string, unknown>[]; skipped: number } {
  const records: Record<string, unknown>[] = [];
  let skipped = 0;
  for (const row of rows) {
    const rec: Record<string, unknown> = { ...base };
    let skip = false;
    for (const f of fields) {
      const raw = pickCell(row, f.aliases);
      let val = f.type === 'date' ? normalizeDate(raw) : cellText(raw);
      if (f.allowed && !f.allowed.includes(val)) val = f.fallback ?? '';
      if (f.required && !val) {
        skip = true;
        break;
      }
      rec[f.key] = val !== '' ? val : f.fallback ?? null;
    }
    if (skip) {
      skipped++;
      continue;
    }
    records.push(rec);
  }
  return { records, skipped };
}

/**
 * End-to-end import flow for a file picked in the browser: parse → map →
 * confirm → insert → refresh. Shows native alert/confirm dialogs.
 */
export async function importExcel(opts: {
  file: File;
  label: string;
  fields: ImportField[];
  base?: Record<string, unknown>;
  insert: (records: Record<string, unknown>[]) => Promise<{ error: unknown } | void>;
  onDone?: () => Promise<void> | void;
}): Promise<void> {
  const { file, label, fields, base = {}, insert, onDone } = opts;
  let rows: Record<string, unknown>[];
  try {
    rows = await parseSheetRows(file);
  } catch (err) {
    console.error('Error parsing file:', err);
    alert('파일을 읽지 못했습니다. 엑셀(.xlsx) 또는 CSV 파일인지 확인해 주세요.');
    return;
  }

  const { records, skipped } = buildRecords(rows, fields, base);
  if (records.length === 0) {
    alert(
      `등록할 ${label} 데이터가 없습니다.\n` +
        '"양식 다운로드"로 받은 파일의 열 이름을 그대로 사용했는지 확인해 주세요.'
    );
    return;
  }

  if (
    !confirm(
      `${label} ${records.length}건을 등록합니다.` +
        (skipped > 0 ? ` (필수값 누락 ${skipped}건 제외)` : '') +
        '\n계속하시겠습니까?'
    )
  )
    return;

  const res = await insert(records);
  if (res && 'error' in res && res.error) {
    console.error('Error importing rows:', res.error);
    alert('가져오기에 실패했습니다.');
    return;
  }
  if (onDone) await onDone();
  alert(`${label} ${records.length}건을 등록했습니다.`);
}
