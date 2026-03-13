import { ConcurrencyError, NotFoundError, createInMemoryFleetRepository } from '../../../src/persistence';
import {
  FleetEditError,
  InvalidTransitionError,
  createFleet,
  deployFleet,
  enterBattle,
  failPreparation,
  getFleet,
  resolveDestroyed,
  resolveVictorious,
  startPreparation,
  completePreparation,
  updateFleet,
} from '../../../src/domain/fleet/FleetService';

function makeRepo() {
  return createInMemoryFleetRepository();
}

// ── createFleet ───────────────────────────────────────────────────────────────

describe('createFleet', () => {
  it('creates a fleet in Docked state', () => {
    const repo = makeRepo();
    const fleet = createFleet(repo, { name: 'Red Squadron' });
    expect(fleet.state).toBe('Docked');
  });

  it('assigns a unique id', () => {
    const repo = makeRepo();
    const a = createFleet(repo, { name: 'A' });
    const b = createFleet(repo, { name: 'B' });
    expect(a.id).not.toBe(b.id);
  });

  it('initialises ships to empty by default', () => {
    const fleet = createFleet(makeRepo(), { name: 'A' });
    expect(fleet.ships).toEqual([]);
  });

  it('accepts initial ships', () => {
    const fleet = createFleet(makeRepo(), {
      name: 'A',
      ships: [{ id: 's1', name: 'X-Wing', class: 'Fighter' }],
    });
    expect(fleet.ships).toHaveLength(1);
    expect(fleet.ships[0].name).toBe('X-Wing');
  });

  it('initialises requiredResources to empty by default', () => {
    const fleet = createFleet(makeRepo(), { name: 'A' });
    expect(fleet.requiredResources).toEqual({});
  });

  it('accepts initial requiredResources', () => {
    const fleet = createFleet(makeRepo(), {
      name: 'A',
      requiredResources: { FUEL: 50, HYPERDRIVE_CORE: 2 },
    });
    expect(fleet.requiredResources).toEqual({ FUEL: 50, HYPERDRIVE_CORE: 2 });
  });

  it('initialises reservedResources to empty', () => {
    const fleet = createFleet(makeRepo(), { name: 'A' });
    expect(fleet.reservedResources).toEqual({});
  });

  it('starts with a timeline containing only FleetCreated', () => {
    const fleet = createFleet(makeRepo(), { name: 'A' });
    expect(fleet.timeline).toHaveLength(1);
    expect(fleet.timeline[0].type).toBe('FleetCreated');
  });

  it('FleetCreated event data includes the fleet name', () => {
    const fleet = createFleet(makeRepo(), { name: 'Gold Leader' });
    expect(fleet.timeline[0].data).toMatchObject({ name: 'Gold Leader' });
  });

  it('persists the fleet in the repository', () => {
    const repo = makeRepo();
    const fleet = createFleet(repo, { name: 'A' });
    expect(repo.get(fleet.id)).toBeDefined();
  });

  it('sets createdAt and updatedAt timestamps', () => {
    const fleet = createFleet(makeRepo(), { name: 'A' });
    expect(fleet.createdAt).toBeDefined();
    expect(fleet.updatedAt).toBeDefined();
  });
});

// ── updateFleet ───────────────────────────────────────────────────────────────

describe('updateFleet', () => {
  it('updates the fleet name', () => {
    const repo = makeRepo();
    const fleet = createFleet(repo, { name: 'Old' });
    const updated = updateFleet(repo, fleet.id, fleet.version, { name: 'New' });
    expect(updated.name).toBe('New');
  });

  it('replaces the ships list', () => {
    const repo = makeRepo();
    const fleet = createFleet(repo, {
      name: 'A',
      ships: [{ id: 's1', name: 'X-Wing', class: 'Fighter' }],
    });
    const updated = updateFleet(repo, fleet.id, fleet.version, {
      ships: [{ id: 's2', name: 'Y-Wing', class: 'Destroyer' }],
    });
    expect(updated.ships).toHaveLength(1);
    expect(updated.ships[0].id).toBe('s2');
  });

  it('replaces requiredResources', () => {
    const repo = makeRepo();
    const fleet = createFleet(repo, { name: 'A', requiredResources: { FUEL: 10 } });
    const updated = updateFleet(repo, fleet.id, fleet.version, {
      requiredResources: { HYPERDRIVE_CORE: 5 },
    });
    expect(updated.requiredResources).toEqual({ HYPERDRIVE_CORE: 5 });
  });

  it('appends a FleetUpdated event to the timeline', () => {
    const repo = makeRepo();
    const fleet = createFleet(repo, { name: 'A' });
    const updated = updateFleet(repo, fleet.id, fleet.version, { name: 'B' });
    expect(updated.timeline).toHaveLength(2);
    expect(updated.timeline[1].type).toBe('FleetUpdated');
  });

  it('persists the changes to the repository', () => {
    const repo = makeRepo();
    const fleet = createFleet(repo, { name: 'A' });
    updateFleet(repo, fleet.id, fleet.version, { name: 'B' });
    expect(repo.getOrThrow(fleet.id).name).toBe('B');
  });

  it('throws FleetEditError when fleet is not Docked', () => {
    const repo = makeRepo();
    const fleet = createFleet(repo, { name: 'A' });
    const preparing = startPreparation(repo, fleet.id, fleet.version);
    expect(() =>
      updateFleet(repo, preparing.id, preparing.version, { name: 'B' }),
    ).toThrow(FleetEditError);
  });

  it('throws ConcurrencyError when version is stale', () => {
    const repo = makeRepo();
    const fleet = createFleet(repo, { name: 'A' });
    updateFleet(repo, fleet.id, fleet.version, { name: 'B' }); // advances version
    expect(() =>
      updateFleet(repo, fleet.id, fleet.version, { name: 'C' }), // stale version
    ).toThrow(ConcurrencyError);
  });
});

// ── state transitions ─────────────────────────────────────────────────────────

describe('startPreparation', () => {
  it('transitions Docked → Preparing', () => {
    const repo = makeRepo();
    const fleet = createFleet(repo, { name: 'A' });
    const next = startPreparation(repo, fleet.id, fleet.version);
    expect(next.state).toBe('Preparing');
  });

  it('appends FleetPreparationStarted event', () => {
    const repo = makeRepo();
    const fleet = createFleet(repo, { name: 'A' });
    const next = startPreparation(repo, fleet.id, fleet.version);
    expect(next.timeline.at(-1)?.type).toBe('FleetPreparationStarted');
  });

  it('throws InvalidTransitionError when fleet is not Docked', () => {
    const repo = makeRepo();
    const fleet = createFleet(repo, { name: 'A' });
    const preparing = startPreparation(repo, fleet.id, fleet.version);
    expect(() =>
      startPreparation(repo, preparing.id, preparing.version),
    ).toThrow(InvalidTransitionError);
  });
});

describe('completePreparation', () => {
  it('transitions Preparing → Ready', () => {
    const repo = makeRepo();
    let fleet = createFleet(repo, { name: 'A' });
    fleet = startPreparation(repo, fleet.id, fleet.version);
    const ready = completePreparation(repo, fleet.id, fleet.version, { FUEL: 30 });
    expect(ready.state).toBe('Ready');
  });

  it('records the reserved resources on the fleet', () => {
    const repo = makeRepo();
    let fleet = createFleet(repo, { name: 'A' });
    fleet = startPreparation(repo, fleet.id, fleet.version);
    const ready = completePreparation(repo, fleet.id, fleet.version, {
      FUEL: 30,
      HYPERDRIVE_CORE: 2,
    });
    expect(ready.reservedResources).toEqual({ FUEL: 30, HYPERDRIVE_CORE: 2 });
  });

  it('appends FleetReady event with reservedResources in data', () => {
    const repo = makeRepo();
    let fleet = createFleet(repo, { name: 'A' });
    fleet = startPreparation(repo, fleet.id, fleet.version);
    const ready = completePreparation(repo, fleet.id, fleet.version, { FUEL: 10 });
    const event = ready.timeline.at(-1)!;
    expect(event.type).toBe('FleetReady');
    expect(event.data).toMatchObject({ reservedResources: { FUEL: 10 } });
  });

  it('throws InvalidTransitionError when fleet is not Preparing', () => {
    const repo = makeRepo();
    const fleet = createFleet(repo, { name: 'A' }); // Docked, not Preparing
    expect(() =>
      completePreparation(repo, fleet.id, fleet.version, {}),
    ).toThrow(InvalidTransitionError);
  });
});

describe('failPreparation', () => {
  it('transitions Preparing → FailedPreparation', () => {
    const repo = makeRepo();
    let fleet = createFleet(repo, { name: 'A' });
    fleet = startPreparation(repo, fleet.id, fleet.version);
    const failed = failPreparation(repo, fleet.id, fleet.version, 'Not enough FUEL');
    expect(failed.state).toBe('FailedPreparation');
  });

  it('appends FleetPreparationFailed event with reason', () => {
    const repo = makeRepo();
    let fleet = createFleet(repo, { name: 'A' });
    fleet = startPreparation(repo, fleet.id, fleet.version);
    const failed = failPreparation(repo, fleet.id, fleet.version, 'Not enough FUEL');
    const event = failed.timeline.at(-1)!;
    expect(event.type).toBe('FleetPreparationFailed');
    expect(event.data).toMatchObject({ reason: 'Not enough FUEL' });
  });

  it('throws InvalidTransitionError when fleet is not Preparing', () => {
    const repo = makeRepo();
    const fleet = createFleet(repo, { name: 'A' }); // Docked
    expect(() =>
      failPreparation(repo, fleet.id, fleet.version, 'oops'),
    ).toThrow(InvalidTransitionError);
  });
});

describe('deployFleet', () => {
  it('transitions Ready → Deployed', () => {
    const repo = makeRepo();
    let fleet = createFleet(repo, { name: 'A' });
    fleet = startPreparation(repo, fleet.id, fleet.version);
    fleet = completePreparation(repo, fleet.id, fleet.version, {});
    const deployed = deployFleet(repo, fleet.id, fleet.version);
    expect(deployed.state).toBe('Deployed');
  });

  it('appends FleetDeployed event', () => {
    const repo = makeRepo();
    let fleet = createFleet(repo, { name: 'A' });
    fleet = startPreparation(repo, fleet.id, fleet.version);
    fleet = completePreparation(repo, fleet.id, fleet.version, {});
    const deployed = deployFleet(repo, fleet.id, fleet.version);
    expect(deployed.timeline.at(-1)?.type).toBe('FleetDeployed');
  });

  it('throws InvalidTransitionError when fleet is not Ready', () => {
    const repo = makeRepo();
    const fleet = createFleet(repo, { name: 'A' }); // Docked, not Ready
    expect(() => deployFleet(repo, fleet.id, fleet.version)).toThrow(InvalidTransitionError);
  });
});

// ── full happy path ───────────────────────────────────────────────────────────

describe('full lifecycle', () => {
  it('Docked → Preparing → Ready → Deployed → InBattle → Victorious', () => {
    const repo = makeRepo();
    let fleet = createFleet(repo, { name: 'Victorious Fleet' });

    fleet = startPreparation(repo, fleet.id, fleet.version);
    expect(fleet.state).toBe('Preparing');

    fleet = completePreparation(repo, fleet.id, fleet.version, { FUEL: 10 });
    expect(fleet.state).toBe('Ready');

    fleet = deployFleet(repo, fleet.id, fleet.version);
    expect(fleet.state).toBe('Deployed');

    fleet = enterBattle(repo, fleet.id, fleet.version);
    expect(fleet.state).toBe('InBattle');

    fleet = resolveVictorious(repo, fleet.id, fleet.version);
    expect(fleet.state).toBe('Victorious');
  });

  it('Preparing → FailedPreparation path', () => {
    const repo = makeRepo();
    let fleet = createFleet(repo, { name: 'Doomed Prep' });
    fleet = startPreparation(repo, fleet.id, fleet.version);
    fleet = failPreparation(repo, fleet.id, fleet.version, 'no fuel');
    expect(fleet.state).toBe('FailedPreparation');
  });

  it('InBattle → Destroyed path', () => {
    const repo = makeRepo();
    let fleet = createFleet(repo, { name: 'Doomed Fleet' });
    fleet = startPreparation(repo, fleet.id, fleet.version);
    fleet = completePreparation(repo, fleet.id, fleet.version, {});
    fleet = deployFleet(repo, fleet.id, fleet.version);
    fleet = enterBattle(repo, fleet.id, fleet.version);
    fleet = resolveDestroyed(repo, fleet.id, fleet.version);
    expect(fleet.state).toBe('Destroyed');
  });
});

// ── terminal state immutability ───────────────────────────────────────────────

describe('terminal state immutability', () => {
  it('throws FleetEditError when attempting a transition from Victorious', () => {
    const repo = makeRepo();
    let fleet = createFleet(repo, { name: 'A' });
    fleet = startPreparation(repo, fleet.id, fleet.version);
    fleet = completePreparation(repo, fleet.id, fleet.version, {});
    fleet = deployFleet(repo, fleet.id, fleet.version);
    fleet = enterBattle(repo, fleet.id, fleet.version);
    fleet = resolveVictorious(repo, fleet.id, fleet.version);

    expect(() => resolveDestroyed(repo, fleet.id, fleet.version)).toThrow(FleetEditError);
  });

  it('throws FleetEditError when attempting a transition from Destroyed', () => {
    const repo = makeRepo();
    let fleet = createFleet(repo, { name: 'A' });
    fleet = startPreparation(repo, fleet.id, fleet.version);
    fleet = completePreparation(repo, fleet.id, fleet.version, {});
    fleet = deployFleet(repo, fleet.id, fleet.version);
    fleet = enterBattle(repo, fleet.id, fleet.version);
    fleet = resolveDestroyed(repo, fleet.id, fleet.version);

    expect(() => resolveVictorious(repo, fleet.id, fleet.version)).toThrow(FleetEditError);
  });

  it('throws FleetEditError when editing a terminal fleet', () => {
    const repo = makeRepo();
    let fleet = createFleet(repo, { name: 'A' });
    fleet = startPreparation(repo, fleet.id, fleet.version);
    fleet = completePreparation(repo, fleet.id, fleet.version, {});
    fleet = deployFleet(repo, fleet.id, fleet.version);
    fleet = enterBattle(repo, fleet.id, fleet.version);
    fleet = resolveVictorious(repo, fleet.id, fleet.version);

    expect(() =>
      updateFleet(repo, fleet.id, fleet.version, { name: 'Renamed' }),
    ).toThrow(FleetEditError);
  });
});

// ── timeline integrity ────────────────────────────────────────────────────────

describe('timeline integrity', () => {
  it('each operation appends exactly one event', () => {
    const repo = makeRepo();
    let fleet = createFleet(repo, { name: 'A' });
    expect(fleet.timeline).toHaveLength(1); // FleetCreated

    fleet = updateFleet(repo, fleet.id, fleet.version, { name: 'B' });
    expect(fleet.timeline).toHaveLength(2); // + FleetUpdated

    fleet = startPreparation(repo, fleet.id, fleet.version);
    expect(fleet.timeline).toHaveLength(3); // + FleetPreparationStarted

    fleet = failPreparation(repo, fleet.id, fleet.version, 'oops');
    expect(fleet.timeline).toHaveLength(4); // + FleetPreparationFailed
  });

  it('timeline is in chronological order', () => {
    const repo = makeRepo();
    let fleet = createFleet(repo, { name: 'A' });
    fleet = startPreparation(repo, fleet.id, fleet.version);
    fleet = completePreparation(repo, fleet.id, fleet.version, {});

    const types = fleet.timeline.map((e) => e.type);
    expect(types).toEqual(['FleetCreated', 'FleetPreparationStarted', 'FleetReady']);
  });

  it('all events have a timestamp', () => {
    const repo = makeRepo();
    let fleet = createFleet(repo, { name: 'A' });
    fleet = startPreparation(repo, fleet.id, fleet.version);
    for (const event of fleet.timeline) {
      expect(event.timestamp).toBeDefined();
      expect(new Date(event.timestamp).getTime()).not.toBeNaN();
    }
  });

  it('persisted fleet has the same timeline as the returned fleet', () => {
    const repo = makeRepo();
    const fleet = createFleet(repo, { name: 'A' });
    expect(repo.getOrThrow(fleet.id).timeline).toEqual(fleet.timeline);
  });
});

// ── getFleet ──────────────────────────────────────────────────────────────────

describe('getFleet', () => {
  it('returns the fleet when it exists', () => {
    const repo = makeRepo();
    const fleet = createFleet(repo, { name: 'A' });
    expect(getFleet(repo, fleet.id).id).toBe(fleet.id);
  });

  it('throws NotFoundError when the fleet does not exist', () => {
    expect(() => getFleet(makeRepo(), 'nonexistent')).toThrow(NotFoundError);
  });
});
