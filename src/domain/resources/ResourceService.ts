import { ConcurrencyError } from '../../persistence';
import type {
  ResourceAvailability,
  ResourcePool,
  ResourcePoolRepository,
  ResourceType,
} from '../../persistence';

const MAX_RETRIES = 5;

export class InsufficientResourceError extends Error {
  constructor(
    public readonly resourceType: ResourceType,
    public readonly requested: number,
    public readonly available: number,
  ) {
    super(
      `Insufficient ${resourceType}: requested ${requested}, available ${available}`,
    );
    this.name = 'InsufficientResourceError';
  }
}

/**
 * Retry a resource pool update with optimistic locking.
 * Re-fetches the pool on each retry to get the latest version.
 */
function updatePoolWithRetry(
  repo: ResourcePoolRepository,
  resourceType: ResourceType,
  updater: (pool: ResourcePool) => ResourcePool,
): ResourcePool | undefined {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const pool = repo.getByType(resourceType);
    if (!pool) return undefined;

    try {
      repo.update(pool.id, pool.version, updater);
      return pool;
    } catch (err) {
      if (err instanceof ConcurrencyError && attempt < MAX_RETRIES) {
        continue;
      }
      throw err;
    }
  }
  return undefined;
}

/**
 * Reserve resources with optimistic locking + retry on ConcurrencyError.
 * Returns the reserved amounts (matching the request).
 * Throws InsufficientResourceError if any resource cannot be fully reserved.
 */
export function reserve(
  repo: ResourcePoolRepository,
  requests: Record<string, number>,
): Record<string, number> {
  const reserved: Record<string, number> = {};

  for (const [type, amount] of Object.entries(requests)) {
    if (amount <= 0) continue;
    reserveSingle(repo, type as ResourceType, amount);
    reserved[type] = amount;
  }

  return reserved;
}

function reserveSingle(
  repo: ResourcePoolRepository,
  resourceType: ResourceType,
  amount: number,
): void {
  const pool = repo.getByType(resourceType);
  if (!pool) {
    throw new InsufficientResourceError(resourceType, amount, 0);
  }

  const available = pool.total - pool.reserved;
  if (available < amount) {
    throw new InsufficientResourceError(resourceType, amount, available);
  }

  updatePoolWithRetry(repo, resourceType, (p) => {
    const currentAvailable = p.total - p.reserved;
    if (currentAvailable < amount) {
      throw new InsufficientResourceError(resourceType, amount, currentAvailable);
    }
    return { ...p, reserved: p.reserved + amount };
  });
}

/**
 * Release previously reserved resources.
 */
export function release(
  repo: ResourcePoolRepository,
  reservations: Record<string, number>,
): void {
  for (const [type, amount] of Object.entries(reservations)) {
    if (amount <= 0) continue;
    updatePoolWithRetry(repo, type as ResourceType, (p) => ({
      ...p,
      reserved: Math.max(0, p.reserved - amount),
    }));
  }
}

/**
 * Get availability for all resource pools.
 */
export function getAvailability(repo: ResourcePoolRepository): ResourceAvailability[] {
  const types: ResourceType[] = ['FUEL', 'HYPERDRIVE_CORE', 'BATTLE_DROIDS'];
  const result: ResourceAvailability[] = [];

  for (const type of types) {
    const pool = repo.getByType(type);
    if (pool) {
      result.push({
        resourceType: pool.resourceType,
        total: pool.total,
        reserved: pool.reserved,
        available: pool.total - pool.reserved,
      });
    }
  }

  return result;
}
