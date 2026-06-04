import * as XLSX from 'xlsx';

/**
 * Generic sheet export. `columns` maps an output column header (Korean) to a
 * function that extracts the cell value from a row.
 */
export function exportSheet<T>(
  filename: string,
  sheetName: string,
  rows: T[],
  columns: { header: string; value: (row: T) => string | number | null | undefined }[]
) {
  const aoa: (string | number)[][] = [
    columns.map((c) => c.header),
    ...rows.map((r) => columns.map((c) => c.value(r) ?? '')),
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Reasonable column widths based on header length.
  ws['!cols'] = columns.map((c) => ({ wch: Math.max(10, c.header.length * 2 + 2) }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));

  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `${filename}_${stamp}.xlsx`);
}
