import { createInMemoryResourcePoolRepository } from '../../../src/persistence';
import type { ResourcePoolRepository } from '../../../src/persistence';
import { reserve, release, getAvailability, InsufficientResourceError } from '../../../src/domain/resources';

function seedPools(repo: ResourcePoolRepository) {
  repo.create({ id: 'fuel-pool', version: 1, resourceType: 'FUEL', total: 1000, reserved: 0 });
  repo.create({ id: 'hdc-pool', version: 1, resourceType: 'HYPERDRIVE_CORE', total: 10, reserved: 0 });
  repo.create({ id: 'bd-pool', version: 1, resourceType: 'BATTLE_DROIDS', total: 500, reserved: 0 });
}

describe('reserve', () => {
  it('reserves requested amounts', () => {
    const repo = createInMemoryResourcePoolRepository();
    seedPools(repo);

    reserve(repo, { FUEL: 100, HYPERDRIVE_CORE: 2 });

    const fuel = repo.getByType('FUEL')!;
    expect(fuel.reserved).toBe(100);
    const hdc = repo.getByType('HYPERDRIVE_CORE')!;
    expect(hdc.reserved).toBe(2);
  });

  it('throws InsufficientResourceError when not enough available', () => {
    const repo = createInMemoryResourcePoolRepository();
    seedPools(repo);

    expect(() => reserve(repo, { FUEL: 1001 })).toThrow(InsufficientResourceError);
  });

  it('throws InsufficientResourceError for unknown resource type', () => {
    const repo = createInMemoryResourcePoolRepository();
    // no pools seeded
    expect(() => reserve(repo, { FUEL: 10 })).toThrow(InsufficientResourceError);
  });

  it('handles multiple sequential reservations', () => {
    const repo = createInMemoryResourcePoolRepository();
    seedPools(repo);

    reserve(repo, { FUEL: 400 });
    reserve(repo, { FUEL: 400 });

    const fuel = repo.getByType('FUEL')!;
    expect(fuel.reserved).toBe(800);
  });

  it('fails when cumulative reservations exceed total', () => {
    const repo = createInMemoryResourcePoolRepository();
    seedPools(repo);

    reserve(repo, { FUEL: 900 });
    expect(() => reserve(repo, { FUEL: 200 })).toThrow(InsufficientResourceError);
  });

  it('skips zero or negative amounts', () => {
    const repo = createInMemoryResourcePoolRepository();
    seedPools(repo);

    const result = reserve(repo, { FUEL: 0, HYPERDRIVE_CORE: -1 });
    expect(result).toEqual({});
  });
});

describe('release', () => {
  it('releases previously reserved amounts', () => {
    const repo = createInMemoryResourcePoolRepository();
    seedPools(repo);

    reserve(repo, { FUEL: 200 });
    release(repo, { FUEL: 200 });

    const fuel = repo.getByType('FUEL')!;
    expect(fuel.reserved).toBe(0);
  });

  it('does not go below zero', () => {
    const repo = createInMemoryResourcePoolRepository();
    seedPools(repo);

    release(repo, { FUEL: 999 });

    const fuel = repo.getByType('FUEL')!;
    expect(fuel.reserved).toBe(0);
  });
});

describe('getAvailability', () => {
  it('returns availability for all resource types', () => {
    const repo = createInMemoryResourcePoolRepository();
    seedPools(repo);

    reserve(repo, { FUEL: 300 });

    const avail = getAvailability(repo);
    expect(avail).toHaveLength(3);

    const fuel = avail.find((a) => a.resourceType === 'FUEL')!;
    expect(fuel.total).toBe(1000);
    expect(fuel.reserved).toBe(300);
    expect(fuel.available).toBe(700);
  });

  it('returns empty array when no pools exist', () => {
    const repo = createInMemoryResourcePoolRepository();
    expect(getAvailability(repo)).toEqual([]);
  });
});
