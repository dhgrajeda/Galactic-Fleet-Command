import { VersionedEntity } from './types';

import { InMemoryRepository } from './InMemoryRepository';
import type { Repository } from './InMemoryRepository';

/**
 * Command lifecycle (see assignment).
 */
export type CommandStatus = 'Queued' | 'Processing' | 'Succeeded' | 'Failed';

/**
 * Minimal command entity for persistence.
 * Candidates can extend with attemptCount, timestamps, error, idempotency key, etc.
 */
export interface Command extends VersionedEntity {
  type: string;
  status: CommandStatus;
  payload: Record<string, unknown>;
}

export type CommandRepository = Repository<Command>;

export function createInMemoryCommandRepository(): CommandRepository {
  return new InMemoryRepository<Command>();
}
