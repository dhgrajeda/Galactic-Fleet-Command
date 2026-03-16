import { BattleMatchmaker } from '../../../src/domain/battle';

describe('BattleMatchmaker', () => {
  it('returns null when only one fleet is in pool', async () => {
    const matchmaker = new BattleMatchmaker();
    const result = await matchmaker.addToPool('fleet-1');
    expect(result).toBeNull();
  });

  it('matches two fleets when both are in pool', async () => {
    const matchmaker = new BattleMatchmaker();
    await matchmaker.addToPool('fleet-1');
    const result = await matchmaker.addToPool('fleet-2');
    expect(result).toEqual(['fleet-1', 'fleet-2']);
  });

  it('removes matched fleets from pool', async () => {
    const matchmaker = new BattleMatchmaker();
    await matchmaker.addToPool('fleet-1');
    await matchmaker.addToPool('fleet-2');
    expect(matchmaker.getPool()).toEqual([]);
  });

  it('can match multiple pairs', async () => {
    const matchmaker = new BattleMatchmaker();
    await matchmaker.addToPool('a');
    const r1 = await matchmaker.addToPool('b');
    expect(r1).toEqual(['a', 'b']);

    await matchmaker.addToPool('c');
    const r2 = await matchmaker.addToPool('d');
    expect(r2).toEqual(['c', 'd']);
  });

  it('removeFromPool prevents matching', async () => {
    const matchmaker = new BattleMatchmaker();
    await matchmaker.addToPool('fleet-1');
    matchmaker.removeFromPool('fleet-1');
    const result = await matchmaker.addToPool('fleet-2');
    expect(result).toBeNull();
  });

  it('handles concurrent addToPool safely', async () => {
    const matchmaker = new BattleMatchmaker();
    // Add many fleets concurrently
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => matchmaker.addToPool(`fleet-${i}`)),
    );

    const matches = results.filter((r) => r !== null);
    expect(matches).toHaveLength(5); // 10 fleets = 5 pairs
    expect(matchmaker.getPool()).toEqual([]);
  });
});
