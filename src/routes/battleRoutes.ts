import { Router } from 'express';

import type { FleetRepository } from '../persistence';
import type { BattleRepository, Battle } from '../persistence/battleRepository';

function enrichBattle(battle: Battle, fleets: FleetRepository) {
  const fleetA = fleets.get(battle.fleetAId);
  const fleetB = fleets.get(battle.fleetBId);

  const winner = battle.winnerId === battle.fleetAId ? fleetA
    : battle.winnerId === battle.fleetBId ? fleetB
    : null;
  const loser = battle.loserId === battle.fleetAId ? fleetA
    : battle.loserId === battle.fleetBId ? fleetB
    : null;

  return {
    id: battle.id,
    status: battle.status,
    fleetA: fleetA ? { id: fleetA.id, name: fleetA.name, state: fleetA.state, reservedResources: fleetA.reservedResources } : null,
    fleetB: fleetB ? { id: fleetB.id, name: fleetB.name, state: fleetB.state, reservedResources: fleetB.reservedResources } : null,
    winnerId: battle.winnerId ?? null,
    loserId: battle.loserId ?? null,
    winnerName: winner?.name ?? null,
    loserName: loser?.name ?? null,
  };
}

export function createBattleRoutes(
  battles: BattleRepository,
  fleets: FleetRepository,
): Router {
  const router = Router();

  // GET /battles
  router.get('/', (_req, res) => {
    const allBattles = battles.getAll();
    res.status(200).json(allBattles.map((b) => enrichBattle(b, fleets)));
  });

  // GET /battles/:id
  router.get('/:id', (req, res) => {
    const battle = battles.get(req.params.id);
    if (!battle) {
      res.status(404).json({ error: 'Battle not found' });
      return;
    }
    res.status(200).json(enrichBattle(battle, fleets));
  });

  return router;
}
