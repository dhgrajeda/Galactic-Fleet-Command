import { createPersistenceContext } from '../../../src/persistence/context';
import { createFleet, startPreparation } from '../../../src/domain/fleet';
import { seedResourcePools } from '../../../src/domain/resources';
import { EventBroker } from '../../../src/events/EventBroker';
import type { ResourceReservedEvent, ResourceReservationFailedEvent } from '../../../src/events/EventBroker';
import { NoopLogger } from '../../../src/logger';
import { ReserveResourcesWorker } from '../../../src/commands/workers/ReserveResourcesWorker';
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

function makeCommand(fleetId: string): Command {
  return {
    id: 'cmd-reserve-1',
    version: 1,
    type: 'ReserveResources',
    status: 'Processing',
    payload: { fleetId },
  };
}

function createPreparingFleet(ctx: ReturnType<typeof setup>['ctx'], resources: Record<string, number>) {
  const fleet = createFleet(ctx.fleets, { name: 'Alpha', requiredResources: resources });
  startPreparation(ctx.fleets, fleet.id, fleet.version);
  return ctx.fleets.getOrThrow(fleet.id);
}

describe('ReserveResourcesWorker', () => {
  it('reserves resources and emits resource:reserved', () => {
    const { ctx, services } = setup();
    const fleet = createPreparingFleet(ctx, { FUEL: 100 });

    const events: ResourceReservedEvent[] = [];
    services.events.subscribe('resource:reserved', (e) => events.push(e));

    const result = ReserveResourcesWorker.execute(makeCommand(fleet.id), services);

    expect(result.success).toBe(true);
    expect(events).toEqual([{ fleetId: fleet.id, reservedResources: { FUEL: 100 } }]);

    const fuel = ctx.resourcePools.getByType('FUEL')!;
    expect(fuel.reserved).toBe(100);
  });

  it('emits resource:reservationFailed when resources are insufficient', () => {
    const { ctx, services } = setup();
    const fleet = createPreparingFleet(ctx, { FUEL: 99999 });

    const events: ResourceReservationFailedEvent[] = [];
    services.events.subscribe('resource:reservationFailed', (e) => events.push(e));

    const result = ReserveResourcesWorker.execute(makeCommand(fleet.id), services);

    expect(result.success).toBe(true);
    expect(events).toHaveLength(1);
    expect(events[0].fleetId).toBe(fleet.id);
    expect(events[0].reason).toContain('FUEL');
  });

  it('is idempotent when fleet is already Ready', () => {
    const { ctx, services } = setup();
    const fleet = createPreparingFleet(ctx, { FUEL: 50 });

    // Manually move to Ready
    ctx.fleets.update(fleet.id, fleet.version, (f) => ({ ...f, state: 'Ready' as const }));

    const events: unknown[] = [];
    services.events.subscribe('resource:reserved', (e) => events.push(e));

    const result = ReserveResourcesWorker.execute(makeCommand(fleet.id), services);

    expect(result.success).toBe(true);
    expect(events).toHaveLength(0); // no event emitted, no double-reservation
  });

  it('fails if fleet is not in Preparing state', () => {
    const { ctx, services } = setup();
    const fleet = createFleet(ctx.fleets, { name: 'Alpha', requiredResources: { FUEL: 100 } });

    const result = ReserveResourcesWorker.execute(makeCommand(fleet.id), services);

    expect(result.success).toBe(false);
    expect(result.error).toContain('expected Preparing');
  });

  it('emits reservationFailed on partial multi-resource failure', () => {
    const { ctx, services } = setup();
    // FUEL has 1000, HYPERDRIVE_CORE has 10
    const fleet = createPreparingFleet(ctx, { FUEL: 100, HYPERDRIVE_CORE: 999 });

    const failed: ResourceReservationFailedEvent[] = [];
    services.events.subscribe('resource:reservationFailed', (e) => failed.push(e));

    ReserveResourcesWorker.execute(makeCommand(fleet.id), services);

    expect(failed).toHaveLength(1);
    expect(failed[0].fleetId).toBe(fleet.id);

    // FUEL reserved before HYPERDRIVE_CORE failed — known trade-off
    const fuel = ctx.resourcePools.getByType('FUEL')!;
    const hdc = ctx.resourcePools.getByType('HYPERDRIVE_CORE')!;
    expect(fuel.reserved).toBe(100);
    expect(hdc.reserved).toBe(0);
  });
});
