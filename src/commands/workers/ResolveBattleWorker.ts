import { resolveBattle } from '../../domain/battle';
import { resolveVictorious, resolveDestroyed } from '../../domain/fleet';
import type { Command } from '../../persistence';
import type { ICommandWorker, CommandWorkerServices, CommandResult } from '../types';

export const ResolveBattleWorker: ICommandWorker = {
  type: 'ResolveBattle',

  execute(command: Command, services: CommandWorkerServices): CommandResult {
    const { battleId } = command.payload as { battleId: string };

    const battle = services.battles.getOrThrow(battleId);

    // Idempotency fence: if already resolved, return success
    if (battle.status === 'Resolved') {
      return { success: true };
    }

    const fleetA = services.fleets.getOrThrow(battle.fleetAId);
    const fleetB = services.fleets.getOrThrow(battle.fleetBId);

    const winnerId = resolveBattle(fleetA, fleetB);
    const [winner, loser] = winnerId === fleetA.id ? [fleetA, fleetB] : [fleetB, fleetA];

    resolveVictorious(services.fleets, winner.id, winner.version, services.events);
    resolveDestroyed(services.fleets, loser.id, loser.version, services.events);

    // Update battle record
    services.battles.update(battle.id, battle.version, (b) => ({
      ...b,
      winnerId: winner.id,
      loserId: loser.id,
      status: 'Resolved' as const,
    }));

    return { success: true };
  },
};
