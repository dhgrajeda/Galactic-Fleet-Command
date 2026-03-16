import { BattleMatchmaker } from '../domain/battle/BattleMatchmaker';

import { InMemoryCommandQueue } from './CommandQueue';
import { DeployFleetHandler } from './handlers/DeployFleetHandler';
import { PrepareFleetHandler } from './handlers/PrepareFleetHandler';
import { ResolveBattleHandler } from './handlers/ResolveBattleHandler';
import { StartBattleHandler, deriveBattleId } from './handlers/StartBattleHandler';
import type { CommandHandlerServices, ICommandQueue } from './types';

/**
 * Creates a fully configured command queue with all handlers registered
 * and post-processing hooks wired for battle matchmaking.
 */
export function createCommandQueue(services: CommandHandlerServices): ICommandQueue {
  const queue = new InMemoryCommandQueue(services);

  // Register handlers
  queue.registerHandler(PrepareFleetHandler);
  queue.registerHandler(DeployFleetHandler);
  queue.registerHandler(StartBattleHandler);
  queue.registerHandler(ResolveBattleHandler);

  // Battle matchmaker — post-processing hooks
  const matchmaker = new BattleMatchmaker();

  queue.onCommandCompleted(async (command) => {
    if (command.type === 'DeployFleet') {
      const { fleetId } = command.payload as { fleetId: string };
      const match = await matchmaker.addToPool(fleetId);
      if (match) {
        const [fleetAId, fleetBId] = match;
        queue.enqueue({
          type: 'StartBattle',
          payload: { fleetAId, fleetBId },
        });
      }
    }

    if (command.type === 'StartBattle') {
      const battleId = deriveBattleId(command.id);
      queue.enqueue({
        type: 'ResolveBattle',
        payload: { battleId },
      });
    }
  });

  return queue;
}
