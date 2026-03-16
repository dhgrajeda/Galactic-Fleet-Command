import { InMemoryRepository } from './InMemoryRepository';
import type { Repository } from './InMemoryRepository';
import { VersionedEntity } from './types';

export type BattleStatus = 'InProgress' | 'Resolved';

export interface Battle extends VersionedEntity {
  fleetAId: string;
  fleetBId: string;
  winnerId?: string;
  loserId?: string;
  status: BattleStatus;
}

export type BattleRepository = Repository<Battle>;

export function createInMemoryBattleRepository(): BattleRepository {
  return new InMemoryRepository<Battle>();
}
