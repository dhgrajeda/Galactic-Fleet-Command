import type { Command } from '../../persistence';
import type { ICommandWorker } from './worker';

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
