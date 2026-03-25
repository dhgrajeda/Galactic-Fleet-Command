import express from 'express';

import { createCommandQueue } from './commands/createCommandQueue';
import type { CommandWorkerServices } from './commands/types';
import { seedResourcePools } from './domain/resources';
import { EventBroker } from './events/EventBroker';
import { battleEvents } from './events/battleEvents';
import { fleetEvents } from './events/fleetEvents';
import type { Logger } from './logger';
import { ConsoleLogger } from './logger';
import { createPersistenceContext } from './persistence/context';
import { createBattleRoutes } from './routes/battleRoutes';
import { createCommandRoutes } from './routes/commandRoutes';
import { createFleetRoutes } from './routes/fleetRoutes';
import { createResourceRoutes } from './routes/resourceRoutes';

export function createApp(options?: { logger?: Logger }) {
  const app = express();
  app.use(express.json());

  // Persistence
  const ctx = createPersistenceContext();
  seedResourcePools(ctx.resourcePools);

  // Observability
  const logger = options?.logger ?? new ConsoleLogger({ component: 'app' });

  // Services
  const events = new EventBroker();
  const services: CommandWorkerServices = {
    commands: ctx.commands,
    fleets: ctx.fleets,
    resourcePools: ctx.resourcePools,
    battles: ctx.battles,
    logger,
    events,
  };

  // Command Queue + event wiring
  const commandQueue = createCommandQueue(services);
  fleetEvents(services, commandQueue);
  battleEvents(services, commandQueue);

  // Routes
  app.use('/fleets', createFleetRoutes(ctx.fleets));
  app.use('/commands', createCommandRoutes(commandQueue));
  app.use('/resources', createResourceRoutes(ctx.resourcePools));
  app.use('/battles', createBattleRoutes(ctx.battles, ctx.fleets));
  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  return app;
}
