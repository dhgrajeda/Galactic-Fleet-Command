import { deployFleet } from '../../domain/fleet';
import type { Command } from '../../persistence';
import type { ICommandHandler, CommandHandlerServices, CommandResult } from '../types';

export const DeployFleetHandler: ICommandHandler = {
  type: 'DeployFleet',

  handle(command: Command, services: CommandHandlerServices): CommandResult {
    const { fleetId } = command.payload as { fleetId: string };

    const fleet = services.fleets.getOrThrow(fleetId);

    // Idempotency fence: if already Deployed (or beyond), return success
    if (fleet.state === 'Deployed' || fleet.state === 'InBattle' ||
        fleet.state === 'Victorious' || fleet.state === 'Destroyed') {
      return { success: true };
    }

    deployFleet(services.fleets, fleetId, fleet.version);
    return { success: true };
  },
};
