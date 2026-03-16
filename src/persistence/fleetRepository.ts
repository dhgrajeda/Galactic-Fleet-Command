
import { InMemoryRepository } from './InMemoryRepository';
import type { Repository } from './InMemoryRepository';
import { VersionedEntity } from './types';

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

export interface Ship {
  id: string;
  name: string;
  class: string;
}

export interface FleetEvent {
  type: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

export interface Fleet extends VersionedEntity {
  name: string;
  state: FleetState;
  ships: Ship[];
  requiredResources: Record<string, number>;
  reservedResources: Record<string, number>;
  timeline: FleetEvent[];
  createdAt: string;
  updatedAt: string;
}

export type FleetRepository = Repository<Fleet>;

export function createInMemoryFleetRepository(): FleetRepository {
  return new InMemoryRepository<Fleet>();
}
