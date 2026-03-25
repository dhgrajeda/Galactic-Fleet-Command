import { createPersistenceContext } from '../../../src/persistence/context';
import { createFleet } from '../../../src/domain/fleet';
import { seedResourcePools } from '../../../src/domain/resources';
import { EventBroker } from '../../../src/events/EventBroker';
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
  it('transitions fleet from Docked to Preparing', () => {
    const { ctx, services } = setup();
    const fleet = createFleet(ctx.fleets, { name: 'Alpha', requiredResources: { FUEL: 100 } });

    const result = PrepareFleetWorker.execute(makeCommand(fleet.id, { FUEL: 100 }), services);

    expect(result.success).toBe(true);
    const updated = ctx.fleets.getOrThrow(fleet.id);
    expect(updated.state).toBe('Preparing');
  });

  it('persists requiredResources from command payload before transitioning', () => {
    const { ctx, services } = setup();
    const fleet = createFleet(ctx.fleets, { name: 'Alpha' });

    PrepareFleetWorker.execute(makeCommand(fleet.id, { FUEL: 300 }), services);

    const updated = ctx.fleets.getOrThrow(fleet.id);
    expect(updated.state).toBe('Preparing');
    expect(updated.requiredResources).toEqual({ FUEL: 300 });
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
    // Manually transition to Ready
    ctx.fleets.update(fleet.id, fleet.version, (f) => ({ ...f, state: 'Preparing' as const }));
    const preparing = ctx.fleets.getOrThrow(fleet.id);
    ctx.fleets.update(fleet.id, preparing.version, (f) => ({ ...f, state: 'Ready' as const }));

    const result = PrepareFleetWorker.execute(makeCommand(fleet.id, { FUEL: 50 }), services);

    expect(result.success).toBe(true);
    const updated = ctx.fleets.getOrThrow(fleet.id);
    expect(updated.state).toBe('Ready');
  });

  it('emits fleet:stateChanged event', () => {
    const { ctx, services } = setup();
    const fleet = createFleet(ctx.fleets, { name: 'Alpha' });

    const events: unknown[] = [];
    services.events.subscribe('fleet:stateChanged', (e) => events.push(e));

    PrepareFleetWorker.execute(makeCommand(fleet.id), services);

    expect(events).toEqual([
      { fleetId: fleet.id, from: 'Docked', to: 'Preparing' },
    ]);
  });
});
