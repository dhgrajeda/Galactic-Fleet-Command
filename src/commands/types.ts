import type { EventBroker } from '../events';
import type { Logger } from '../logger';
import type { BattleRepository, Command, CommandRepository , FleetRepository , ResourcePoolRepository } from '../persistence';

/**
 * Services bag passed to command handlers — avoids positional parameters.
 */
export interface CommandHandlerServices {
  commands: CommandRepository;
  fleets: FleetRepository;
  resourcePools: ResourcePoolRepository;
  battles: BattleRepository;
  logger: Logger;
  events: EventBroker;
}

/**
 * Result from a command handler execution.
 */
export interface CommandResult {
  success: boolean;
  error?: string;
}

/**
 * Interface for command handlers. Each command type has a handler.
 */
export interface ICommandHandler {
  type: string;
  handle(command: Command, services: CommandHandlerServices): CommandResult;
}

/**
 * Interface for a command queue — abstracted for multi-instance readiness.
 */
export interface ICommandQueue {
  enqueue(command: Omit<Command, 'id' | 'version' | 'status'>): Command;
  registerHandler(handler: ICommandHandler): void;
  flush(): Promise<void>;
  getCommand(id: string): Command | undefined;
  getAllCommands(): Command[];
}
