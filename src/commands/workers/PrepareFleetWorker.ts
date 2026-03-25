import { startPreparation, updateFleet } from '../../domain/fleet';
import type { Command } from '../../persistence';
import type { ICommandWorker, CommandWorkerServices, CommandResult } from '../types';

export const PrepareFleetWorker: ICommandWorker = {
  type: 'PrepareFleet',

  execute(command: Command, services: CommandWorkerServices): CommandResult {
    const { fleetId, requiredResources } = command.payload as {
      fleetId: string;
      requiredResources?: Record<string, number>;
    };

    let fleet = services.fleets.getOrThrow(fleetId);

    // Idempotency fence: if already Preparing or beyond, return success
    if (fleet.state !== 'Docked') {
      return { success: true };
    }

    // If command supplies requiredResources, persist them on the fleet while still Docked
    if (requiredResources) {
      fleet = updateFleet(services.fleets, fleetId, fleet.version, { requiredResources });
    }

    // Transition Docked → Preparing; emits fleet:stateChanged which triggers ReserveResources
    startPreparation(services.fleets, fleetId, fleet.version, services.events);

    return { success: true };
  },
};
