import { failPreparation } from '../../domain/fleet';
import type { Command } from '../../persistence';
import type { ICommandWorker, CommandWorkerServices, CommandResult } from '../types';

export const FailPreparationWorker: ICommandWorker = {
  type: 'FailPreparation',

  execute(command: Command, services: CommandWorkerServices): CommandResult {
    const { fleetId, reason } = command.payload as {
      fleetId: string;
      reason: string;
    };

    const fleet = services.fleets.getOrThrow(fleetId);

    // Idempotency fence
    if (fleet.state === 'FailedPreparation') {
      return { success: true };
    }
    if (fleet.state !== 'Preparing') {
      return { success: false, error: `Fleet ${fleetId} is in state ${fleet.state}, expected Preparing` };
    }

    failPreparation(services.fleets, fleetId, fleet.version, reason, services.events);
    return { success: true };
  },
};
