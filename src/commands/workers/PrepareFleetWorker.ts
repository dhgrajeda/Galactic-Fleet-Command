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

    // Idempotency fence: if already past Docked, check final state
    if (fleet.state === 'Ready') return { success: true };
    if (fleet.state === 'FailedPreparation') {
      return { success: false, error: 'Fleet preparation failed' };
    }
    if (fleet.state !== 'Docked') return { success: true };

    // If command supplies requiredResources, persist them on the fleet while still Docked
    if (requiredResources) {
      fleet = updateFleet(services.fleets, fleetId, fleet.version, { requiredResources });
    }

    // Transition Docked → Preparing.
    // This synchronously triggers the event chain:
    //   fleet:stateChanged → reserve resources → resource:reserved/Failed → completePreparation/failPreparation
    startPreparation(services.fleets, fleetId, fleet.version, services.events);

    // Check final state after the synchronous event chain
    const result = services.fleets.getOrThrow(fleetId);

    if (result.state === 'Ready') {
      return { success: true };
    }
    if (result.state === 'FailedPreparation') {
      return { success: false, error: 'Fleet preparation failed: resource reservation failed' };
    }

    // Still in Preparing — shouldn't happen in synchronous flow, but handle gracefully
    return { success: true };
  },
};
