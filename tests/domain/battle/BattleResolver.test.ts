import { calculateScore, resolveBattle } from '../../../src/domain/battle';
import type { Fleet } from '../../../src/persistence';

function makeFleet(id: string, reservedResources: Record<string, number>): Fleet {
  return {
    id,
    version: 1,
    name: id,
    state: 'InBattle',
    ships: [],
    requiredResources: {},
    reservedResources,
    timeline: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe('calculateScore', () => {
  it('uses sum of reserved resources plus base of 50', () => {
    const fleet = makeFleet('a', { FUEL: 100, BATTLE_DROIDS: 50 });
    // With randomFactor = 1.0, score = (100 + 50 + 50) * 1.0 = 200
    expect(calculateScore(fleet, 1.0)).toBe(200);
  });

  it('fleet with no resources still has a base score', () => {
    const fleet = makeFleet('a', {});
    expect(calculateScore(fleet, 1.0)).toBe(50);
  });

  it('randomFactor changes the score', () => {
    const fleet = makeFleet('a', { FUEL: 100 });
    // base = 150, factor = 0.5 → 75
    expect(calculateScore(fleet, 0.5)).toBe(75);
    // factor = 1.5 → 225
    expect(calculateScore(fleet, 1.5)).toBe(225);
  });
});

describe('resolveBattle', () => {
  it('fleet with more resources usually wins', () => {
    const strong = makeFleet('strong', { FUEL: 500, BATTLE_DROIDS: 200 });
    const weak = makeFleet('weak', { FUEL: 10 });

    // Run many times — the strong fleet should win most
    let strongWins = 0;
    for (let i = 0; i < 100; i++) {
      if (resolveBattle(strong, weak) === 'strong') strongWins++;
    }
    expect(strongWins).toBeGreaterThan(70);
  });

  it('returns a valid fleet id', () => {
    const a = makeFleet('fleet-a', { FUEL: 100 });
    const b = makeFleet('fleet-b', { FUEL: 100 });
    const winner = resolveBattle(a, b);
    expect(['fleet-a', 'fleet-b']).toContain(winner);
  });
});
