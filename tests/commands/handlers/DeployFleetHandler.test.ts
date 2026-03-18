import { createPersistenceContext } from '../../../src/persistence/context';
import { createFleet, startPreparation, completePreparation } from '../../../src/domain/fleet';
import { seedResourcePools } from '../../../src/domain/resources';
import { EventBroker } from '../../../src/events';
import { NoopLogger } from '../../../src/logger';
import { DeployFleetHandler } from '../../../src/commands/handlers/DeployFleetHandler';
import type { CommandHandlerServices } from '../../../src/commands/types';
import type { Command } from '../../../src/persistence';

function setup() {
  const ctx = createPersistenceContext();
  seedResourcePools(ctx.resourcePools);
  const services: CommandHandlerServices = {
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
    id: 'cmd-1',
    version: 1,
    type: 'DeployFleet',
    status: 'Processing',
    payload: { fleetId },
  };
}

function createReadyFleet(ctx: ReturnType<typeof createPersistenceContext>, name: string) {
  let fleet = createFleet(ctx.fleets, { name });
  fleet = startPreparation(ctx.fleets, fleet.id, fleet.version);
  fleet = completePreparation(ctx.fleets, fleet.id, fleet.version, {});
  return fleet;
}

describe('DeployFleetHandler', () => {
  it('transitions fleet from Ready to Deployed', () => {
    const { ctx, services } = setup();
    const fleet = createReadyFleet(ctx, 'Alpha');

    const result = DeployFleetHandler.handle(makeCommand(fleet.id), services);

    expect(result.success).toBe(true);
    expect(ctx.fleets.getOrThrow(fleet.id).state).toBe('Deployed');
  });

  it('is idempotent when fleet is already Deployed', () => {
    const { ctx, services } = setup();
    const fleet = createReadyFleet(ctx, 'Alpha');

    DeployFleetHandler.handle(makeCommand(fleet.id), services);
    const result = DeployFleetHandler.handle(makeCommand(fleet.id), services);

    expect(result.success).toBe(true);
    expect(ctx.fleets.getOrThrow(fleet.id).state).toBe('Deployed');
  });

  it('throws when fleet is not Ready', () => {
    const { ctx, services } = setup();
    const fleet = createFleet(ctx.fleets, { name: 'Alpha' }); // Docked

    expect(() => DeployFleetHandler.handle(makeCommand(fleet.id), services)).toThrow();
  });
});
