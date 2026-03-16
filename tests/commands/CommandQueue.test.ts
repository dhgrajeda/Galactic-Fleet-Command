import { createPersistenceContext } from '../../src/persistence/context';
import { seedResourcePools } from '../../src/domain/resources';
import { NoopLogger } from '../../src/logger';
import { InMemoryCommandQueue } from '../../src/commands/CommandQueue';
import type { ICommandHandler, CommandHandlerServices } from '../../src/commands/types';
import type { Command } from '../../src/persistence';

function makeQueue() {
  const ctx = createPersistenceContext();
  seedResourcePools(ctx.resourcePools);
  const services: CommandHandlerServices = {
    commands: ctx.commands,
    fleets: ctx.fleets,
    resourcePools: ctx.resourcePools,
    battles: ctx.battles,
    logger: new NoopLogger(),
  };
  const queue = new InMemoryCommandQueue(services);
  return { queue, services, ctx };
}

function makeHandler(type: string, fn?: (cmd: Command, svc: CommandHandlerServices) => void): ICommandHandler {
  return {
    type,
    handle(cmd, svc) {
      if (fn) fn(cmd, svc);
      return { success: true };
    },
  };
}

describe('InMemoryCommandQueue', () => {
  it('enqueues a command in Queued status', () => {
    const { queue } = makeQueue();
    const cmd = queue.enqueue({ type: 'TestCommand', payload: { foo: 'bar' } });
    expect(cmd.status).toBe('Queued');
    expect(cmd.type).toBe('TestCommand');
    expect(cmd.payload).toEqual({ foo: 'bar' });
  });

  it('assigns a unique id to each command', () => {
    const { queue } = makeQueue();
    const a = queue.enqueue({ type: 'TestCommand', payload: {} });
    const b = queue.enqueue({ type: 'TestCommand', payload: {} });
    expect(a.id).not.toBe(b.id);
  });

  it('processes a command to Succeeded', async () => {
    const { queue } = makeQueue();
    queue.registerHandler(makeHandler('TestCommand'));
    const cmd = queue.enqueue({ type: 'TestCommand', payload: {} });

    await queue.flush();

    const result = queue.getCommand(cmd.id);
    expect(result?.status).toBe('Succeeded');
  });

  it('marks command as Failed when no handler is registered', async () => {
    const { queue } = makeQueue();
    const cmd = queue.enqueue({ type: 'UnknownCommand', payload: {} });

    await queue.flush();

    const result = queue.getCommand(cmd.id);
    expect(result?.status).toBe('Failed');
  });

  it('marks command as Failed when handler throws', async () => {
    const { queue } = makeQueue();
    queue.registerHandler({
      type: 'FailCommand',
      handle() {
        throw new Error('something broke');
      },
    });
    const cmd = queue.enqueue({ type: 'FailCommand', payload: {} });

    await queue.flush();

    const result = queue.getCommand(cmd.id);
    expect(result?.status).toBe('Failed');
  });

  it('fires post-processing hooks on success', async () => {
    const { queue } = makeQueue();
    queue.registerHandler(makeHandler('TestCommand'));

    const hookCalls: string[] = [];
    queue.onCommandCompleted((cmd) => {
      hookCalls.push(cmd.type);
    });

    queue.enqueue({ type: 'TestCommand', payload: {} });
    await queue.flush();

    expect(hookCalls).toEqual(['TestCommand']);
  });

  it('does not fire hooks on failure', async () => {
    const { queue } = makeQueue();
    queue.registerHandler({
      type: 'FailCommand',
      handle() {
        throw new Error('fail');
      },
    });

    const hookCalls: string[] = [];
    queue.onCommandCompleted((cmd) => {
      hookCalls.push(cmd.type);
    });

    queue.enqueue({ type: 'FailCommand', payload: {} });
    await queue.flush();

    expect(hookCalls).toEqual([]);
  });

  it('processes commands enqueued by hooks during flush', async () => {
    const { queue } = makeQueue();
    queue.registerHandler(makeHandler('FirstCommand'));
    queue.registerHandler(makeHandler('FollowUpCommand'));

    queue.onCommandCompleted((cmd, svc) => {
      if (cmd.type === 'FirstCommand') {
        queue.enqueue({ type: 'FollowUpCommand', payload: {} });
      }
    });

    queue.enqueue({ type: 'FirstCommand', payload: {} });
    await queue.flush();

    const all = queue.getAllCommands();
    expect(all).toHaveLength(2);
    expect(all.every((c) => c.status === 'Succeeded')).toBe(true);
  });

  it('getAllCommands returns all enqueued commands', async () => {
    const { queue } = makeQueue();
    queue.registerHandler(makeHandler('A'));
    queue.registerHandler(makeHandler('B'));

    queue.enqueue({ type: 'A', payload: {} });
    queue.enqueue({ type: 'B', payload: {} });
    await queue.flush();

    expect(queue.getAllCommands()).toHaveLength(2);
  });

  it('getCommand returns undefined for unknown id', () => {
    const { queue } = makeQueue();
    expect(queue.getCommand('nonexistent')).toBeUndefined();
  });
});
