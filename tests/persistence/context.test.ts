import { createInMemoryFleetRepository, createInMemoryCommandRepository, createInMemoryResourcePoolRepository } from '../../src/persistence';
import { createPersistenceContext } from '../../src/persistence/context';
import { createFleet } from '../../src/domain/fleet';

describe('createPersistenceContext', () => {
  it('returns a context with fleets, commands, resourcePools, and battles', () => {
    const ctx = createPersistenceContext();
    expect(ctx.fleets).toBeDefined();
    expect(ctx.commands).toBeDefined();
    expect(ctx.resourcePools).toBeDefined();
    expect(ctx.battles).toBeDefined();
  });

  it('each context has independent stores', () => {
    const ctx1 = createPersistenceContext();
    const ctx2 = createPersistenceContext();

    const fleet = createFleet(ctx1.fleets, { name: 'Alpha' });
    expect(ctx1.fleets.get(fleet.id)).toBeDefined();
    expect(ctx2.fleets.get(fleet.id)).toBeUndefined();
  });

  it('context repos support create and get', () => {
    const ctx = createPersistenceContext();
    const fleet = createFleet(ctx.fleets, { name: 'Alpha' });
    ctx.commands.create({
      id: 'c1',
      version: 1,
      type: 'PrepareFleet',
      status: 'Queued',
      payload: { fleetId: fleet.id },
    });
    expect(ctx.fleets.getOrThrow(fleet.id).name).toBe('Alpha');
    expect(ctx.commands.getOrThrow('c1').type).toBe('PrepareFleet');
  });

  it('returns empty resource pools (no auto-seeding)', () => {
    const ctx = createPersistenceContext();
    expect(ctx.resourcePools.getByType('FUEL')).toBeUndefined();
  });
});

describe('in-memory repository factories', () => {
  it('createInMemoryFleetRepository returns a repository that clears independently', () => {
    const repo = createInMemoryFleetRepository();
    const fleet = createFleet(repo, { name: 'F1' });
    repo.clear();
    expect(repo.get(fleet.id)).toBeUndefined();
  });

  it('createInMemoryCommandRepository supports create and get', () => {
    const repo = createInMemoryCommandRepository();
    repo.create({
      id: 'c1',
      version: 1,
      type: 'DeployFleet',
      status: 'Queued',
      payload: {},
    });
    expect(repo.getOrThrow('c1').type).toBe('DeployFleet');
  });

  it('createInMemoryResourcePoolRepository supports create, get, getByType', () => {
    const repo = createInMemoryResourcePoolRepository();
    repo.create({
      id: 'pool-fuel',
      version: 1,
      resourceType: 'FUEL',
      total: 1000,
      reserved: 0,
    });
    const byType = repo.getByType('FUEL');
    expect(byType?.total).toBe(1000);
    expect(repo.getOrThrow('pool-fuel').resourceType).toBe('FUEL');
  });
});
