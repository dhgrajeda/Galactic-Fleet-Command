import { reserve, InsufficientResourceError } from '../../domain/resources';
import type { Command } from '../../persistence';
import type { ICommandWorker, CommandWorkerServices, CommandResult } from '../types';

export const ReserveResourcesWorker: ICommandWorker = {
  type: 'ReserveResources',

  execute(command: Command, services: CommandWorkerServices): CommandResult {
    const { fleetId } = command.payload as { fleetId: string };

    const fleet = services.fleets.getOrThrow(fleetId);

    // Idempotency fence: if already past Preparing, skip
    if (fleet.state === 'Ready') {
      return { success: true };
    }
    if (fleet.state !== 'Preparing') {
      return { success: false, error: `Fleet ${fleetId} is in state ${fleet.state}, expected Preparing` };
    }

    const resources = fleet.requiredResources ?? {};
    try {
      const reserved = reserve(services.resourcePools, resources);
      services.events.publish('resource:reserved', { fleetId, reservedResources: reserved });
    } catch (err) {
      const reason = err instanceof InsufficientResourceError ? err.message : 'Resource reservation failed';
      services.events.publish('resource:reservationFailed', { fleetId, reason });
    }

    return { success: true };
  },
};
