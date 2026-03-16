import { ConcurrencyError } from '../../persistence';

/**
 * Interface for battle matchmaking — abstracted for multi-instance readiness.
 */
export interface IBattleMatchmaker {
  addToPool(fleetId: string): Promise<[string, string] | null>;
  removeFromPool(fleetId: string): void;
  getPool(): string[];
}

const MAX_RETRIES = 3;

/**
 * In-memory matchmaker. When two fleets are in the pool, they're matched.
 * Uses optimistic locking (version check) for concurrency safety.
 */
export class BattleMatchmaker implements IBattleMatchmaker {
  private readonly pool: Set<string> = new Set();
  private version = 0;

  /**
   * Add a fleet to the matchmaking pool. If a pair is available, returns both
   * fleet IDs and removes them from the pool. Otherwise returns null.
   */
  async addToPool(fleetId: string): Promise<[string, string] | null> {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const expectedVersion = this.version;

      // Read current state
      const snapshot = new Set(this.pool);
      snapshot.add(fleetId);

      let result: [string, string] | null = null;
      if (snapshot.size >= 2) {
        const iterator = snapshot.values();
        const fleetA = iterator.next().value!;
        const fleetB = iterator.next().value!;
        snapshot.delete(fleetA);
        snapshot.delete(fleetB);
        result = [fleetA, fleetB];
      }

      // Optimistic write — check version hasn't changed
      if (this.version !== expectedVersion) {
        if (attempt === MAX_RETRIES) {
          throw new ConcurrencyError('matchmaker-pool', expectedVersion, this.version);
        }
        continue;
      }

      // Commit
      this.pool.clear();
      for (const id of snapshot) {
        this.pool.add(id);
      }
      if (!result) {
        this.pool.add(fleetId);
      }
      this.version++;

      return result;
    }

    throw new ConcurrencyError('matchmaker-pool', -1, this.version);
  }

  removeFromPool(fleetId: string): void {
    this.pool.delete(fleetId);
    this.version++;
  }

  getPool(): string[] {
    return [...this.pool];
  }
}
