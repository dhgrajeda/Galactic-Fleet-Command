/**
 * Base type for entities stored with optimistic locking.
 * Repositories use `version` to detect concurrent modifications.
 */
export interface VersionedEntity {
  id: string;
  version: number;
}

/**
 * Thrown when an update fails due to version mismatch (concurrent modification).
 */
export class ConcurrencyError extends Error {
  constructor(
    public readonly entityId: string,
    public readonly expectedVersion: number,
    public readonly actualVersion: number,
  ) {
    super(
      `Concurrency conflict: entity ${entityId} expected version ${expectedVersion} but was ${actualVersion}`,
    );
    this.name = 'ConcurrencyError';
    Object.setPrototypeOf(this, ConcurrencyError.prototype);
  }
}

/**
 * Thrown when an entity is not found (e.g. getOrThrow, update, delete).
 */
export class NotFoundError extends Error {
  constructor(public readonly entityId: string, public readonly entityType?: string) {
    const msg = entityType
      ? `${entityType} not found: ${entityId}`
      : `Entity not found: ${entityId}`;
    super(msg);
    this.name = 'NotFoundError';
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

/**
 * Thrown when create is called with an id that already exists.
 */
export class DuplicateIdError extends Error {
  constructor(public readonly entityId: string) {
    super(`Entity already exists: ${entityId}`);
    this.name = 'DuplicateIdError';
    Object.setPrototypeOf(this, DuplicateIdError.prototype);
  }
}
