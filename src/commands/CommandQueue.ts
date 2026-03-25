import { randomUUID } from 'crypto';

import { ConcurrencyError } from '../persistence';
import type { Command } from '../persistence';

import { withRetry } from './retry';
import type { CommandWorkerServices, ICommandWorker, ICommandQueue } from './types';

/**
 * In-memory command queue with optimistic claim, retry, and event integration.
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
    const command = this.claim(id);
    if (!command) return;

    const log = this.services.logger.child({ commandId: id, commandType: command.type });
    const worker = this.workers.get(command.type);

    if (!worker) {
      log.error('No worker registered', { commandType: command.type });
      this.settle(id, { success: false, error: `No worker registered for command type: ${command.type}` });
      return;
    }

    const result = await withRetry(
      () => worker.execute(this.services.commands.getOrThrow(id), this.services),
      log,
    );

    this.settle(id, result);
  }

  /** Optimistic claim: Queued → Processing. Returns the command if claimed, null otherwise. */
  private claim(id: string): Command | null {
    const command = this.services.commands.get(id);
    if (!command || command.status !== 'Queued') return null;

    try {
      this.services.commands.update(id, command.version, (cmd) => ({
        ...cmd,
        status: 'Processing' as const,
      }));
      return command;
    } catch (err) {
      if (err instanceof ConcurrencyError) return null;
      throw err;
    }
  }

  /** Mark a command as Succeeded or Failed and emit the corresponding event. */
  private settle(id: string, result: { success: boolean; error?: string }): void {
    const cmd = this.services.commands.get(id);
    if (!cmd) return;

    if (result.success) {
      this.services.logger.info('Command succeeded', { commandId: id });
      this.services.commands.update(id, cmd.version, (c) => ({
        ...c,
        status: 'Succeeded' as const,
      }));
      const settled = this.services.commands.getOrThrow(id);
      this.services.events.publish('command:succeeded', { command: settled });
    } else {
      this.services.logger.error('Command failed', { commandId: id, error: result.error });
      this.services.commands.update(id, cmd.version, (c) => ({
        ...c,
        status: 'Failed' as const,
        payload: { ...c.payload, error: result.error },
      }));
      const settled = this.services.commands.getOrThrow(id);
      this.services.events.publish('command:failed', { command: settled, error: result.error });
    }
  }
}
