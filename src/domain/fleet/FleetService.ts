import { randomUUID } from 'crypto';

import type { Fleet, FleetRepository, Ship } from '../../persistence';

import { assertValidTransition, InvalidTransitionError, isTerminal } from './stateMachine';

export { InvalidTransitionError };

export class FleetEditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FleetEditError';
  }
}

interface CreateFleetInput {
  name: string;
  ships?: Ship[];
  requiredResources?: Record<string, number>;
}

interface UpdateFleetInput {
  name?: string;
  ships?: Ship[];
  requiredResources?: Record<string, number>;
}

function now(): string {
  return new Date().toISOString();
}

export function createFleet(repo: FleetRepository, input: CreateFleetInput): Fleet {
  const ts = now();
  const fleet: Fleet = {
    id: randomUUID(),
    version: 1,
    name: input.name,
    state: 'Docked',
    ships: input.ships ?? [],
    requiredResources: input.requiredResources ?? {},
    reservedResources: {},
    timeline: [{ type: 'FleetCreated', timestamp: ts, data: { name: input.name } }],
    createdAt: ts,
    updatedAt: ts,
  };
  repo.create(fleet);
  return fleet;
}

export function getFleet(repo: FleetRepository, id: string): Fleet {
  return repo.getOrThrow(id);
}

export function updateFleet(
  repo: FleetRepository,
  id: string,
  expectedVersion: number,
  input: UpdateFleetInput,
): Fleet {
  let result!: Fleet;
  repo.update(id, expectedVersion, (fleet) => {
    if (fleet.state !== 'Docked') {
      throw new FleetEditError(`Cannot edit fleet in state ${fleet.state}`);
    }
    if (isTerminal(fleet.state)) {
      throw new FleetEditError(`Fleet is in terminal state ${fleet.state}`);
    }
    const ts = now();
    result = {
      ...fleet,
      ...(input.name !== undefined && { name: input.name }),
      ...(input.ships !== undefined && { ships: input.ships }),
      ...(input.requiredResources !== undefined && { requiredResources: input.requiredResources }),
      updatedAt: ts,
      timeline: [...fleet.timeline, { type: 'FleetUpdated', timestamp: ts, data: { ...input } }],
    };
    return result;
  });
  return result;
}

function transitionFleet(
  repo: FleetRepository,
  id: string,
  expectedVersion: number,
  targetState: Fleet['state'],
  eventType: string,
  eventData?: Record<string, unknown>,
  extraFields?: Partial<Fleet>,
): Fleet {
  let result!: Fleet;
  repo.update(id, expectedVersion, (fleet) => {
    if (isTerminal(fleet.state)) {
      throw new FleetEditError(`Fleet is in terminal state ${fleet.state}`);
    }
    assertValidTransition(fleet.state, targetState);
    const ts = now();
    result = {
      ...fleet,
      state: targetState,
      updatedAt: ts,
      ...extraFields,
      timeline: [
        ...fleet.timeline,
        { type: eventType, timestamp: ts, ...(eventData && { data: eventData }) },
      ],
    };
    return result;
  });
  return result;
}

export function startPreparation(
  repo: FleetRepository,
  id: string,
  expectedVersion: number,
): Fleet {
  return transitionFleet(repo, id, expectedVersion, 'Preparing', 'FleetPreparationStarted');
}

export function completePreparation(
  repo: FleetRepository,
  id: string,
  expectedVersion: number,
  reservedResources: Record<string, number>,
): Fleet {
  return transitionFleet(
    repo,
    id,
    expectedVersion,
    'Ready',
    'FleetReady',
    { reservedResources },
    { reservedResources },
  );
}

export function failPreparation(
  repo: FleetRepository,
  id: string,
  expectedVersion: number,
  reason: string,
): Fleet {
  return transitionFleet(repo, id, expectedVersion, 'FailedPreparation', 'FleetPreparationFailed', {
    reason,
  });
}

export function deployFleet(
  repo: FleetRepository,
  id: string,
  expectedVersion: number,
): Fleet {
  return transitionFleet(repo, id, expectedVersion, 'Deployed', 'FleetDeployed');
}

export function enterBattle(
  repo: FleetRepository,
  id: string,
  expectedVersion: number,
): Fleet {
  return transitionFleet(repo, id, expectedVersion, 'InBattle', 'FleetEnteredBattle');
}

export function resolveVictorious(
  repo: FleetRepository,
  id: string,
  expectedVersion: number,
): Fleet {
  return transitionFleet(repo, id, expectedVersion, 'Victorious', 'FleetVictorious');
}

export function resolveDestroyed(
  repo: FleetRepository,
  id: string,
  expectedVersion: number,
): Fleet {
  return transitionFleet(repo, id, expectedVersion, 'Destroyed', 'FleetDestroyed');
}
