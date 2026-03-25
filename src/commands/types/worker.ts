import type { Command } from '../../persistence';
import type { CommandWorkerServices } from './services';

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
