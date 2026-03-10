import { VersionedEntity } from './types';

import { InMemoryRepository } from './InMemoryRepository';
import type { Repository } from './InMemoryRepository';

/**
 * Fleet lifecycle states (see assignment domain model).
 * Candidates will enforce valid transitions.
 */
export type FleetState =
  | 'Docked'
  | 'Preparing'
  | 'Ready'
  | 'Deployed'
  | 'InBattle'
  | 'Victorious'
  | 'Destroyed'
  | 'FailedPreparation';

/**
 * Minimal fleet entity for persistence.
 * Candidates can extend with ships, loadout, reserved resources, etc.
 */
export interface Fleet extends VersionedEntity {
  name: string;
  state: FleetState;
}

export type FleetRepository = Repository<Fleet>;

export function createInMemoryFleetRepository(): FleetRepository {
  return new InMemoryRepository<Fleet>();
}
