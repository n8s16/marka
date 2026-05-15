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
    end_period: null,
    ...overrides,
  };
}

function makeBill(overrides: Partial<BillDueDay> = {}): BillDueDay {
  return {
    frequency: 'monthly',
    interval_months: null,
    start_period: '2026-01',
    end_period: null,
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

  describe('end_period', () => {
    it('null end_period leaves the sequence unbounded (default)', () => {
      const bill = makeCadence({
        frequency: 'monthly',
        start_period: '2026-01',
        end_period: null,
      });
      expect(isPeriodDueForBill(bill, '2030-12')).toBe(true);
    });

    it('returns true for periods at end_period (inclusive)', () => {
      const bill = makeCadence({
        frequency: 'monthly',
        start_period: '2026-05',
        end_period: '2026-10',
      });
      expect(isPeriodDueForBill(bill, '2026-10')).toBe(true);
    });

    it('returns true for periods before end_period', () => {
      const bill = makeCadence({
        frequency: 'monthly',
        start_period: '2026-05',
        end_period: '2026-10',
      });
      expect(isPeriodDueForBill(bill, '2026-05')).toBe(true);
      expect(isPeriodDueForBill(bill, '2026-09')).toBe(true);
    });

    it('returns false for periods strictly after end_period', () => {
      const bill = makeCadence({
        frequency: 'monthly',
        start_period: '2026-05',
        end_period: '2026-10',
      });
      expect(isPeriodDueForBill(bill, '2026-11')).toBe(false);
      expect(isPeriodDueForBill(bill, '2027-05')).toBe(false);
    });

    it('forward-caps a quarterly bill mid-cadence', () => {
      // Quarterly anchored on 2026-03: due 2026-03, 2026-06, 2026-09, 2026-12.
      // end_period 2026-08 means the last actual due-period is 2026-06.
      const bill = makeCadence({
        frequency: 'quarterly',
        start_period: '2026-03',
        end_period: '2026-08',
      });
      expect(isPeriodDueForBill(bill, '2026-03')).toBe(true);
      expect(isPeriodDueForBill(bill, '2026-06')).toBe(true);
      // 2026-09 would normally be due but is past end_period.
      expect(isPeriodDueForBill(bill, '2026-09')).toBe(false);
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

  describe('end_period', () => {
    it('returns next period when it falls on/before end_period', () => {
      const bill = makeCadence({
        frequency: 'monthly',
        start_period: '2026-05',
        end_period: '2026-10',
      });
      expect(getNextDuePeriod(bill, '2026-08')).toBe('2026-09');
      expect(getNextDuePeriod(bill, '2026-09')).toBe('2026-10');
    });

    it('returns null when the next candidate would exceed end_period', () => {
      const bill = makeCadence({
        frequency: 'monthly',
        start_period: '2026-05',
        end_period: '2026-10',
      });
      // 2026-10 is the last due-period; the next month is past end_period.
      expect(getNextDuePeriod(bill, '2026-10')).toBeNull();
      // Asking from a period already past end_period also yields null.
      expect(getNextDuePeriod(bill, '2027-01')).toBeNull();
    });

    it('returns null for quarterly bill capped before the next quarter', () => {
      // Quarterly: due 2026-03, 2026-06, 2026-09, 2026-12. end_period 2026-08
      // ⇒ last due-period is 2026-06; no next.
      const bill = makeCadence({
        frequency: 'quarterly',
        start_period: '2026-03',
        end_period: '2026-08',
      });
      expect(getNextDuePeriod(bill, '2026-06')).toBeNull();
    });
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

  describe('end_period', () => {
    it('returns the prior in-range due-period when fromPeriod is past end_period', () => {
      // Monthly, 2026-05..2026-10. Last actual due-period is 2026-10. Asking
      // from a period past end_period should walk back to 2026-10.
      const bill = makeCadence({
        frequency: 'monthly',
        start_period: '2026-05',
        end_period: '2026-10',
      });
      expect(getPrevDuePeriod(bill, '2027-02')).toBe('2026-10');
      expect(getPrevDuePeriod(bill, '2026-11')).toBe('2026-10');
    });

    it('returns the last on-cadence period before end_period for quarterly bills', () => {
      // Quarterly anchored 2026-03 → due 2026-03, 2026-06, 2026-09. end_period
      // 2026-08 means the last actual due-period is 2026-06. Walking back
      // from 2027-01 should land there, not on the cadence-only 2026-09.
      const bill = makeCadence({
        frequency: 'quarterly',
        start_period: '2026-03',
        end_period: '2026-08',
      });
      expect(getPrevDuePeriod(bill, '2027-01')).toBe('2026-06');
    });

    it('returns null when end_period is before start_period (no due-periods exist)', () => {
      const bill = makeCadence({
        frequency: 'monthly',
        start_period: '2026-05',
        end_period: '2026-03', // invalid range — caught by form layer, but be defensive
      });
      expect(getPrevDuePeriod(bill, '2026-10')).toBeNull();
    });
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

  describe('end_period', () => {
    it('truncates monthly cadence at end_period (inclusive)', () => {
      // 6-month installment: 2026-05..2026-10. Query window extends past it.
      const bill = makeCadence({
        frequency: 'monthly',
        start_period: '2026-05',
        end_period: '2026-10',
      });
      expect(listDuePeriodsInRange(bill, '2026-01', '2026-12')).toEqual([
        '2026-05',
        '2026-06',
        '2026-07',
        '2026-08',
        '2026-09',
        '2026-10',
      ]);
    });

    it('returns [] when the range starts past end_period', () => {
      const bill = makeCadence({
        frequency: 'monthly',
        start_period: '2026-05',
        end_period: '2026-10',
      });
      expect(listDuePeriodsInRange(bill, '2026-11', '2027-06')).toEqual([]);
    });

    it('truncates quarterly cadence at end_period', () => {
      // Quarterly anchored 2026-03; end_period 2026-08 keeps only 2026-03,
      // 2026-06. The 2026-09 candidate is past the cap.
      const bill = makeCadence({
        frequency: 'quarterly',
        start_period: '2026-03',
        end_period: '2026-08',
      });
      expect(listDuePeriodsInRange(bill, '2026-01', '2026-12')).toEqual([
        '2026-03',
        '2026-06',
      ]);
    });
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

  describe('end_period', () => {
    it('skips candidates past end_period', () => {
      // Monthly, ends 2026-06. Today is 2026-07 (past end_period), and all
      // actual due-periods (2026-04..2026-06) within the lookback window
      // are paid. With no remaining unpaid candidate the function falls
      // back to start_period per the documented defensive contract.
      const bill = makeBill({
        frequency: 'monthly',
        start_period: '2026-04',
        end_period: '2026-06',
        due_day: 15,
      });
      const today = new Date(2026, 6, 5); // 2026-07-05
      const paid = ['2026-04', '2026-05', '2026-06'];
      expect(getSmartDefaultPeriodForPayment(bill, today, paid)).toBe('2026-04');
    });

    it('with end_period set and an unpaid period remaining → picks the unpaid one', () => {
      // Same finite bill, but 2026-06 (the last due-period) is still unpaid.
      // The smart default should land there rather than the fallback.
      const bill = makeBill({
        frequency: 'monthly',
        start_period: '2026-04',
        end_period: '2026-06',
        due_day: 15,
      });
      const today = new Date(2026, 6, 5); // 2026-07-05
      const paid = ['2026-04', '2026-05'];
      expect(getSmartDefaultPeriodForPayment(bill, today, paid)).toBe('2026-06');
    });
  });
});
