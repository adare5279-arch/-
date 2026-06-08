import * as XLSX from 'xlsx';

export type ExportColumn<T> = {
  header: string;
  value: (row: T) => string | number | null | undefined;
};

export type SheetSpec = {
  sheetName: string;
  aoa: (string | number)[][];
  widths: number[];
};

/**
 * Build a single sheet spec from rows + column extractors. Use together with
 * `exportWorkbook` to combine multiple sheets into one workbook.
 */
export function makeSheet<T>(
  sheetName: string,
  rows: T[],
  columns: ExportColumn<T>[]
): SheetSpec {
  const aoa: (string | number)[][] = [
    columns.map((c) => c.header),
    ...rows.map((r) => columns.map((c) => c.value(r) ?? '')),
  ];
  const widths = columns.map((c) => Math.max(10, c.header.length * 2 + 2));
  return { sheetName, aoa, widths };
}

/**
 * Write one or more sheets to a single .xlsx file (date-stamped).
 */
export function exportWorkbook(filename: string, sheets: SheetSpec[]) {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(s.aoa);
    ws['!cols'] = s.widths.map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws, s.sheetName.slice(0, 31));
  }
  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `${filename}_${stamp}.xlsx`);
}

/**
 * Generic single-sheet export. `columns` maps an output column header (Korean)
 * to a function that extracts the cell value from a row.
 */
export function exportSheet<T>(
  filename: string,
  sheetName: string,
  rows: T[],
  columns: ExportColumn<T>[]
) {
  exportWorkbook(filename, [makeSheet(sheetName, rows, columns)]);
}
