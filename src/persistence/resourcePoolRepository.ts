import { DuplicateIdError, ConcurrencyError, NotFoundError, VersionedEntity } from './types';

/**
 * Resource types (see assignment).
 */
export type ResourceType = 'FUEL' | 'HYPERDRIVE_CORE' | 'BATTLE_DROIDS';

/**
 * Single resource pool entity: total available and reserved amounts.
 * Candidates will enforce total >= reserved and concurrency-safe reservation.
 */
export interface ResourcePool extends VersionedEntity {
  resourceType: ResourceType;
  total: number;
  reserved: number;
}

/**
 * Read-only view of resource availability.
 */
export interface ResourceAvailability {
  resourceType: ResourceType;
  total: number;
  reserved: number;
  available: number;
}

/**
 * Minimal repository interface for resource pools.
 * getByType() and update() support the reservation workflow with optimistic locking.
 */
export interface ResourcePoolRepository {
  create(pool: ResourcePool): void;
  get(id: string): ResourcePool | undefined;
  getOrThrow(id: string): ResourcePool;
  getByType(resourceType: ResourceType): ResourcePool | undefined;
  update(id: string, expectedVersion: number, updater: (entity: ResourcePool) => ResourcePool): void;
  clear(): void;
}

/**
 * In-memory implementation. Index by id; lookup by type via linear scan (fine for 3 types).
 * Candidates can add a type index if needed.
 */
export function createInMemoryResourcePoolRepository(): ResourcePoolRepository {
  const store = new Map<string, ResourcePool>();

  return {
    create(pool: ResourcePool): void {
      if (store.has(pool.id)) {
        throw new DuplicateIdError(pool.id);
      }
      store.set(pool.id, pool);
    },

    get(id: string): ResourcePool | undefined {
      return store.get(id);
    },

    getOrThrow(id: string): ResourcePool {
      const entity = store.get(id);
      if (entity === undefined) {
        throw new NotFoundError(id);
      }
      return entity;
    },

    getByType(resourceType: ResourceType): ResourcePool | undefined {
      for (const pool of store.values()) {
        if (pool.resourceType === resourceType) return pool;
      }
      return undefined;
    },

    update(
      id: string,
      expectedVersion: number,
      updater: (entity: ResourcePool) => ResourcePool,
    ): void {
      const current = store.get(id);
      if (current === undefined) {
        throw new NotFoundError(id);
      }
      if (current.version !== expectedVersion) {
        throw new ConcurrencyError(id, expectedVersion, current.version);
      }
      const updated = updater(current);
      updated.version = expectedVersion + 1;
      store.set(id, updated);
    },

    clear(): void {
      store.clear();
    },
  };
}
