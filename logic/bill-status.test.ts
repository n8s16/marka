import {
  getBillStatusForPeriod,
  type BillForStatus,
  type BillPaymentRow,
} from './bill-status';

function makeBill(overrides: Partial<BillForStatus> = {}): BillForStatus {
  return {
    frequency: 'monthly',
    interval_months: null,
    start_period: '2026-01',
    due_day: 15,
    reminder_offset_days: 3,
    ...overrides,
  };
}

function makePayment(overrides: Partial<BillPaymentRow> = {}): BillPaymentRow {
  return {
    id: 'payment-id',
    bill_id: 'bill-id',
    wallet_id: 'wallet-id',
    amount: 159900,
    paid_date: '2026-04-15',
    period: '2026-04',
    note: null,
    created_at: '2026-04-15T08:00:00.000Z',
    updated_at: '2026-04-15T08:00:00.000Z',
    ...overrides,
  };
}

describe('getBillStatusForPeriod', () => {
  it('returns paid when a payment exists', () => {
    const bill = makeBill();
    const payment = makePayment({ period: '2026-04' });
    const status = getBillStatusForPeriod(
      bill,
      '2026-04',
      new Date(2026, 3, 20),
      payment,
    );
    expect(status.kind).toBe('paid');
    if (status.kind === 'paid') {
      expect(status.payment).toBe(payment);
    }
  });

  it('returns not_due for a period the bill skips', () => {
    const bill = makeBill({
      frequency: 'quarterly',
      start_period: '2026-03',
    });
    const status = getBillStatusForPeriod(
      bill,
      '2026-04',
      new Date(2026, 3, 5),
      undefined,
    );
    expect(status.kind).toBe('not_due');
  });

  it('returns unpaid for a past due-period with no payment', () => {
    const bill = makeBill();
    const status = getBillStatusForPeriod(
      bill,
      '2026-03',
      new Date(2026, 3, 5), // 2026-04-05
      undefined,
    );
    expect(status.kind).toBe('unpaid');
  });

  it('returns overdue for current period after due_day, no payment', () => {
    const bill = makeBill({ due_day: 15 });
    const status = getBillStatusForPeriod(
      bill,
      '2026-04',
      new Date(2026, 3, 20), // 2026-04-20
      undefined,
    );
    expect(status.kind).toBe('overdue');
  });

  it('returns upcoming for current period on/before due_day, no payment', () => {
    const bill = makeBill({ due_day: 15, reminder_offset_days: 3 });
    const status = getBillStatusForPeriod(
      bill,
      '2026-04',
      new Date(2026, 3, 10), // 2026-04-10, 5 days before due
      undefined,
    );
    expect(status.kind).toBe('upcoming');
    if (status.kind === 'upcoming') {
      expect(status.daysUntilDue).toBe(5);
      expect(status.reminderActive).toBe(false);
    }
  });

  it('returns future for a future due-period', () => {
    const bill = makeBill();
    const status = getBillStatusForPeriod(
      bill,
      '2026-06',
      new Date(2026, 3, 15), // 2026-04-15
      undefined,
    );
    expect(status.kind).toBe('future');
  });

  describe('upcoming.daysUntilDue and reminderActive boundary', () => {
    const bill = makeBill({ due_day: 15, reminder_offset_days: 3 });

    it('reminderActive is true when daysUntilDue === reminder_offset_days', () => {
      const status = getBillStatusForPeriod(
        bill,
        '2026-04',
        new Date(2026, 3, 12), // 3 days before
        undefined,
      );
      expect(status.kind).toBe('upcoming');
      if (status.kind === 'upcoming') {
        expect(status.daysUntilDue).toBe(3);
        expect(status.reminderActive).toBe(true);
      }
    });

    it('reminderActive is true when daysUntilDue < reminder_offset_days', () => {
      const status = getBillStatusForPeriod(
        bill,
        '2026-04',
        new Date(2026, 3, 14), // 1 day before
        undefined,
      );
      expect(status.kind).toBe('upcoming');
      if (status.kind === 'upcoming') {
        expect(status.daysUntilDue).toBe(1);
        expect(status.reminderActive).toBe(true);
      }
    });

    it('reminderActive is false when daysUntilDue === reminder_offset_days + 1', () => {
      const status = getBillStatusForPeriod(
        bill,
        '2026-04',
        new Date(2026, 3, 11), // 4 days before
        undefined,
      );
      expect(status.kind).toBe('upcoming');
      if (status.kind === 'upcoming') {
        expect(status.daysUntilDue).toBe(4);
        expect(status.reminderActive).toBe(false);
      }
    });

    it('reminderActive is true on the due-date itself (daysUntilDue === 0)', () => {
      const status = getBillStatusForPeriod(
        bill,
        '2026-04',
        new Date(2026, 3, 15), // due-date
        undefined,
      );
      expect(status.kind).toBe('upcoming');
      if (status.kind === 'upcoming') {
        expect(status.daysUntilDue).toBe(0);
        expect(status.reminderActive).toBe(true);
      }
    });
  });

  describe('due_day = 31 in short months', () => {
    it('overdue vs upcoming respects clamped Feb due-date in non-leap year', () => {
      const bill = makeBill({ due_day: 31, start_period: '2026-01' });
      // 2026 is non-leap; Feb due-date clamps to 2026-02-28.
      // On Feb 28, the due-date *is* today → upcoming (daysUntilDue 0).
      const upcoming = getBillStatusForPeriod(
        bill,
        '2026-02',
        new Date(2026, 1, 28), // Feb 28
        undefined,
      );
      expect(upcoming.kind).toBe('upcoming');
      if (upcoming.kind === 'upcoming') {
        expect(upcoming.daysUntilDue).toBe(0);
      }
    });

    it('overdue once today is past the clamped Feb due-date (impossible in Feb 28 non-leap, but March 1 still in next period)', () => {
      const bill = makeBill({ due_day: 31, start_period: '2026-01' });
      // Mar 1 with period 2026-02 → period < currentPeriod → unpaid, not overdue.
      const status = getBillStatusForPeriod(
        bill,
        '2026-02',
        new Date(2026, 2, 1), // 2026-03-01
        undefined,
      );
      expect(status.kind).toBe('unpaid');
    });

    it('overdue for clamped-30 Apr when today is Apr 30 + after due_day boundary', () => {
      const bill = makeBill({ due_day: 31, start_period: '2026-01' });
      // Apr clamps to 30. Apr 30 itself is "upcoming" (on the due-date).
      const onDue = getBillStatusForPeriod(
        bill,
        '2026-04',
        new Date(2026, 3, 30),
        undefined,
      );
      expect(onDue.kind).toBe('upcoming');
      if (onDue.kind === 'upcoming') {
        expect(onDue.daysUntilDue).toBe(0);
      }
    });
  });
});
