/**
 * CSV serialization for OCI rows.
 *
 * Implemented as a small dependency-free writer rather than pulling
 * `csv-stringify` into the import graph for a single use case. The
 * Google Ads OCI format is RFC-4180 with comma separators, double-
 * quoted fields where needed, and embedded quotes doubled.
 */

import type { OciCsvRow } from '../types';

const HEADER: ReadonlyArray<keyof OciCsvRow> = [
  'Google Click ID',
  'Conversion Name',
  'Conversion Time',
  'Conversion Value',
  'Conversion Currency',
];

/**
 * Escape a single CSV cell. Wraps in quotes when the cell contains a
 * comma, double quote, newline, or carriage return; doubles any
 * embedded quote character.
 */
export function escapeCell(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function rowsToCsv(rows: readonly OciCsvRow[]): string {
  const lines: string[] = [HEADER.map(escapeCell).join(',')];
  for (const row of rows) {
    const cells = HEADER.map((col) => escapeCell(row[col]));
    lines.push(cells.join(','));
  }
  return `${lines.join('\n')}\n`;
}
