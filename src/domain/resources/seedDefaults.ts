import type { ResourcePoolRepository } from '../../persistence';

/**
 * Seeds the galaxy's default resource pools.
 * Call once at app startup; tests that need pools should call this explicitly.
 */
export function seedResourcePools(resourcePools: ResourcePoolRepository): void {
  resourcePools.create({ id: 'fuel-pool', version: 1, resourceType: 'FUEL', total: 1000, reserved: 0 });
  resourcePools.create({ id: 'hdc-pool', version: 1, resourceType: 'HYPERDRIVE_CORE', total: 10, reserved: 0 });
  resourcePools.create({ id: 'bd-pool', version: 1, resourceType: 'BATTLE_DROIDS', total: 500, reserved: 0 });
}
