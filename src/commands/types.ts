import type { BattleRepository, Command, CommandRepository , FleetRepository , ResourcePoolRepository } from '../persistence';



/**
 * Services bag passed to command handlers — avoids positional parameters.
 */
export interface CommandHandlerServices {
  commands: CommandRepository;
  fleets: FleetRepository;
  resourcePools: ResourcePoolRepository;
  battles: BattleRepository;
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
 * Hook called after a command completes successfully.
 */
export type PostProcessingHook = (command: Command, services: CommandHandlerServices) => void | Promise<void>;

/**
 * Interface for a command queue — abstracted for multi-instance readiness.
 */
export interface ICommandQueue {
  enqueue(command: Omit<Command, 'id' | 'version' | 'status'>): Command;
  registerHandler(handler: ICommandHandler): void;
  onCommandCompleted(hook: PostProcessingHook): void;
  flush(): Promise<void>;
  getCommand(id: string): Command | undefined;
  getAllCommands(): Command[];
}
