import { createPersistenceContext } from '../../../src/persistence/context';
import { createFleet, startPreparation, completePreparation, deployFleet, enterBattle } from '../../../src/domain/fleet';
import { seedResourcePools } from '../../../src/domain/resources';
import { NoopLogger } from '../../../src/logger';
import { ResolveBattleHandler } from '../../../src/commands/handlers/ResolveBattleHandler';
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
  };
  return { ctx, services };
}

function createBattlingFleet(ctx: ReturnType<typeof createPersistenceContext>, name: string, fuel: number) {
  let fleet = createFleet(ctx.fleets, { name });
  fleet = startPreparation(ctx.fleets, fleet.id, fleet.version);
  fleet = completePreparation(ctx.fleets, fleet.id, fleet.version, { FUEL: fuel });
  fleet = deployFleet(ctx.fleets, fleet.id, fleet.version);
  fleet = enterBattle(ctx.fleets, fleet.id, fleet.version);
  return fleet;
}

describe('ResolveBattleHandler', () => {
  it('resolves battle and transitions fleets to Victorious/Destroyed', () => {
    const { ctx, services } = setup();
    const a = createBattlingFleet(ctx, 'Alpha', 500);
    const b = createBattlingFleet(ctx, 'Beta', 10);

    ctx.battles.create({
      id: 'battle-1',
      version: 1,
      fleetAId: a.id,
      fleetBId: b.id,
      status: 'InProgress',
    });

    const cmd: Command = {
      id: 'cmd-resolve-1',
      version: 1,
      type: 'ResolveBattle',
      status: 'Processing',
      payload: { battleId: 'battle-1' },
    };

    const result = ResolveBattleHandler.handle(cmd, services);
    expect(result.success).toBe(true);

    const fleetA = ctx.fleets.getOrThrow(a.id);
    const fleetB = ctx.fleets.getOrThrow(b.id);

    // One should be Victorious, the other Destroyed
    const states = [fleetA.state, fleetB.state].sort();
    expect(states).toEqual(['Destroyed', 'Victorious']);

    // Battle should be resolved
    const battle = ctx.battles.getOrThrow('battle-1');
    expect(battle.status).toBe('Resolved');
    expect(battle.winnerId).toBeDefined();
    expect(battle.loserId).toBeDefined();
  });

  it('is idempotent when battle is already resolved', () => {
    const { ctx, services } = setup();
    const a = createBattlingFleet(ctx, 'Alpha', 100);
    const b = createBattlingFleet(ctx, 'Beta', 100);

    ctx.battles.create({
      id: 'battle-2',
      version: 1,
      fleetAId: a.id,
      fleetBId: b.id,
      status: 'InProgress',
    });

    const cmd: Command = {
      id: 'cmd-resolve-2',
      version: 1,
      type: 'ResolveBattle',
      status: 'Processing',
      payload: { battleId: 'battle-2' },
    };

    ResolveBattleHandler.handle(cmd, services);
    const result = ResolveBattleHandler.handle(cmd, services);
    expect(result.success).toBe(true);
  });
});
