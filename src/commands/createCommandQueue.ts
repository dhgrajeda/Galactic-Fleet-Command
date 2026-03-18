import { InMemoryCommandQueue } from './CommandQueue';
import { DeployFleetHandler } from './handlers/DeployFleetHandler';
import { PrepareFleetHandler } from './handlers/PrepareFleetHandler';
import { ResolveBattleHandler } from './handlers/ResolveBattleHandler';
import { StartBattleHandler } from './handlers/StartBattleHandler';
import type { CommandHandlerServices, ICommandQueue } from './types';

/**
 * Creates a command queue with all handlers registered.
 */
export function createCommandQueue(services: CommandHandlerServices): ICommandQueue {
  const queue = new InMemoryCommandQueue(services);

  queue.registerHandler(PrepareFleetHandler);
  queue.registerHandler(DeployFleetHandler);
  queue.registerHandler(StartBattleHandler);
  queue.registerHandler(ResolveBattleHandler);

  return queue;
}
