import type { EventBroker } from '../events';
import type { Logger } from '../logger';
import type { BattleRepository, Command, CommandRepository , FleetRepository , ResourcePoolRepository } from '../persistence';

/**
 * Services bag passed to command workers — avoids positional parameters.
 */
export interface CommandWorkerServices {
  commands: CommandRepository;
  fleets: FleetRepository;
  resourcePools: ResourcePoolRepository;
  battles: BattleRepository;
  logger: Logger;
  events: EventBroker;
}

/**
 * Result from a command worker execution.
 */
export interface CommandResult {
  success: boolean;
  error?: string;
}

/**
 * Interface for command workers. Each command type has a worker.
 */
export interface ICommandWorker {
  type: string;
  execute(command: Command, services: CommandWorkerServices): CommandResult;
}

/**
 * Interface for a command queue — abstracted for multi-instance readiness.
 */
export interface ICommandQueue {
  enqueue(command: Omit<Command, 'id' | 'version' | 'status'>): Command;
  registerWorker(worker: ICommandWorker): void;
  flush(): Promise<void>;
  getCommand(id: string): Command | undefined;
  getAllCommands(): Command[];
}
