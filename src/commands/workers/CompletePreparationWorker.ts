import { completePreparation } from '../../domain/fleet';
import type { Command } from '../../persistence';
import type { ICommandWorker, CommandWorkerServices, CommandResult } from '../types';

export const CompletePreparationWorker: ICommandWorker = {
  type: 'CompletePreparation',

  execute(command: Command, services: CommandWorkerServices): CommandResult {
    const { fleetId, reservedResources } = command.payload as {
      fleetId: string;
      reservedResources: Record<string, number>;
    };

    const fleet = services.fleets.getOrThrow(fleetId);

    // Idempotency fence
    if (fleet.state === 'Ready') {
      return { success: true };
    }
    if (fleet.state !== 'Preparing') {
      return { success: false, error: `Fleet ${fleetId} is in state ${fleet.state}, expected Preparing` };
    }

    completePreparation(services.fleets, fleetId, fleet.version, reservedResources, services.events);
    return { success: true };
  },
};
