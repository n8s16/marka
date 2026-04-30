import { parseCurrencyInput, formatCurrency } from './currency';

describe('parseCurrencyInput', () => {
  describe('happy path', () => {
    it('parses whole number → .00', () => {
      expect(parseCurrencyInput('1599')).toEqual({ ok: true, value: 159900 });
    });

    it('parses one decimal place → padded', () => {
      expect(parseCurrencyInput('1599.5')).toEqual({ ok: true, value: 159950 });
    });

    it('parses two decimal places as-is', () => {
      expect(parseCurrencyInput('1599.50')).toEqual({ ok: true, value: 159950 });
    });

    it('parses zero', () => {
      expect(parseCurrencyInput('0')).toEqual({ ok: true, value: 0 });
    });

    it('parses one centavo', () => {
      expect(parseCurrencyInput('0.01')).toEqual({ ok: true, value: 1 });
    });

    it('parses leading-zero whole part', () => {
      expect(parseCurrencyInput('00100.50')).toEqual({ ok: true, value: 10050 });
    });

    it('parses missing whole part as zero', () => {
      expect(parseCurrencyInput('.50')).toEqual({ ok: true, value: 50 });
    });

    it('trims surrounding whitespace', () => {
      expect(parseCurrencyInput('  1599.50  ')).toEqual({ ok: true, value: 159950 });
    });

    it('accepts comma thousands separators', () => {
      expect(parseCurrencyInput('1,599')).toEqual({ ok: true, value: 159900 });
      expect(parseCurrencyInput('1,000,000.00')).toEqual({ ok: true, value: 100000000 });
    });
  });

  describe('rejections', () => {
    it('rejects more than two decimals', () => {
      const res = parseCurrencyInput('1599.500');
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.reason).toMatch(/two decimal/i);
    });

    it('rejects negative numbers', () => {
      const res = parseCurrencyInput('-100');
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.reason).toMatch(/negative/i);
    });

    it('rejects multiple decimal points', () => {
      expect(parseCurrencyInput('1599.5.0').ok).toBe(false);
    });

    it('rejects non-numeric input', () => {
      expect(parseCurrencyInput('abc').ok).toBe(false);
      expect(parseCurrencyInput('1599abc').ok).toBe(false);
    });

    it('rejects empty string', () => {
      const res = parseCurrencyInput('');
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.reason).toMatch(/amount/i);
    });

    it('rejects whitespace-only input', () => {
      expect(parseCurrencyInput('   ').ok).toBe(false);
    });

    it('rejects bare decimal point', () => {
      expect(parseCurrencyInput('.').ok).toBe(false);
    });
  });
});

describe('formatCurrency', () => {
  it('formats whole pesos', () => {
    expect(formatCurrency(159900)).toBe('₱1,599.00');
  });

  it('formats with centavos', () => {
    expect(formatCurrency(159950)).toBe('₱1,599.50');
  });

  it('formats zero', () => {
    expect(formatCurrency(0)).toBe('₱0.00');
  });

  it('formats single centavo', () => {
    expect(formatCurrency(1)).toBe('₱0.01');
  });

  it('formats large amounts with thousands separators', () => {
    expect(formatCurrency(100000000)).toBe('₱1,000,000.00');
  });

  it('formats sub-thousand amounts without separators', () => {
    expect(formatCurrency(99999)).toBe('₱999.99');
  });

  it('renders negatives with a leading minus sign rather than throwing', () => {
    expect(formatCurrency(-159900)).toBe('-₱1,599.00');
  });
});
