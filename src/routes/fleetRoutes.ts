import { Router } from 'express';

import {
  createFleet,
  updateFleet,
  getFleet,
  FleetEditError,
  InvalidTransitionError,
} from '../domain/fleet';
import type { FleetRepository } from '../persistence';
import { NotFoundError, ConcurrencyError } from '../persistence';

export function createFleetRoutes(fleets: FleetRepository): Router {
  const router = Router();

  // POST /fleets
  router.post('/', (req, res) => {
    const { name, ships, requiredResources } = req.body;
    if (!name) {
      res.status(400).json({ error: 'name is required' });
      return;
    }
    const fleet = createFleet(fleets, { name, ships, requiredResources });
    res.status(201).json(fleet);
  });

  // GET /fleets
  router.get('/', (_req, res) => {
    res.status(200).json(fleets.getAll());
  });

  // GET /fleets/:id
  router.get('/:id', (req, res) => {
    try {
      const fleet = getFleet(fleets, req.params.id);
      res.status(200).json(fleet);
    } catch (err) {
      if (err instanceof NotFoundError) {
        res.status(404).json({ error: err.message });
        return;
      }
      throw err;
    }
  });

  // GET /fleets/:id/timeline
  router.get('/:id/timeline', (req, res) => {
    try {
      const fleet = getFleet(fleets, req.params.id);
      res.status(200).json(fleet.timeline);
    } catch (err) {
      if (err instanceof NotFoundError) {
        res.status(404).json({ error: err.message });
        return;
      }
      throw err;
    }
  });

  // PATCH /fleets/:id
  router.patch('/:id', (req, res) => {
    const { version, name, ships, requiredResources } = req.body;
    if (version === undefined) {
      res.status(400).json({ error: 'version is required' });
      return;
    }
    try {
      const updated = updateFleet(fleets, req.params.id, version, {
        name,
        ships,
        requiredResources,
      });
      res.status(200).json(updated);
    } catch (err) {
      if (err instanceof NotFoundError) {
        res.status(404).json({ error: err.message });
        return;
      }
      if (err instanceof ConcurrencyError) {
        res.status(409).json({ error: err.message });
        return;
      }
      if (err instanceof FleetEditError || err instanceof InvalidTransitionError) {
        res.status(422).json({ error: err.message });
        return;
      }
      throw err;
    }
  });

  return router;
}
