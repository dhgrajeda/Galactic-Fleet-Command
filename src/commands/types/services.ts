import type { EventBroker } from '../../events';
import type { Logger } from '../../logger';
import type { BattleRepository, CommandRepository, FleetRepository, ResourcePoolRepository } from '../../persistence';

/**
 * Services bag passed to command workers — avoids positional parameters.
 */
export interface CommandWorkerServices {
  commands: CommandRepository;
  fleets: FleetRepository;
  resourcePools: ResourcePoolRepository;
  battles: BattleRepository;
  logger: Logger;
  events: EventBroker;
}
