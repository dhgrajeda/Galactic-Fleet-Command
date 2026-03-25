import type { CommandWorkerServices, ICommandQueue } from '../commands/types';
import type { FleetStateChangedEvent, ResourceReservedEvent, ResourceReservationFailedEvent } from './EventBroker';

/**
 * Wires EventBroker subscribers that drive the fleet preparation flow:
 * - Preparing       → enqueue ReserveResources
 * - resource:reserved        → enqueue CompletePreparation
 * - resource:reservationFailed → enqueue FailPreparation
 */
export function fleetEvents(services: CommandWorkerServices, queue: ICommandQueue): void {
  services.events.subscribe('fleet:stateChanged', (event: FleetStateChangedEvent) => {
    if (event.to !== 'Preparing') return;

    queue.enqueue({ type: 'ReserveResources', payload: { fleetId: event.fleetId } });
  });

  services.events.subscribe('resource:reserved', (event: ResourceReservedEvent) => {
    queue.enqueue({
      type: 'CompletePreparation',
      payload: { fleetId: event.fleetId, reservedResources: event.reservedResources },
    });
  });

  services.events.subscribe('resource:reservationFailed', (event: ResourceReservationFailedEvent) => {
    queue.enqueue({
      type: 'FailPreparation',
      payload: { fleetId: event.fleetId, reason: event.reason },
    });
  });
}
