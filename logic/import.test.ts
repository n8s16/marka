import { describe, expect, test } from '@jest/globals';

import { exportToJson, type ExportSnapshot } from './export';
import { ImportParseError, parseExportJson, summariseSnapshot } from './import';

const VALID: ExportSnapshot = {
  exportedAt: '2026-05-04T00:00:00.000Z',
  schemaVersion: 1,
  wallet: [
    {
      id: 'w1',
      name: 'Maya',
      color: '#00B14F',
      icon: null,
      type: 'e_wallet',
      show_balance: false,
      opening_balance: null,
      archived: false,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    },
  ],
  bill: [],
  category: [],
  bill_payment: [],
  expense: [],
  transfer: [],
};

describe('parseExportJson', () => {
  test('round-trips a valid snapshot', () => {
    const text = exportToJson(VALID);
    const parsed = parseExportJson(text);
    expect(parsed).toEqual(VALID);
  });

  test('throws on malformed JSON', () => {
    expect(() => parseExportJson('{not json')).toThrow(ImportParseError);
    expect(() => parseExportJson('{not json')).toThrow(/Not valid JSON/);
  });

  test('throws when top-level is not an object', () => {
    expect(() => parseExportJson('"hello"')).toThrow(/must be an object/);
    expect(() => parseExportJson('null')).toThrow(/must be an object/);
    // Arrays slip past the typeof check but trip the schemaVersion guard.
    expect(() => parseExportJson('[]')).toThrow(/Unsupported schemaVersion/);
  });

  test('throws when schemaVersion is missing or wrong', () => {
    const noVersion = JSON.stringify({ ...VALID, schemaVersion: undefined });
    expect(() => parseExportJson(noVersion)).toThrow(/Unsupported schemaVersion/);

    const wrongVersion = JSON.stringify({ ...VALID, schemaVersion: 2 });
    expect(() => parseExportJson(wrongVersion)).toThrow(/Unsupported schemaVersion 2/);
  });

  test('throws when a required table key is missing', () => {
    const obj: Partial<Record<keyof ExportSnapshot, unknown>> = { ...VALID };
    delete obj.bill;
    expect(() => parseExportJson(JSON.stringify(obj))).toThrow(
      /Missing required key: "bill"/,
    );
  });

  test('throws when a table key is not an array', () => {
    const obj = { ...VALID, expense: 'oops' as unknown };
    expect(() => parseExportJson(JSON.stringify(obj))).toThrow(
      /"expense" must be an array/,
    );
  });

  test('throws when exportedAt is missing or wrong-typed', () => {
    const obj = { ...VALID, exportedAt: 12345 as unknown };
    expect(() => parseExportJson(JSON.stringify(obj))).toThrow(
      /"exportedAt" must be a string/,
    );
  });

  test('accepts empty arrays for all tables (fresh export)', () => {
    const empty: ExportSnapshot = {
      exportedAt: '2026-05-04T00:00:00.000Z',
      schemaVersion: 1,
      wallet: [],
      bill: [],
      category: [],
      bill_payment: [],
      expense: [],
      transfer: [],
    };
    const parsed = parseExportJson(JSON.stringify(empty));
    expect(parsed).toEqual(empty);
  });
});

describe('summariseSnapshot', () => {
  test('returns row counts per table', () => {
    expect(summariseSnapshot(VALID)).toEqual({
      wallet: 1,
      bill: 0,
      category: 0,
      bill_payment: 0,
      expense: 0,
      transfer: 0,
    });
  });
});
