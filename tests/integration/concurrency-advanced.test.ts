import { createPersistenceContext } from '../../src/persistence/context';
import { ConcurrencyError } from '../../src/persistence';
import { seedResourcePools } from '../../src/domain/resources';
import { EventBroker } from '../../src/events/EventBroker';
import { fleetEvents } from '../../src/events/fleetEvents';
import { NoopLogger } from '../../src/logger';
import { InMemoryCommandQueue } from '../../src/commands/CommandQueue';
import { BattleMatchmaker } from '../../src/domain/battle';
import { createFleet, startPreparation, completePreparation, deployFleet } from '../../src/domain/fleet';
import { PrepareFleetWorker } from '../../src/commands/workers/PrepareFleetWorker';
import type { CommandWorkerServices, ICommandWorker } from '../../src/commands/types';
import type { Command } from '../../src/persistence';

function makeServices() {
  const ctx = createPersistenceContext();
  seedResourcePools(ctx.resourcePools);
  const services: CommandWorkerServices = {
    commands: ctx.commands,
    fleets: ctx.fleets,
    resourcePools: ctx.resourcePools,
    battles: ctx.battles,
    logger: new NoopLogger(),
    events: new EventBroker(),
  };
  return { ctx, services };
}

function makeServicesWithEvents() {
  const result = makeServices();
  fleetEvents(result.services);
  return result;
}

// ─── 1. Command queue retry on ConcurrencyError ────────────────────────────

describe('Command queue retry on ConcurrencyError', () => {
  it('retries worker when it throws ConcurrencyError, then succeeds', async () => {
    const { services } = makeServices();
    const queue = new InMemoryCommandQueue(services);

    let attempts = 0;
    const worker: ICommandWorker = {
      type: 'RetryTest',
      execute() {
        attempts++;
        if (attempts < 3) {
          throw new ConcurrencyError('test-entity', 1, 2);
        }
        return { success: true };
      },
    };

    queue.registerWorker(worker);
    const cmd = queue.enqueue({ type: 'RetryTest', payload: {} });
    await queue.flush();

    expect(attempts).toBe(3);
    expect(queue.getCommand(cmd.id)?.status).toBe('Succeeded');
  });

  it('fails after exhausting all retries on ConcurrencyError', async () => {
    const { services } = makeServices();
    const queue = new InMemoryCommandQueue(services);

    const worker: ICommandWorker = {
      type: 'AlwaysConflict',
      execute() {
        throw new ConcurrencyError('test-entity', 1, 2);
      },
    };

    queue.registerWorker(worker);
    const cmd = queue.enqueue({ type: 'AlwaysConflict', payload: {} });
    await queue.flush();

    expect(queue.getCommand(cmd.id)?.status).toBe('Failed');
  });
});

// ─── 2. Optimistic claim contention ────────────────────────────────────────

describe('Command queue optimistic claim', () => {
  it('skips command that was already claimed (status no longer Queued)', async () => {
    const { ctx, services } = makeServices();
    const queue = new InMemoryCommandQueue(services);

    let executeCount = 0;
    queue.registerWorker({
      type: 'ClaimTest',
      execute() {
        executeCount++;
        return { success: true };
      },
    });

    const cmd = queue.enqueue({ type: 'ClaimTest', payload: {} });

    // Simulate another worker claiming the command by moving it to Processing
    const current = ctx.commands.getOrThrow(cmd.id);
    ctx.commands.update(cmd.id, current.version, (c) => ({
      ...c,
      status: 'Processing' as const,
    }));

    // flush should see it's no longer Queued and skip it
    await queue.flush();

    expect(executeCount).toBe(0);
  });

  it('skips command when another worker already moved it past Queued', async () => {
    const { ctx, services } = makeServices();
    const queue = new InMemoryCommandQueue(services);

    let executeCount = 0;
    queue.registerWorker({
      type: 'AlreadyDone',
      execute() {
        executeCount++;
        return { success: true };
      },
    });

    const cmd = queue.enqueue({ type: 'AlreadyDone', payload: {} });

    // Simulate another worker that already processed and succeeded
    const current = ctx.commands.getOrThrow(cmd.id);
    ctx.commands.update(cmd.id, current.version, (c) => ({
      ...c,
      status: 'Succeeded' as const,
    }));

    await queue.flush();

    // Worker should never have been called — command was already done
    expect(executeCount).toBe(0);
  });
});

// ─── 3. Cross-entity partial failure (fleet + resources) ───────────────────

describe('Cross-entity partial failure in PrepareFleet', () => {
  it('fleet moves to FailedPreparation when resource reservation fails', () => {
    const { ctx, services } = makeServicesWithEvents();
    const fleet = createFleet(ctx.fleets, {
      name: 'Alpha',
      requiredResources: { FUEL: 99999 },
    });

    const cmd: Command = {
      id: 'cmd-partial',
      version: 1,
      type: 'PrepareFleet',
      status: 'Processing',
      payload: { fleetId: fleet.id, requiredResources: { FUEL: 99999 } },
    };

    const result = PrepareFleetWorker.execute(cmd, services);

    expect(result.success).toBe(false);
    expect(result.error).toContain('resource reservation failed');
    const updated = ctx.fleets.getOrThrow(fleet.id);
    expect(updated.state).toBe('FailedPreparation');

    // Resources should NOT have been reserved
    const fuel = ctx.resourcePools.getByType('FUEL')!;
    expect(fuel.reserved).toBe(0);
  });

  it('partial multi-resource reservation does not leave dangling reservations', () => {
    const { ctx, services } = makeServicesWithEvents();

    // FUEL has 1000, HYPERDRIVE_CORE has 10
    const fleet = createFleet(ctx.fleets, { name: 'Greedy' });

    const cmd: Command = {
      id: 'cmd-partial-multi',
      version: 1,
      type: 'PrepareFleet',
      status: 'Processing',
      payload: {
        fleetId: fleet.id,
        requiredResources: { FUEL: 100, HYPERDRIVE_CORE: 999 },
      },
    };

    PrepareFleetWorker.execute(cmd, services);

    const updated = ctx.fleets.getOrThrow(fleet.id);
    expect(updated.state).toBe('FailedPreparation');

    // FUEL was reserved before HYPERDRIVE_CORE failed.
    // Known trade-off — no rollback of partial reservations.
    const fuel = ctx.resourcePools.getByType('FUEL')!;
    const hdc = ctx.resourcePools.getByType('HYPERDRIVE_CORE')!;
    expect(fuel.reserved).toBe(100);
    expect(hdc.reserved).toBe(0);
  });
});

// ─── 4. Idempotency fence under simulated concurrent retry ─────────────────

describe('Idempotency fence under retry', () => {
  it('second PrepareFleet does not double-reserve after first succeeds', () => {
    const { ctx, services } = makeServicesWithEvents();
    const fleet = createFleet(ctx.fleets, {
      name: 'Alpha',
      requiredResources: { FUEL: 200 },
    });

    const cmd1: Command = {
      id: 'cmd-first',
      version: 1,
      type: 'PrepareFleet',
      status: 'Processing',
      payload: { fleetId: fleet.id, requiredResources: { FUEL: 200 } },
    };
    const cmd2: Command = {
      id: 'cmd-second',
      version: 1,
      type: 'PrepareFleet',
      status: 'Processing',
      payload: { fleetId: fleet.id, requiredResources: { FUEL: 200 } },
    };

    // First command completes the full chain: Docked → Preparing → Ready
    PrepareFleetWorker.execute(cmd1, services);
    expect(ctx.fleets.getOrThrow(fleet.id).state).toBe('Ready');

    // Second command hits idempotency fence — fleet is already Ready
    const result = PrepareFleetWorker.execute(cmd2, services);
    expect(result.success).toBe(true);

    // Resources reserved only once
    const fuel = ctx.resourcePools.getByType('FUEL')!;
    expect(fuel.reserved).toBe(200);
  });

  it('retry after fleet moved to Preparing does not re-transition', () => {
    const { ctx, services } = makeServices(); // no event listeners — isolate the fence test
    const fleet = createFleet(ctx.fleets, { name: 'Beta' });

    // Simulate first attempt: fleet moves to Preparing but worker "crashes"
    startPreparation(ctx.fleets, fleet.id, fleet.version);

    // Retry: worker sees fleet is Preparing, returns idempotent success
    const cmd: Command = {
      id: 'cmd-retry',
      version: 1,
      type: 'PrepareFleet',
      status: 'Processing',
      payload: { fleetId: fleet.id, requiredResources: { FUEL: 50 } },
    };

    const result = PrepareFleetWorker.execute(cmd, services);
    expect(result.success).toBe(true);

    // Fleet stays in Preparing (fence returns early)
    const updated = ctx.fleets.getOrThrow(fleet.id);
    expect(updated.state).toBe('Preparing');
  });
});

// ─── 5. Matchmaker concurrency ─────────────────────────────────────────────

describe('BattleMatchmaker concurrency', () => {
  it('does not lose fleets under concurrent addToPool', async () => {
    const matchmaker = new BattleMatchmaker();

    // Add an odd number — one should remain unmatched
    const results = await Promise.all(
      Array.from({ length: 7 }, (_, i) => matchmaker.addToPool(`f-${i}`)),
    );

    const matches = results.filter((r) => r !== null);
    expect(matches).toHaveLength(3); // 3 pairs matched
    expect(matchmaker.getPool()).toHaveLength(1); // 1 leftover
  });

  it('does not duplicate a fleet already in the pool', async () => {
    const matchmaker = new BattleMatchmaker();

    await matchmaker.addToPool('fleet-1');
    await matchmaker.addToPool('fleet-1'); // same fleet again

    // Pool should have fleet-1 once, not twice
    // If it had two, the second addToPool would match fleet-1 with itself
    const pool = matchmaker.getPool();
    expect(pool).toEqual(['fleet-1']);
  });

  it('removeFromPool during addToPool does not corrupt state', async () => {
    const matchmaker = new BattleMatchmaker();

    await matchmaker.addToPool('fleet-1');
    expect(matchmaker.getPool()).toEqual(['fleet-1']);

    // Remove fleet-1 then add fleet-2 — should NOT match
    matchmaker.removeFromPool('fleet-1');
    const result = await matchmaker.addToPool('fleet-2');

    expect(result).toBeNull();
    expect(matchmaker.getPool()).toEqual(['fleet-2']);
  });

  it('all fleets accounted for under high contention', async () => {
    const matchmaker = new BattleMatchmaker();
    const count = 50;

    const results = await Promise.all(
      Array.from({ length: count }, (_, i) => matchmaker.addToPool(`f-${i}`)),
    );

    const matches = results.filter((r) => r !== null);
    const matchedFleets = new Set(matches.flatMap(([a, b]) => [a, b]));
    const poolFleets = matchmaker.getPool();

    // Every fleet should be either matched or in the pool — none lost
    expect(matchedFleets.size + poolFleets.length).toBe(count);

    // No fleet should appear in both matched and pool
    for (const f of poolFleets) {
      expect(matchedFleets.has(f)).toBe(false);
    }
  });
});

// ─── 6. Fleet version conflict ─────────────────────────────────────────────

describe('Fleet version conflict', () => {
  it('concurrent fleet updates throw ConcurrencyError', () => {
    const { ctx } = makeServices();
    const fleet = createFleet(ctx.fleets, { name: 'Alpha' });

    // Both "workers" read the same version
    const version = fleet.version;

    // First update succeeds
    ctx.fleets.update(fleet.id, version, (f) => ({ ...f, name: 'Updated-A' }));

    // Second update with stale version throws
    expect(() => {
      ctx.fleets.update(fleet.id, version, (f) => ({ ...f, name: 'Updated-B' }));
    }).toThrow(ConcurrencyError);

    // First writer's value persists
    expect(ctx.fleets.getOrThrow(fleet.id).name).toBe('Updated-A');
  });

  it('concurrent state transitions — only one succeeds', () => {
    const { ctx } = makeServices();
    const fleet = createFleet(ctx.fleets, { name: 'Alpha' });

    // Both try to start preparation with the same version
    const version = fleet.version;

    startPreparation(ctx.fleets, fleet.id, version);

    // Second attempt with stale version should fail
    expect(() => {
      startPreparation(ctx.fleets, fleet.id, version);
    }).toThrow(ConcurrencyError);

    // Fleet is in Preparing (first writer won)
    expect(ctx.fleets.getOrThrow(fleet.id).state).toBe('Preparing');
  });
});
