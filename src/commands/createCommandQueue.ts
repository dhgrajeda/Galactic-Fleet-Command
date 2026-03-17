import { BattleMatchmaker } from '../domain/battle/BattleMatchmaker';
import type { FleetStateChangedEvent, CommandSucceededEvent } from '../events';

import { InMemoryCommandQueue } from './CommandQueue';
import { DeployFleetHandler } from './handlers/DeployFleetHandler';
import { PrepareFleetHandler } from './handlers/PrepareFleetHandler';
import { ResolveBattleHandler } from './handlers/ResolveBattleHandler';
import { StartBattleHandler, deriveBattleId } from './handlers/StartBattleHandler';
import type { CommandHandlerServices, ICommandQueue } from './types';

/**
 * Creates a fully configured command queue with all handlers registered
 * and event listeners wired for battle matchmaking.
 */
export function createCommandQueue(services: CommandHandlerServices): ICommandQueue {
  const queue = new InMemoryCommandQueue(services);

  queue.registerHandler(PrepareFleetHandler);
  queue.registerHandler(DeployFleetHandler);
  queue.registerHandler(StartBattleHandler);
  queue.registerHandler(ResolveBattleHandler);

  const matchmaker = new BattleMatchmaker(services.logger.child({ component: 'matchmaker' }));

  // When a fleet is deployed, add it to the matchmaker pool
  services.events.on('fleet:stateChanged', async (event: FleetStateChangedEvent) => {
    if (event.to !== 'Deployed') return;

    const match = await matchmaker.addToPool(event.fleetId);
    if (match) {
      const [fleetAId, fleetBId] = match;
      queue.enqueue({ type: 'StartBattle', payload: { fleetAId, fleetBId } });
    }
  });

  // When a StartBattle command succeeds, enqueue ResolveBattle
  services.events.on('command:succeeded', (event: CommandSucceededEvent) => {
    if (event.command.type !== 'StartBattle') return;

    const battleId = deriveBattleId(event.command.id);
    queue.enqueue({ type: 'ResolveBattle', payload: { battleId } });
  });

  return queue;
}
