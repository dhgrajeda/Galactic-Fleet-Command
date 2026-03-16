import { enterBattle } from '../../domain/fleet';
import type { Command } from '../../persistence';
import type { ICommandHandler, CommandHandlerServices, CommandResult } from '../types';

export function deriveBattleId(commandId: string): string {
  return `battle-${commandId}`;
}

export const StartBattleHandler: ICommandHandler = {
  type: 'StartBattle',

  handle(command: Command, services: CommandHandlerServices): CommandResult {
    const { fleetAId, fleetBId } = command.payload as {
      fleetAId: string;
      fleetBId: string;
    };

    // Derive battleId from command.id for idempotency
    const battleId = deriveBattleId(command.id);

    const fleetA = services.fleets.getOrThrow(fleetAId);
    const fleetB = services.fleets.getOrThrow(fleetBId);

    // Idempotency fence: if both are already InBattle, check if battle exists
    if (fleetA.state === 'InBattle' && fleetB.state === 'InBattle') {
      const existing = services.battles.get(battleId);
      if (existing) return { success: true };
    }

    // Fleet-first ordering: transition both fleets to InBattle
    if (fleetA.state === 'Deployed') {
      enterBattle(services.fleets, fleetAId, fleetA.version);
    }
    if (fleetB.state === 'Deployed') {
      enterBattle(services.fleets, fleetBId, fleetB.version);
    }

    // Create battle record (idempotent — skip if already exists)
    if (!services.battles.get(battleId)) {
      services.battles.create({
        id: battleId,
        version: 1,
        fleetAId,
        fleetBId,
        status: 'InProgress',
      });
    }

    return { success: true };
  },
};
