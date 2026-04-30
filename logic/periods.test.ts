import {
  isPeriodDueForBill,
  getDueDateForPeriod,
  getNextDuePeriod,
  getPrevDuePeriod,
  listDuePeriodsInRange,
  getSmartDefaultPeriodForPayment,
  type BillCadence,
  type BillDueDay,
} from './periods';

// ─── Test factories ──────────────────────────────────────────────────────────

function makeCadence(overrides: Partial<BillCadence> = {}): BillCadence {
  return {
    frequency: 'monthly',
    interval_months: null,
    start_period: '2026-01',
    ...overrides,
  };
}

function makeBill(overrides: Partial<BillDueDay> = {}): BillDueDay {
  return {
    frequency: 'monthly',
    interval_months: null,
    start_period: '2026-01',
    due_day: 15,
    ...overrides,
  };
}

// ─── isPeriodDueForBill ──────────────────────────────────────────────────────

describe('isPeriodDueForBill', () => {
  describe('monthly', () => {
    const bill = makeCadence({ frequency: 'monthly', start_period: '2026-04' });

    it('returns false for periods before start_period', () => {
      expect(isPeriodDueForBill(bill, '2026-03')).toBe(false);
    });

    it('returns true for start_period itself', () => {
      expect(isPeriodDueForBill(bill, '2026-04')).toBe(true);
    });

    it('returns true for every month after start_period', () => {
      expect(isPeriodDueForBill(bill, '2026-05')).toBe(true);
      expect(isPeriodDueForBill(bill, '2026-12')).toBe(true);
      expect(isPeriodDueForBill(bill, '2030-07')).toBe(true);
    });
  });

  describe('quarterly', () => {
    const bill = makeCadence({ frequency: 'quarterly', start_period: '2026-03' });

    it('is due every 3 months from start_period', () => {
      expect(isPeriodDueForBill(bill, '2026-03')).toBe(true);
      expect(isPeriodDueForBill(bill, '2026-06')).toBe(true);
      expect(isPeriodDueForBill(bill, '2026-09')).toBe(true);
      expect(isPeriodDueForBill(bill, '2026-12')).toBe(true);
      expect(isPeriodDueForBill(bill, '2027-03')).toBe(true);
    });

    it('is not due in non-quarter months', () => {
      expect(isPeriodDueForBill(bill, '2026-01')).toBe(false);
      expect(isPeriodDueForBill(bill, '2026-02')).toBe(false);
      expect(isPeriodDueForBill(bill, '2026-04')).toBe(false);
      expect(isPeriodDueForBill(bill, '2026-05')).toBe(false);
      expect(isPeriodDueForBill(bill, '2026-07')).toBe(false);
      expect(isPeriodDueForBill(bill, '2026-08')).toBe(false);
      expect(isPeriodDueForBill(bill, '2026-10')).toBe(false);
      expect(isPeriodDueForBill(bill, '2026-11')).toBe(false);
    });
  });

  describe('yearly', () => {
    const bill = makeCadence({ frequency: 'yearly', start_period: '2026-03' });

    it('is due in the same month each year', () => {
      expect(isPeriodDueForBill(bill, '2026-03')).toBe(true);
      expect(isPeriodDueForBill(bill, '2027-03')).toBe(true);
      expect(isPeriodDueForBill(bill, '2030-03')).toBe(true);
    });

    it('is not due in other months', () => {
      expect(isPeriodDueForBill(bill, '2026-02')).toBe(false);
      expect(isPeriodDueForBill(bill, '2026-09')).toBe(false);
      expect(isPeriodDueForBill(bill, '2027-02')).toBe(false);
    });
  });

  describe('custom', () => {
    it('honors interval_months = 2 (bi-monthly)', () => {
      const bill = makeCadence({
        frequency: 'custom',
        interval_months: 2,
        start_period: '2026-04',
      });
      expect(isPeriodDueForBill(bill, '2026-04')).toBe(true);
      expect(isPeriodDueForBill(bill, '2026-06')).toBe(true);
      expect(isPeriodDueForBill(bill, '2026-08')).toBe(true);
      expect(isPeriodDueForBill(bill, '2026-10')).toBe(true);
      expect(isPeriodDueForBill(bill, '2026-12')).toBe(true);
      expect(isPeriodDueForBill(bill, '2026-05')).toBe(false);
      expect(isPeriodDueForBill(bill, '2026-07')).toBe(false);
    });

    it('honors interval_months = 6 (semi-annual)', () => {
      const bill = makeCadence({
        frequency: 'custom',
        interval_months: 6,
        start_period: '2026-04',
      });
      expect(isPeriodDueForBill(bill, '2026-04')).toBe(true);
      expect(isPeriodDueForBill(bill, '2026-10')).toBe(true);
      expect(isPeriodDueForBill(bill, '2027-04')).toBe(true);
      expect(isPeriodDueForBill(bill, '2026-07')).toBe(false);
    });

    it('treats null interval_months as malformed', () => {
      const bill = makeCadence({
        frequency: 'custom',
        interval_months: null,
        start_period: '2026-04',
      });
      expect(isPeriodDueForBill(bill, '2026-04')).toBe(false);
      expect(isPeriodDueForBill(bill, '2026-06')).toBe(false);
    });

    it('treats interval_months = 0 as malformed', () => {
      const bill = makeCadence({
        frequency: 'custom',
        interval_months: 0,
        start_period: '2026-04',
      });
      expect(isPeriodDueForBill(bill, '2026-04')).toBe(false);
    });

    it('treats negative interval_months as malformed', () => {
      const bill = makeCadence({
        frequency: 'custom',
        interval_months: -3,
        start_period: '2026-04',
      });
      expect(isPeriodDueForBill(bill, '2026-04')).toBe(false);
    });
  });

  describe('malformed inputs', () => {
    it('returns false for malformed period strings', () => {
      const bill = makeCadence({ start_period: '2026-04' });
      expect(isPeriodDueForBill(bill, 'not-a-period')).toBe(false);
      expect(isPeriodDueForBill(bill, '2026-4')).toBe(false);
      expect(isPeriodDueForBill(bill, '')).toBe(false);
    });

    it('returns false for malformed start_period', () => {
      const bill = makeCadence({ start_period: 'bad' });
      expect(isPeriodDueForBill(bill, '2026-04')).toBe(false);
    });
  });
});

// ─── getDueDateForPeriod ─────────────────────────────────────────────────────

describe('getDueDateForPeriod', () => {
  describe('due_day clamping', () => {
    const bill = makeBill({ due_day: 31 });

    it('uses due_day directly in 31-day months', () => {
      expect(getDueDateForPeriod(bill, '2026-01')).toBe('2026-01-31');
      expect(getDueDateForPeriod(bill, '2026-03')).toBe('2026-03-31');
      expect(getDueDateForPeriod(bill, '2026-05')).toBe('2026-05-31');
      expect(getDueDateForPeriod(bill, '2026-07')).toBe('2026-07-31');
      expect(getDueDateForPeriod(bill, '2026-08')).toBe('2026-08-31');
      expect(getDueDateForPeriod(bill, '2026-10')).toBe('2026-10-31');
      expect(getDueDateForPeriod(bill, '2026-12')).toBe('2026-12-31');
    });

    it('clamps to 30 in 30-day months', () => {
      expect(getDueDateForPeriod(bill, '2026-04')).toBe('2026-04-30');
      expect(getDueDateForPeriod(bill, '2026-06')).toBe('2026-06-30');
      expect(getDueDateForPeriod(bill, '2026-09')).toBe('2026-09-30');
      expect(getDueDateForPeriod(bill, '2026-11')).toBe('2026-11-30');
    });

    it('clamps to 28 in non-leap February', () => {
      expect(getDueDateForPeriod(bill, '2026-02')).toBe('2026-02-28');
    });

    it('clamps to 29 in leap February', () => {
      const leapBill = makeBill({ due_day: 31, start_period: '2024-01' });
      expect(getDueDateForPeriod(leapBill, '2024-02')).toBe('2024-02-29');
    });
  });

  describe('due_day = 30 in February', () => {
    it('clamps to 28 in non-leap, 29 in leap', () => {
      const bill = makeBill({ due_day: 30, start_period: '2024-01' });
      expect(getDueDateForPeriod(bill, '2024-02')).toBe('2024-02-29');
      expect(getDueDateForPeriod(bill, '2026-02')).toBe('2026-02-28');
    });
  });

  describe('due_day = 29 in February', () => {
    it('clamps to 28 in non-leap, stays 29 in leap', () => {
      const bill = makeBill({ due_day: 29, start_period: '2024-01' });
      expect(getDueDateForPeriod(bill, '2024-02')).toBe('2024-02-29');
      expect(getDueDateForPeriod(bill, '2026-02')).toBe('2026-02-28');
    });
  });

  it('returns null for non-due periods', () => {
    const bill = makeBill({
      frequency: 'quarterly',
      start_period: '2026-03',
      due_day: 15,
    });
    expect(getDueDateForPeriod(bill, '2026-03')).toBe('2026-03-15');
    expect(getDueDateForPeriod(bill, '2026-04')).toBeNull();
  });

  it('returns null for malformed due_day', () => {
    const bill = makeBill({ due_day: 0 });
    expect(getDueDateForPeriod(bill, '2026-01')).toBeNull();
    const bill2 = makeBill({ due_day: 32 });
    expect(getDueDateForPeriod(bill2, '2026-01')).toBeNull();
  });
});

// ─── getNextDuePeriod ────────────────────────────────────────────────────────

describe('getNextDuePeriod', () => {
  it('returns the next month for monthly bills', () => {
    const bill = makeCadence({ frequency: 'monthly', start_period: '2026-01' });
    expect(getNextDuePeriod(bill, '2026-04')).toBe('2026-05');
  });

  it('returns the next quarter for quarterly bills', () => {
    const bill = makeCadence({ frequency: 'quarterly', start_period: '2026-03' });
    expect(getNextDuePeriod(bill, '2026-03')).toBe('2026-06');
    expect(getNextDuePeriod(bill, '2026-04')).toBe('2026-06');
    expect(getNextDuePeriod(bill, '2026-05')).toBe('2026-06');
    expect(getNextDuePeriod(bill, '2026-06')).toBe('2026-09');
  });

  it('returns the next year for yearly bills', () => {
    const bill = makeCadence({ frequency: 'yearly', start_period: '2026-03' });
    expect(getNextDuePeriod(bill, '2026-03')).toBe('2027-03');
  });

  it('returns the next custom-interval period', () => {
    const bill = makeCadence({
      frequency: 'custom',
      interval_months: 2,
      start_period: '2026-04',
    });
    expect(getNextDuePeriod(bill, '2026-04')).toBe('2026-06');
    expect(getNextDuePeriod(bill, '2026-05')).toBe('2026-06');
  });

  it('returns start_period when fromPeriod is before it', () => {
    const bill = makeCadence({ frequency: 'quarterly', start_period: '2026-03' });
    expect(getNextDuePeriod(bill, '2025-12')).toBe('2026-03');
  });

  it('returns null for malformed bills', () => {
    const bill = makeCadence({
      frequency: 'custom',
      interval_months: null,
      start_period: '2026-04',
    });
    expect(getNextDuePeriod(bill, '2026-04')).toBeNull();
  });
});

// ─── getPrevDuePeriod ────────────────────────────────────────────────────────

describe('getPrevDuePeriod', () => {
  it('returns the previous month for monthly bills', () => {
    const bill = makeCadence({ frequency: 'monthly', start_period: '2026-01' });
    expect(getPrevDuePeriod(bill, '2026-05')).toBe('2026-04');
  });

  it('returns null when fromPeriod is start_period', () => {
    const bill = makeCadence({ frequency: 'monthly', start_period: '2026-01' });
    expect(getPrevDuePeriod(bill, '2026-01')).toBeNull();
  });

  it('returns null when fromPeriod is before start_period', () => {
    const bill = makeCadence({ frequency: 'monthly', start_period: '2026-04' });
    expect(getPrevDuePeriod(bill, '2026-01')).toBeNull();
  });

  it('returns the previous quarter for quarterly bills', () => {
    const bill = makeCadence({ frequency: 'quarterly', start_period: '2026-03' });
    expect(getPrevDuePeriod(bill, '2026-09')).toBe('2026-06');
    // From a non-due-period mid-cadence, the previous due-period.
    expect(getPrevDuePeriod(bill, '2026-08')).toBe('2026-06');
    expect(getPrevDuePeriod(bill, '2026-07')).toBe('2026-06');
  });

  it('returns the previous year for yearly bills', () => {
    const bill = makeCadence({ frequency: 'yearly', start_period: '2026-03' });
    expect(getPrevDuePeriod(bill, '2027-03')).toBe('2026-03');
  });
});

// ─── listDuePeriodsInRange ───────────────────────────────────────────────────

describe('listDuePeriodsInRange', () => {
  it('lists monthly due-periods within an inclusive range', () => {
    const bill = makeCadence({ frequency: 'monthly', start_period: '2026-01' });
    expect(listDuePeriodsInRange(bill, '2026-03', '2026-06')).toEqual([
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
    ]);
  });

  it('lists quarterly due-periods within a range', () => {
    const bill = makeCadence({ frequency: 'quarterly', start_period: '2026-03' });
    expect(listDuePeriodsInRange(bill, '2026-01', '2026-12')).toEqual([
      '2026-03',
      '2026-06',
      '2026-09',
      '2026-12',
    ]);
  });

  it('skips periods before start_period', () => {
    const bill = makeCadence({ frequency: 'monthly', start_period: '2026-04' });
    expect(listDuePeriodsInRange(bill, '2026-01', '2026-06')).toEqual([
      '2026-04',
      '2026-05',
      '2026-06',
    ]);
  });

  it('returns [] for inverted ranges', () => {
    const bill = makeCadence({ frequency: 'monthly', start_period: '2026-01' });
    expect(listDuePeriodsInRange(bill, '2026-06', '2026-03')).toEqual([]);
  });

  it('returns [] for malformed bills', () => {
    const bill = makeCadence({
      frequency: 'custom',
      interval_months: null,
      start_period: '2026-01',
    });
    expect(listDuePeriodsInRange(bill, '2026-01', '2026-06')).toEqual([]);
  });

  it('handles a single-month range that is a due-period', () => {
    const bill = makeCadence({ frequency: 'quarterly', start_period: '2026-03' });
    expect(listDuePeriodsInRange(bill, '2026-06', '2026-06')).toEqual(['2026-06']);
  });

  it('handles a single-month range that is not a due-period', () => {
    const bill = makeCadence({ frequency: 'quarterly', start_period: '2026-03' });
    expect(listDuePeriodsInRange(bill, '2026-04', '2026-04')).toEqual([]);
  });
});

// ─── getSmartDefaultPeriodForPayment ─────────────────────────────────────────

describe('getSmartDefaultPeriodForPayment', () => {
  it('quarterly bill paying late → defaults to past unpaid period', () => {
    const bill = makeBill({
      frequency: 'quarterly',
      start_period: '2026-03',
      due_day: 15,
    });
    const today = new Date(2026, 4, 15); // 2026-05-15
    expect(getSmartDefaultPeriodForPayment(bill, today, [])).toBe('2026-03');
  });

  it('quarterly bill paying current period before due-date → defaults to current', () => {
    const bill = makeBill({
      frequency: 'quarterly',
      start_period: '2026-03',
      due_day: 15,
    });
    const today = new Date(2026, 2, 5); // 2026-03-05
    expect(getSmartDefaultPeriodForPayment(bill, today, [])).toBe('2026-03');
  });

  it('quarterly bill with prior period paid → defaults to current period', () => {
    const bill = makeBill({
      frequency: 'quarterly',
      start_period: '2026-03',
      due_day: 15,
    });
    const today = new Date(2026, 5, 1); // 2026-06-01
    expect(getSmartDefaultPeriodForPayment(bill, today, ['2026-03'])).toBe('2026-06');
  });

  it('quarterly bill with two prior periods paid → defaults to next upcoming', () => {
    const bill = makeBill({
      frequency: 'quarterly',
      start_period: '2026-03',
      due_day: 15,
    });
    const today = new Date(2026, 7, 15); // 2026-08-15
    expect(
      getSmartDefaultPeriodForPayment(bill, today, ['2026-03', '2026-06']),
    ).toBe('2026-09');
  });

  it('yearly bill, just past due-date, no payments → defaults to past period', () => {
    const bill = makeBill({
      frequency: 'yearly',
      start_period: '2026-03',
      due_day: 15,
    });
    const today = new Date(2026, 3, 1); // 2026-04-01
    expect(getSmartDefaultPeriodForPayment(bill, today, [])).toBe('2026-03');
  });

  it('monthly bill paying current month before due-date → defaults to current', () => {
    const bill = makeBill({ frequency: 'monthly', start_period: '2026-01', due_day: 15 });
    const today = new Date(2026, 3, 5); // 2026-04-05
    expect(getSmartDefaultPeriodForPayment(bill, today, [])).toBe('2026-04');
  });

  it('falls back to start_period for malformed custom bill', () => {
    const bill = makeBill({
      frequency: 'custom',
      interval_months: null,
      start_period: '2026-04',
      due_day: 15,
    });
    const today = new Date(2026, 4, 1);
    expect(getSmartDefaultPeriodForPayment(bill, today, [])).toBe('2026-04');
  });
});
