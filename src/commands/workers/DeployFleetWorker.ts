import { deployFleet } from '../../domain/fleet';
import type { Command } from '../../persistence';
import type { ICommandWorker, CommandWorkerServices, CommandResult } from '../types';

export const DeployFleetWorker: ICommandWorker = {
  type: 'DeployFleet',

  execute(command: Command, services: CommandWorkerServices): CommandResult {
    const { fleetId } = command.payload as { fleetId: string };

    const fleet = services.fleets.getOrThrow(fleetId);

    // Idempotency fence: if already Deployed (or beyond), return success
    if (fleet.state === 'Deployed' || fleet.state === 'InBattle' ||
        fleet.state === 'Victorious' || fleet.state === 'Destroyed') {
      return { success: true };
    }

    deployFleet(services.fleets, fleetId, fleet.version, services.events);
    return { success: true };
  },
};
