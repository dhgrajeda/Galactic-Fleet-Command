import { randomUUID } from 'crypto';

import { ConcurrencyError } from '../persistence';
import type { Command } from '../persistence';

import type {
  CommandHandlerServices,
  CommandResult,
  ICommandHandler,
  ICommandQueue,
  PostProcessingHook,
} from './types';

const RETRY_DELAYS = [0, 100, 500];

function delay(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * In-memory command queue with optimistic claim, retry, and post-processing hooks.
 */
export class InMemoryCommandQueue implements ICommandQueue {
  private readonly handlers = new Map<string, ICommandHandler>();
  private readonly hooks: PostProcessingHook[] = [];
  private readonly services: CommandHandlerServices;
  private readonly pending: string[] = [];

  constructor(services: CommandHandlerServices) {
    this.services = services;
  }

  registerHandler(handler: ICommandHandler): void {
    this.handlers.set(handler.type, handler);
  }

  onCommandCompleted(hook: PostProcessingHook): void {
    this.hooks.push(hook);
  }

  enqueue(input: Omit<Command, 'id' | 'version' | 'status'>): Command {
    const command: Command = {
      id: randomUUID(),
      version: 1,
      status: 'Queued',
      type: input.type,
      payload: input.payload,
    };
    this.services.commands.create(command);
    this.pending.push(command.id);
    this.services.logger.info('Command enqueued', { commandId: command.id, commandType: command.type });
    return command;
  }

  getCommand(id: string): Command | undefined {
    return this.services.commands.get(id);
  }

  getAllCommands(): Command[] {
    return this.services.commands.getAll();
  }

  /**
   * Process all pending commands. Resolves when all are done (including any
   * commands enqueued by post-processing hooks during this flush).
   */
  async flush(): Promise<void> {
    while (this.pending.length > 0) {
      const id = this.pending.shift()!;
      await this.processCommand(id);
    }
  }

  private async processCommand(id: string): Promise<void> {
    // Optimistic claim: try to move Queued → Processing
    const command = this.services.commands.get(id);
    if (!command || command.status !== 'Queued') return;

    try {
      this.services.commands.update(id, command.version, (cmd) => ({
        ...cmd,
        status: 'Processing' as const,
      }));
    } catch (err) {
      if (err instanceof ConcurrencyError) return; // another instance claimed it
      throw err;
    }

    const log = this.services.logger.child({ commandId: id, commandType: command.type });

    const handler = this.handlers.get(command.type);
    if (!handler) {
      log.error('No handler registered', { commandType: command.type });
      this.markFailed(id, `No handler registered for command type: ${command.type}`);
      return;
    }

    let result: CommandResult | undefined;

    for (let attempt = 0; attempt <= RETRY_DELAYS.length - 1; attempt++) {
      if (attempt > 0) {
        log.warn('Retrying command', { attempt, delayMs: RETRY_DELAYS[attempt] });
        await delay(RETRY_DELAYS[attempt]);
      }

      try {
        const current = this.services.commands.getOrThrow(id);
        result = handler.handle(current, this.services);
        break;
      } catch (err) {
        if (err instanceof ConcurrencyError && attempt < RETRY_DELAYS.length - 1) {
          continue;
        }
        result = { success: false, error: err instanceof Error ? err.message : String(err) };
        break;
      }
    }

    if (!result) {
      result = { success: false, error: 'Unknown error' };
    }

    if (result.success) {
      log.info('Command succeeded');
      this.markSucceeded(id);
      const cmd = this.services.commands.getOrThrow(id);
      for (const hook of this.hooks) {
        await hook(cmd, this.services);
      }
    } else {
      log.error('Command failed', { error: result.error });
      this.markFailed(id, result.error);
    }
  }

  private markSucceeded(id: string): void {
    const cmd = this.services.commands.get(id);
    if (!cmd) return;
    this.services.commands.update(id, cmd.version, (c) => ({
      ...c,
      status: 'Succeeded' as const,
    }));
  }

  private markFailed(id: string, error?: string): void {
    const cmd = this.services.commands.get(id);
    if (!cmd) return;
    this.services.commands.update(id, cmd.version, (c) => ({
      ...c,
      status: 'Failed' as const,
      payload: { ...c.payload, error },
    }));
  }
}
