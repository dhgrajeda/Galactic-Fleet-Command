import type { BattleRepository } from './battleRepository';
import { createInMemoryBattleRepository } from './battleRepository';
import type { CommandRepository } from './commandRepository';
import { createInMemoryCommandRepository } from './commandRepository';
import type { FleetRepository } from './fleetRepository';
import { createInMemoryFleetRepository } from './fleetRepository';
import type { ResourcePoolRepository } from './resourcePoolRepository';
import { createInMemoryResourcePoolRepository } from './resourcePoolRepository';

/**
 * Holds all in-memory repositories. Use createPersistenceContext() for a fresh set.
 * In production you would swap these for real DB-backed repositories.
 */
export interface PersistenceContext {
  fleets: FleetRepository;
  commands: CommandRepository;
  resourcePools: ResourcePoolRepository;
  battles: BattleRepository;
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
    battles: createInMemoryBattleRepository(),
  };
}
