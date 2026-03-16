import { Router } from 'express';

import { getAvailability } from '../domain/resources';
import type { ResourcePoolRepository } from '../persistence';

export function createResourceRoutes(resourcePools: ResourcePoolRepository): Router {
  const router = Router();

  // GET /resources
  router.get('/', (_req, res) => {
    res.status(200).json(getAvailability(resourcePools));
  });

  return router;
}
