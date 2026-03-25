import { InMemoryCommandQueue } from './CommandQueue';
import { CompletePreparationWorker } from './workers/CompletePreparationWorker';
import { DeployFleetWorker } from './workers/DeployFleetWorker';
import { FailPreparationWorker } from './workers/FailPreparationWorker';
import { PrepareFleetWorker } from './workers/PrepareFleetWorker';
import { ReserveResourcesWorker } from './workers/ReserveResourcesWorker';
import { ResolveBattleWorker } from './workers/ResolveBattleWorker';
import { StartBattleWorker } from './workers/StartBattleWorker';
import type { CommandWorkerServices, ICommandQueue } from './types';

/**
 * Creates a command queue with all workers registered.
 */
export function createCommandQueue(services: CommandWorkerServices): ICommandQueue {
  const queue = new InMemoryCommandQueue(services);

  queue.registerWorker(PrepareFleetWorker);
  queue.registerWorker(ReserveResourcesWorker);
  queue.registerWorker(CompletePreparationWorker);
  queue.registerWorker(FailPreparationWorker);
  queue.registerWorker(DeployFleetWorker);
  queue.registerWorker(StartBattleWorker);
  queue.registerWorker(ResolveBattleWorker);

  return queue;
}
