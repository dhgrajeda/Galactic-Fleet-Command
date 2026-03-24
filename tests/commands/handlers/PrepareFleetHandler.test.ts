import { createPersistenceContext } from '../../../src/persistence/context';
import { createFleet } from '../../../src/domain/fleet';
import { seedResourcePools } from '../../../src/domain/resources';
import { EventBroker } from '../../../src/events';
import { NoopLogger } from '../../../src/logger';
import { PrepareFleetWorker } from '../../../src/commands/workers/PrepareFleetWorker';
import type { CommandWorkerServices } from '../../../src/commands/types';
import type { Command } from '../../../src/persistence';

function setup() {
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

function makeCommand(fleetId: string, requiredResources?: Record<string, number>): Command {
  return {
    id: 'cmd-1',
    version: 1,
    type: 'PrepareFleet',
    status: 'Processing',
    payload: { fleetId, requiredResources },
  };
}

describe('PrepareFleetWorker', () => {
  it('transitions fleet from Docked to Ready when resources are available', () => {
    const { ctx, services } = setup();
    const fleet = createFleet(ctx.fleets, { name: 'Alpha', requiredResources: { FUEL: 100 } });

    const result = PrepareFleetWorker.execute(makeCommand(fleet.id, { FUEL: 100 }), services);

    expect(result.success).toBe(true);
    const updated = ctx.fleets.getOrThrow(fleet.id);
    expect(updated.state).toBe('Ready');
    expect(updated.reservedResources).toEqual({ FUEL: 100 });
  });

  it('transitions fleet to FailedPreparation when resources are insufficient', () => {
    const { ctx, services } = setup();
    const fleet = createFleet(ctx.fleets, { name: 'Alpha' });

    const result = PrepareFleetWorker.execute(makeCommand(fleet.id, { FUEL: 9999 }), services);

    expect(result.success).toBe(true); // command succeeds even though prep failed
    const updated = ctx.fleets.getOrThrow(fleet.id);
    expect(updated.state).toBe('FailedPreparation');
  });

  it('is idempotent when fleet is already Preparing', () => {
    const { ctx, services } = setup();
    const fleet = createFleet(ctx.fleets, { name: 'Alpha' });
    // Manually transition to Preparing
    ctx.fleets.update(fleet.id, fleet.version, (f) => ({ ...f, state: 'Preparing' as const }));

    const result = PrepareFleetWorker.execute(makeCommand(fleet.id, { FUEL: 100 }), services);

    expect(result.success).toBe(true);
    const updated = ctx.fleets.getOrThrow(fleet.id);
    expect(updated.state).toBe('Preparing'); // unchanged
  });

  it('is idempotent when fleet is already Ready', () => {
    const { ctx, services } = setup();
    const fleet = createFleet(ctx.fleets, { name: 'Alpha' });
    // First prepare
    PrepareFleetWorker.execute(makeCommand(fleet.id, { FUEL: 50 }), services);
    const ready = ctx.fleets.getOrThrow(fleet.id);
    expect(ready.state).toBe('Ready');

    // Second prepare — idempotent
    const result = PrepareFleetWorker.execute(makeCommand(fleet.id, { FUEL: 50 }), services);
    expect(result.success).toBe(true);

    // Resources should NOT be double-reserved
    const fuel = ctx.resourcePools.getByType('FUEL')!;
    expect(fuel.reserved).toBe(50);
  });

  it('uses fleet requiredResources when none provided in command', () => {
    const { ctx, services } = setup();
    const fleet = createFleet(ctx.fleets, { name: 'Alpha', requiredResources: { FUEL: 200 } });

    const cmd: Command = {
      id: 'cmd-2',
      version: 1,
      type: 'PrepareFleet',
      status: 'Processing',
      payload: { fleetId: fleet.id },
    };

    PrepareFleetWorker.execute(cmd, services);

    const updated = ctx.fleets.getOrThrow(fleet.id);
    expect(updated.state).toBe('Ready');
    expect(updated.reservedResources).toEqual({ FUEL: 200 });
  });
});
