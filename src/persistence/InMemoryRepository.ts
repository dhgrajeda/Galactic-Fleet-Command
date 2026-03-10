import { ConcurrencyError, DuplicateIdError, NotFoundError, VersionedEntity } from './types';

/**
 * Generic repository interface for versioned entities.
 * Implementations can be in-memory (for this assignment) or swapped for a real store later.
 */
export interface Repository<T extends VersionedEntity> {
  create(entity: T): void;
  get(id: string): T | undefined;
  getOrThrow(id: string): T;
  update(id: string, expectedVersion: number, updater: (entity: T) => T): void;
  delete(id: string, expectedVersion?: number): void;
  clear(): void;
}

/**
 * In-memory repository with optimistic locking.
 * - create(): fails if id already exists.
 * - update(): applies updater only if current version matches expectedVersion; throws on mismatch.
 * - delete(): optional expectedVersion for optimistic delete.
 * - clear(): removes all entries (for tests).
 */
export class InMemoryRepository<T extends VersionedEntity> implements Repository<T> {
  private readonly store = new Map<string, T>();

  create(entity: T): void {
    if (this.store.has(entity.id)) {
      throw new DuplicateIdError(entity.id);
    }
    this.store.set(entity.id, entity);
  }

  get(id: string): T | undefined {
    return this.store.get(id);
  }

  getOrThrow(id: string): T {
    const entity = this.store.get(id);
    if (entity === undefined) {
      throw new NotFoundError(id);
    }
    return entity;
  }

  update(id: string, expectedVersion: number, updater: (entity: T) => T): void {
    const current = this.store.get(id);
    if (current === undefined) {
      throw new NotFoundError(id);
    }
    if (current.version !== expectedVersion) {
      throw new ConcurrencyError(id, expectedVersion, current.version);
    }
    const updated = updater(current);
    updated.version = expectedVersion + 1;
    this.store.set(id, updated);
  }

  delete(id: string, expectedVersion?: number): void {
    const current = this.store.get(id);
    if (current === undefined) {
      throw new NotFoundError(id);
    }
    if (expectedVersion !== undefined && current.version !== expectedVersion) {
      throw new ConcurrencyError(id, expectedVersion, current.version);
    }
    this.store.delete(id);
  }

  clear(): void {
    this.store.clear();
  }
}
