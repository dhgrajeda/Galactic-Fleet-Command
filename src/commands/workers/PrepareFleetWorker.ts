import { startPreparation, completePreparation, failPreparation } from '../../domain/fleet';
import { reserve, InsufficientResourceError } from '../../domain/resources';
import type { Command } from '../../persistence';
import type { ICommandWorker, CommandWorkerServices, CommandResult } from '../types';

export const PrepareFleetWorker: ICommandWorker = {
  type: 'PrepareFleet',

  execute(command: Command, services: CommandWorkerServices): CommandResult {
    const { fleetId, requiredResources } = command.payload as {
      fleetId: string;
      requiredResources?: Record<string, number>;
    };

    const fleet = services.fleets.getOrThrow(fleetId);

    // Idempotency fence: if already Preparing or Ready, return success
    if (fleet.state === 'Preparing' || fleet.state === 'Ready') {
      return { success: true };
    }

    // Fleet-first: transition to Preparing
    const preparing = startPreparation(services.fleets, fleetId, fleet.version, services.events);

    // Then try to reserve resources
    const resources = requiredResources ?? fleet.requiredResources ?? {};
    try {
      const reserved = reserve(services.resourcePools, resources);
      completePreparation(services.fleets, fleetId, preparing.version, reserved, services.events);
    } catch (err) {
      const reason = err instanceof InsufficientResourceError ? err.message : 'Resource reservation failed';
      failPreparation(services.fleets, fleetId, preparing.version, reason, services.events);
      return { success: true }; // Command itself succeeded — fleet moved to FailedPreparation
    }

    return { success: true };
  },
};
