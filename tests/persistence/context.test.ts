import { createInMemoryFleetRepository, createInMemoryCommandRepository, createInMemoryResourcePoolRepository } from '../../src/persistence';
import { createPersistenceContext } from '../../src/persistence/context';

describe('createPersistenceContext', () => {
  it('returns a context with fleets, commands, and resourcePools', () => {
    const ctx = createPersistenceContext();
    expect(ctx.fleets).toBeDefined();
    expect(ctx.commands).toBeDefined();
    expect(ctx.resourcePools).toBeDefined();
  });

  it('each context has independent stores', () => {
    const ctx1 = createPersistenceContext();
    const ctx2 = createPersistenceContext();

    ctx1.fleets.create({
      id: 'f1',
      version: 1,
      name: 'Alpha',
      state: 'Docked',
    });
    expect(ctx1.fleets.get('f1')).toBeDefined();
    expect(ctx2.fleets.get('f1')).toBeUndefined();
  });

  it('context repos support create and get', () => {
    const ctx = createPersistenceContext();
    ctx.fleets.create({
      id: 'f1',
      version: 1,
      name: 'Alpha',
      state: 'Docked',
    });
    ctx.commands.create({
      id: 'c1',
      version: 1,
      type: 'PrepareFleet',
      status: 'Queued',
      payload: { fleetId: 'f1' },
    });
    expect(ctx.fleets.getOrThrow('f1').name).toBe('Alpha');
    expect(ctx.commands.getOrThrow('c1').type).toBe('PrepareFleet');
  });
});

describe('in-memory repository factories', () => {
  it('createInMemoryFleetRepository returns a repository that clears independently', () => {
    const repo = createInMemoryFleetRepository();
    repo.create({ id: 'f1', version: 1, name: 'F1', state: 'Docked' });
    repo.clear();
    expect(repo.get('f1')).toBeUndefined();
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
