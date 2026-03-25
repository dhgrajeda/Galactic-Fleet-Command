import type { Fleet } from '../../persistence';

/**
 * Derives a deterministic battle ID from a command ID.
 * Used by both the StartBattle worker and battle event wiring.
 */
export function deriveBattleId(commandId: string): string {
  return `battle-${commandId}`;
}

/**
 * Calculate a fleet's battle score.
 * score = (sum(reservedResources) + 50) * random[0.5, 1.5)
 * The base of 50 ensures even fleets with no resources have a fighting chance.
 */
export function calculateScore(fleet: Fleet, randomFactor?: number): number {
  const resourceSum = Object.values(fleet.reservedResources).reduce((sum, v) => sum + v, 0);
  const base = resourceSum + 50;
  const factor = randomFactor ?? (0.5 + Math.random());
  return base * factor;
}

/**
 * Resolve a battle between two fleets. Returns the winner's fleet ID.
 */
export function resolveBattle(fleetA: Fleet, fleetB: Fleet): string {
  const scoreA = calculateScore(fleetA);
  const scoreB = calculateScore(fleetB);
  return scoreA >= scoreB ? fleetA.id : fleetB.id;
}
