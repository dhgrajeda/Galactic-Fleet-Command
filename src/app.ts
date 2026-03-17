import express from 'express';

import { createCachingFleetRepository } from './cache/CachingFleetRepository';
import { createCommandQueue } from './commands/createCommandQueue';
import type { CommandHandlerServices } from './commands/types';
import { seedResourcePools } from './domain/resources';
import { EventBus } from './events';
import type { Logger } from './logger';
import { ConsoleLogger, NoopLogger } from './logger';
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
  const cachedFleets = createCachingFleetRepository(ctx.fleets);
  const defaultLogger = process.env.NODE_ENV === 'test' ? new NoopLogger() : new ConsoleLogger({ component: 'app' });
  const logger = options?.logger ?? defaultLogger;

  // Services
  const events = new EventBus();
  const services: CommandHandlerServices = {
    commands: ctx.commands,
    fleets: cachedFleets,
    resourcePools: ctx.resourcePools,
    battles: ctx.battles,
    logger,
    events,
  };

  // Command Queue
  const commandQueue = createCommandQueue(services);

  // Routes
  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.use('/fleets', createFleetRoutes(cachedFleets));
  app.use('/commands', createCommandRoutes(commandQueue));
  app.use('/resources', createResourceRoutes(ctx.resourcePools));
  app.use('/battles', createBattleRoutes(ctx.battles, cachedFleets));

  return app;
}
