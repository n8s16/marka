// Sanity test to prove the Jest runner is wired up. Real logic tests
// (forecasts, currency math, periods, etc.) are owned by
// `business-logic-developer` and `qa-tester`. Delete or replace this once
// real tests exist in `/logic`.

describe('jest sanity', () => {
  it('adds two integers', () => {
    expect(1 + 1).toBe(2);
  });
});
