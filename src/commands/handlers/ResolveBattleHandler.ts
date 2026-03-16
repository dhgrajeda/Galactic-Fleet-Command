import { resolveBattle } from '../../domain/battle';
import { resolveVictorious, resolveDestroyed } from '../../domain/fleet';
import type { Command } from '../../persistence';
import type { ICommandHandler, CommandHandlerServices, CommandResult } from '../types';

export const ResolveBattleHandler: ICommandHandler = {
  type: 'ResolveBattle',

  handle(command: Command, services: CommandHandlerServices): CommandResult {
    const { battleId } = command.payload as { battleId: string };

    const battle = services.battles.getOrThrow(battleId);

    // Idempotency fence: if already resolved, return success
    if (battle.status === 'Resolved') {
      return { success: true };
    }

    const fleetA = services.fleets.getOrThrow(battle.fleetAId);
    const fleetB = services.fleets.getOrThrow(battle.fleetBId);

    const winnerId = resolveBattle(fleetA, fleetB);
    const loserId = winnerId === fleetA.id ? fleetB.id : fleetA.id;

    // Transition fleets
    const winner = services.fleets.getOrThrow(winnerId);
    const loser = services.fleets.getOrThrow(loserId);

    resolveVictorious(services.fleets, winnerId, winner.version);
    resolveDestroyed(services.fleets, loserId, loser.version);

    // Update battle record
    services.battles.update(battle.id, battle.version, (b) => ({
      ...b,
      winnerId,
      loserId,
      status: 'Resolved' as const,
    }));

    return { success: true };
  },
};
