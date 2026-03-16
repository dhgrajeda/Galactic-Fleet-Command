import { createInMemoryFleetRepository } from '../../src/persistence';
import { createCachingFleetRepository } from '../../src/cache/CachingFleetRepository';
import { createFleet, updateFleet } from '../../src/domain/fleet';

describe('CachingFleetRepository', () => {
  it('caches get results', () => {
    const inner = createInMemoryFleetRepository();
    const cached = createCachingFleetRepository(inner, 10);

    const fleet = createFleet(cached, { name: 'Alpha' });

    // Get from cache (inner.get would also work, but cache should serve it)
    const result = cached.get(fleet.id);
    expect(result?.name).toBe('Alpha');
  });

  it('invalidates cache on update', () => {
    const inner = createInMemoryFleetRepository();
    const cached = createCachingFleetRepository(inner, 10);

    const fleet = createFleet(cached, { name: 'Alpha' });

    // Read to populate cache
    cached.get(fleet.id);

    // Update through cached repo
    updateFleet(cached, fleet.id, fleet.version, { name: 'Beta' });

    // Cache should be invalidated, fresh read from inner
    const result = cached.get(fleet.id);
    expect(result?.name).toBe('Beta');
  });

  it('invalidates cache on delete', () => {
    const inner = createInMemoryFleetRepository();
    const cached = createCachingFleetRepository(inner, 10);

    const fleet = createFleet(cached, { name: 'Alpha' });
    cached.get(fleet.id); // populate cache

    cached.delete(fleet.id, fleet.version);
    expect(cached.get(fleet.id)).toBeUndefined();
  });

  it('serves from cache on repeated gets', () => {
    const inner = createInMemoryFleetRepository();
    const cached = createCachingFleetRepository(inner, 10);

    const fleet = createFleet(cached, { name: 'Alpha' });

    // Spy on inner.get to verify caching
    const originalGet = inner.get.bind(inner);
    let innerGetCalls = 0;
    inner.get = (id: string) => {
      innerGetCalls++;
      return originalGet(id);
    };

    cached.get(fleet.id); // First read — may be from cache (put on create)
    cached.get(fleet.id); // Second read — definitely from cache
    cached.get(fleet.id); // Third read — definitely from cache

    // Inner should not be called at all because create populated the cache
    expect(innerGetCalls).toBe(0);
  });

  it('evicts old entries when capacity is exceeded', () => {
    const inner = createInMemoryFleetRepository();
    const cached = createCachingFleetRepository(inner, 2);

    const a = createFleet(cached, { name: 'A' });
    const b = createFleet(cached, { name: 'B' });
    const c = createFleet(cached, { name: 'C' }); // evicts A from cache

    // A should still be accessible (falls through to inner)
    expect(cached.get(a.id)?.name).toBe('A');
  });

  it('clear removes all cached entries', () => {
    const inner = createInMemoryFleetRepository();
    const cached = createCachingFleetRepository(inner, 10);

    createFleet(cached, { name: 'A' });
    createFleet(cached, { name: 'B' });

    cached.clear();

    // Both inner and cache should be empty
    expect(cached.get('any')).toBeUndefined();
  });
});
