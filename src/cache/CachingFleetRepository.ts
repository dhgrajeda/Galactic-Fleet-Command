import type { Fleet, FleetRepository } from '../persistence';

import { LruCache } from './LruCache';

/**
 * LRU cache wrapper around FleetRepository with write-invalidation strategy.
 * Reads populate the cache; writes invalidate the cached entry.
 */
export function createCachingFleetRepository(
  inner: FleetRepository,
  capacity: number = 100,
): FleetRepository {
  const cache = new LruCache<string, Fleet>(capacity);

  return {
    create(entity: Fleet): void {
      inner.create(entity);
      cache.put(entity.id, entity);
    },

    get(id: string): Fleet | undefined {
      if (cache.has(id)) {
        return cache.get(id);
      }
      const entity = inner.get(id);
      if (entity) {
        cache.put(id, entity);
      }
      return entity;
    },

    getOrThrow(id: string): Fleet {
      if (cache.has(id)) {
        return cache.get(id)!;
      }
      const entity = inner.getOrThrow(id);
      cache.put(id, entity);
      return entity;
    },

    getAll(): Fleet[] {
      return inner.getAll();
    },

    update(id: string, expectedVersion: number, updater: (entity: Fleet) => Fleet): void {
      cache.delete(id); // invalidate before update
      inner.update(id, expectedVersion, updater);
    },

    delete(id: string, expectedVersion?: number): void {
      cache.delete(id);
      inner.delete(id, expectedVersion);
    },

    clear(): void {
      inner.clear();
      cache.clear();
    },
  };
}
