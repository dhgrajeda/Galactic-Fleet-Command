import { randomUUID } from 'crypto';

import { ConcurrencyError } from '../persistence';
import type { Command } from '../persistence';

import type {
  CommandWorkerServices,
  CommandResult,
  ICommandWorker,
  ICommandQueue,
} from './types';

const RETRY_DELAYS = [0, 100, 500];

function delay(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * In-memory command queue with optimistic claim, retry, and EventBus integration.
 */
export class InMemoryCommandQueue implements ICommandQueue {
  private readonly workers = new Map<string, ICommandWorker>();
  private readonly services: CommandWorkerServices;
  private readonly pending: string[] = [];

  constructor(services: CommandWorkerServices) {
    this.services = services;
  }

  registerWorker(worker: ICommandWorker): void {
    this.workers.set(worker.type, worker);
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
   * commands enqueued by event listeners during this flush).
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

    const worker = this.workers.get(command.type);
    if (!worker) {
      log.error('No worker registered', { commandType: command.type });
      this.markFailed(id, `No worker registered for command type: ${command.type}`);
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
        result = worker.execute(current, this.services);
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
      this.services.events.publish('command:succeeded', { command: cmd });
    } else {
      log.error('Command failed', { error: result.error });
      this.markFailed(id, result.error);
      const cmd = this.services.commands.getOrThrow(id);
      this.services.events.publish('command:failed', { command: cmd, error: result.error });
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
