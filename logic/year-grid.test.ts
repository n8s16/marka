import { getYearGridCell, type Bill, type BillPayment } from './year-grid';

type BillCadenceForCell = Pick<
  Bill,
  'frequency' | 'interval_months' | 'start_period' | 'auto_forecast' | 'expected_amount'
>;

function makeBill(overrides: Partial<BillCadenceForCell> = {}): BillCadenceForCell {
  return {
    frequency: 'monthly',
    interval_months: null,
    start_period: '2026-01',
    auto_forecast: false,
    expected_amount: 159900,
    ...overrides,
  };
}

function makePayment(overrides: Partial<BillPayment> = {}): BillPayment {
  return {
    id: 'p',
    bill_id: 'b',
    wallet_id: 'w',
    amount: 200000,
    paid_date: '2026-04-15',
    period: '2026-04',
    note: null,
    created_at: '2026-04-15T08:00:00.000Z',
    updated_at: '2026-04-15T08:00:00.000Z',
    ...overrides,
  };
}

describe('getYearGridCell', () => {
  describe('paid path', () => {
    it('returns kind=paid with the same payment reference when a payment exists', () => {
      // Arrange
      const bill = makeBill({ auto_forecast: false, expected_amount: 159900 });
      const payment = makePayment({ period: '2026-04', amount: 200000 });

      // Act
      const cell = getYearGridCell(bill, '2026-04', payment, []);

      // Assert
      expect(cell).toEqual({ kind: 'paid', payment });
      // Confirm we don't clone or transform the payment row.
      if (cell.kind === 'paid') {
        expect(cell.payment).toBe(payment);
      }
    });
  });

  describe('forecast path — auto_forecast: false', () => {
    it('returns expected_amount for a monthly due-period with no payment', () => {
      // Arrange
      const bill = makeBill({
        frequency: 'monthly',
        start_period: '2026-01',
        auto_forecast: false,
        expected_amount: 159900,
      });

      // Act
      const cell = getYearGridCell(bill, '2026-05', undefined, []);

      // Assert
      expect(cell).toEqual({ kind: 'forecast', amount: 159900 });
    });
  });

  describe('forecast path — auto_forecast: true', () => {
    it('uses the average of the last 3 recent payments', () => {
      // Arrange
      const bill = makeBill({
        frequency: 'monthly',
        start_period: '2026-01',
        auto_forecast: true,
        expected_amount: 999999, // should NOT be used when payments exist
      });
      const recent = [
        makePayment({ id: 'p3', amount: 300, period: '2026-03' }),
        makePayment({ id: 'p2', amount: 200, period: '2026-02' }),
        makePayment({ id: 'p1', amount: 100, period: '2026-01' }),
      ];

      // Act
      const cell = getYearGridCell(bill, '2026-06', undefined, recent);

      // Assert: (100 + 200 + 300) / 3 = 200
      expect(cell).toEqual({ kind: 'forecast', amount: 200 });
    });

    it('falls back to expected_amount when zero recent payments are passed', () => {
      // Arrange
      const bill = makeBill({
        frequency: 'monthly',
        start_period: '2026-01',
        auto_forecast: true,
        expected_amount: 159900,
      });

      // Act
      const cell = getYearGridCell(bill, '2026-06', undefined, []);

      // Assert
      expect(cell).toEqual({ kind: 'forecast', amount: 159900 });
    });
  });

  describe('not_due path', () => {
    it('returns not_due for a quarterly bill on an off-cycle month', () => {
      // Arrange: quarterly anchored at 2026-03 → due Mar/Jun/Sep/Dec; April is off-cycle.
      const bill = makeBill({
        frequency: 'quarterly',
        start_period: '2026-03',
      });

      // Act
      const cell = getYearGridCell(bill, '2026-04', undefined, []);

      // Assert
      expect(cell).toEqual({ kind: 'not_due' });
    });

    it('returns not_due for a yearly bill on a non-anniversary month', () => {
      // Arrange: yearly anchored at 2026-08; March is not the bill's month.
      const bill = makeBill({
        frequency: 'yearly',
        start_period: '2026-08',
      });

      // Act
      const cell = getYearGridCell(bill, '2026-03', undefined, []);

      // Assert
      expect(cell).toEqual({ kind: 'not_due' });
    });

    it('returns not_due for a custom bi-monthly bill on an off-cycle month', () => {
      // Arrange: every 2 months from 2026-04 → Apr/Jun/Aug/...; May is off-cycle.
      const bill = makeBill({
        frequency: 'custom',
        interval_months: 2,
        start_period: '2026-04',
      });

      // Act
      const cell = getYearGridCell(bill, '2026-05', undefined, []);

      // Assert
      expect(cell).toEqual({ kind: 'not_due' });
    });

    it('returns not_due for a period earlier than start_period, even for monthly bills', () => {
      // Arrange: monthly anchored at 2026-04; Jan 2026 predates the start.
      const bill = makeBill({
        frequency: 'monthly',
        start_period: '2026-04',
      });

      // Act
      const cell = getYearGridCell(bill, '2026-01', undefined, []);

      // Assert
      expect(cell).toEqual({ kind: 'not_due' });
    });
  });

  describe('forecast NEVER overwrites paid', () => {
    it('returns paid even when auto_forecast is true and the period is a due-month', () => {
      // Arrange
      const bill = makeBill({
        frequency: 'monthly',
        start_period: '2026-01',
        auto_forecast: true,
        expected_amount: 159900,
      });
      const payment = makePayment({ period: '2026-04', amount: 200000 });
      const recent = [
        makePayment({ id: 'p3', amount: 999, period: '2026-03' }),
        makePayment({ id: 'p2', amount: 999, period: '2026-02' }),
        makePayment({ id: 'p1', amount: 999, period: '2026-01' }),
      ];

      // Act
      const cell = getYearGridCell(bill, '2026-04', payment, recent);

      // Assert: forecast branch never runs.
      expect(cell).toEqual({ kind: 'paid', payment });
    });
  });

  describe('malformed cadence', () => {
    it('returns not_due for custom frequency with null interval_months and does not crash', () => {
      // Arrange: caller misuse — custom requires interval_months. isPeriodDueForBill
      // returns false for malformed cadence, so the cell falls through to not_due.
      const bill = makeBill({
        frequency: 'custom',
        interval_months: null,
        start_period: '2026-01',
      });

      // Act
      const cell = getYearGridCell(bill, '2026-05', undefined, []);

      // Assert
      expect(cell).toEqual({ kind: 'not_due' });
    });
  });
});
