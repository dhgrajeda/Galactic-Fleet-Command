import { deriveBattleId } from '../../domain/battle';
import { enterBattle } from '../../domain/fleet';
import type { Command } from '../../persistence';
import type { ICommandWorker, CommandWorkerServices, CommandResult } from '../types';

export const StartBattleWorker: ICommandWorker = {
  type: 'StartBattle',

  execute(command: Command, services: CommandWorkerServices): CommandResult {
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
      enterBattle(services.fleets, fleetAId, fleetA.version, services.events);
    }
    if (fleetB.state === 'Deployed') {
      enterBattle(services.fleets, fleetBId, fleetB.version, services.events);
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
