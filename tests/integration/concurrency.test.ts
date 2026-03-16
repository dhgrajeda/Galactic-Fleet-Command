import { createPersistenceContext } from '../../src/persistence/context';
import { reserve, InsufficientResourceError, seedResourcePools } from '../../src/domain/resources';

describe('Concurrent Resource Reservation', () => {
  it('does not over-allocate resources under concurrent reservation attempts', () => {
    const ctx = createPersistenceContext();
    seedResourcePools(ctx.resourcePools);

    // Each requests 200 FUEL. Total is 1000, so max 5 can succeed.
    const results: boolean[] = [];
    for (let i = 0; i < 8; i++) {
      try {
        reserve(ctx.resourcePools, { FUEL: 200 });
        results.push(true);
      } catch (err) {
        if (err instanceof InsufficientResourceError) {
          results.push(false);
        } else {
          throw err;
        }
      }
    }

    const successes = results.filter(Boolean).length;
    expect(successes).toBe(5);
    expect(results.filter((r) => !r).length).toBe(3);

    const fuel = ctx.resourcePools.getByType('FUEL')!;
    expect(fuel.reserved).toBe(1000);
    expect(fuel.total - fuel.reserved).toBe(0);
  });
});
