import { Router } from 'express';

import type { ICommandQueue } from '../commands/types';

const VALID_COMMAND_TYPES = ['PrepareFleet', 'DeployFleet', 'StartBattle', 'ResolveBattle'];

export function createCommandRoutes(commandQueue: ICommandQueue): Router {
  const router = Router();

  // POST /commands
  router.post('/', (req, res) => {
    const { type, payload } = req.body;
    if (!type) {
      res.status(400).json({ error: 'type is required' });
      return;
    }
    if (!VALID_COMMAND_TYPES.includes(type)) {
      res.status(400).json({ error: `Invalid command type: ${type}` });
      return;
    }
    if (!payload || typeof payload !== 'object') {
      res.status(400).json({ error: 'payload is required and must be an object' });
      return;
    }

    const command = commandQueue.enqueue({ type, payload });
    // Trigger processing asynchronously
    // eslint-disable-next-line no-console
    commandQueue.flush().catch((err) => console.error('Command processing error:', err));
    res.status(202).json(command);
  });

  // GET /commands
  router.get('/', (_req, res) => {
    res.status(200).json(commandQueue.getAllCommands());
  });

  // GET /commands/:id
  router.get('/:id', (req, res) => {
    const command = commandQueue.getCommand(req.params.id);
    if (!command) {
      res.status(404).json({ error: 'Command not found' });
      return;
    }
    res.status(200).json(command);
  });

  return router;
}
