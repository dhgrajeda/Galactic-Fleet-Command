import { completePreparation, failPreparation } from '../domain/fleet';
import { reserve, InsufficientResourceError } from '../domain/resources';
import type { CommandWorkerServices } from '../commands/types';
import type { FleetStateChangedEvent, ResourceReservedEvent, ResourceReservationFailedEvent } from './EventBroker';

/**
 * Wires EventBroker subscribers that drive the fleet preparation flow.
 * All listeners execute synchronously, allowing the originating worker
 * to observe the final fleet state and report the correct result.
 *
 * Chain: fleet:stateChanged(Preparing) → reserve → resource:reserved/Failed → completePreparation/failPreparation
 */
export function fleetEvents(services: CommandWorkerServices): void {
  // When a fleet enters Preparing, attempt resource reservation
  services.events.subscribe('fleet:stateChanged', (event: FleetStateChangedEvent) => {
    if (event.to !== 'Preparing') return;

    const fleet = services.fleets.getOrThrow(event.fleetId);
    const resources = fleet.requiredResources ?? {};

    try {
      const reserved = reserve(services.resourcePools, resources);
      services.events.publish('resource:reserved', { fleetId: event.fleetId, reservedResources: reserved });
    } catch (err) {
      const reason = err instanceof InsufficientResourceError ? err.message : 'Resource reservation failed';
      services.events.publish('resource:reservationFailed', { fleetId: event.fleetId, reason });
    }
  });

  // When resources are reserved, complete preparation
  services.events.subscribe('resource:reserved', (event: ResourceReservedEvent) => {
    const fleet = services.fleets.getOrThrow(event.fleetId);
    if (fleet.state !== 'Preparing') return;

    completePreparation(services.fleets, event.fleetId, fleet.version, event.reservedResources, services.events);
  });

  // When reservation fails, fail preparation
  services.events.subscribe('resource:reservationFailed', (event: ResourceReservationFailedEvent) => {
    const fleet = services.fleets.getOrThrow(event.fleetId);
    if (fleet.state !== 'Preparing') return;

    failPreparation(services.fleets, event.fleetId, fleet.version, event.reason, services.events);
  });
}
