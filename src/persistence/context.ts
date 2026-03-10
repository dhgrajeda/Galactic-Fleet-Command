import type { CommandRepository } from './commandRepository';
import type { FleetRepository } from './fleetRepository';
import type { ResourcePoolRepository } from './resourcePoolRepository';

import { createInMemoryCommandRepository } from './commandRepository';
import { createInMemoryFleetRepository } from './fleetRepository';
import { createInMemoryResourcePoolRepository } from './resourcePoolRepository';

/**
 * Holds all in-memory repositories. Use createPersistenceContext() for a fresh set.
 * In production you would swap these for real DB-backed repositories.
 */
export interface PersistenceContext {
  fleets: FleetRepository;
  commands: CommandRepository;
  resourcePools: ResourcePoolRepository;
}

/**
 * Returns a new persistence context with empty in-memory stores.
 * Call this once at app startup, or in tests for an isolated context.
 */
export function createPersistenceContext(): PersistenceContext {
  return {
    fleets: createInMemoryFleetRepository(),
    commands: createInMemoryCommandRepository(),
    resourcePools: createInMemoryResourcePoolRepository(),
  };
}
