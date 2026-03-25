import { createPersistenceContext } from '../../../src/persistence/context';
import { createFleet, startPreparation, completePreparation, deployFleet } from '../../../src/domain/fleet';
import { seedResourcePools } from '../../../src/domain/resources';
import { EventBroker } from '../../../src/events/EventBroker';
import { NoopLogger } from '../../../src/logger';
import { StartBattleWorker } from '../../../src/commands/workers/StartBattleWorker';
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

function createDeployedFleet(ctx: ReturnType<typeof createPersistenceContext>, name: string) {
  let fleet = createFleet(ctx.fleets, { name });
  fleet = startPreparation(ctx.fleets, fleet.id, fleet.version);
  fleet = completePreparation(ctx.fleets, fleet.id, fleet.version, { FUEL: 10 });
  fleet = deployFleet(ctx.fleets, fleet.id, fleet.version);
  return fleet;
}

function makeCommand(fleetAId: string, fleetBId: string): Command {
  return {
    id: 'cmd-battle-1',
    version: 1,
    type: 'StartBattle',
    status: 'Processing',
    payload: { fleetAId, fleetBId },
  };
}

describe('StartBattleWorker', () => {
  it('transitions both fleets to InBattle', () => {
    const { ctx, services } = setup();
    const a = createDeployedFleet(ctx, 'Alpha');
    const b = createDeployedFleet(ctx, 'Beta');

    const result = StartBattleWorker.execute(makeCommand(a.id, b.id), services);

    expect(result.success).toBe(true);
    expect(ctx.fleets.getOrThrow(a.id).state).toBe('InBattle');
    expect(ctx.fleets.getOrThrow(b.id).state).toBe('InBattle');
  });

  it('creates a battle record', () => {
    const { ctx, services } = setup();
    const a = createDeployedFleet(ctx, 'Alpha');
    const b = createDeployedFleet(ctx, 'Beta');

    StartBattleWorker.execute(makeCommand(a.id, b.id), services);

    const battle = ctx.battles.get('battle-cmd-battle-1');
    expect(battle).toBeDefined();
    expect(battle?.fleetAId).toBe(a.id);
    expect(battle?.fleetBId).toBe(b.id);
    expect(battle?.status).toBe('InProgress');
  });

  it('is idempotent on retry', () => {
    const { ctx, services } = setup();
    const a = createDeployedFleet(ctx, 'Alpha');
    const b = createDeployedFleet(ctx, 'Beta');

    const cmd = makeCommand(a.id, b.id);
    StartBattleWorker.execute(cmd, services);
    const result = StartBattleWorker.execute(cmd, services);

    expect(result.success).toBe(true);
  });
});
