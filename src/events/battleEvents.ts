import { deriveBattleId } from '../commands/handlers/StartBattleHandler';
import type { CommandHandlerServices, ICommandQueue } from '../commands/types';
import { BattleMatchmaker } from '../domain/battle/BattleMatchmaker';
import type { CommandSucceededEvent, FleetStateChangedEvent } from '../events';

/**
 * Wires EventBroker subscribers that drive the battle automation:
 * - Deployed fleets enter the matchmaker pool
 * - Matched pairs trigger StartBattle commands
 * - Completed battles trigger ResolveBattle commands
 */
export function battleEvents(services: CommandHandlerServices, queue: ICommandQueue): void {
  const matchmaker = new BattleMatchmaker(services.logger.child({ component: 'matchmaker' }));

  // When a fleet is deployed, add it to the matchmaker pool
  services.events.subscribe('fleet:stateChanged', async (event: FleetStateChangedEvent) => {
    if (event.to !== 'Deployed') return;

    const match = await matchmaker.addToPool(event.fleetId);
    if (match) {
      const [fleetAId, fleetBId] = match;
      queue.enqueue({ type: 'StartBattle', payload: { fleetAId, fleetBId } });
    }
  });

  // When a StartBattle command succeeds, enqueue ResolveBattle
  services.events.subscribe('command:succeeded', (event: CommandSucceededEvent) => {
    if (event.command.type !== 'StartBattle') return;

    const battleId = deriveBattleId(event.command.id);
    queue.enqueue({ type: 'ResolveBattle', payload: { battleId } });
  });
}
