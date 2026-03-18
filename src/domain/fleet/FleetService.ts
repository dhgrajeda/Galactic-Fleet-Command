import { randomUUID } from 'crypto';

import type { EventBroker } from '../../events';
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

interface TransitionOptions {
  repo: FleetRepository;
  id: string;
  expectedVersion: number;
  targetState: Fleet['state'];
  eventType: string;
  eventData?: Record<string, unknown>;
  extraFields?: Partial<Fleet>;
  events?: EventBroker;
}

function transitionFleet(opts: TransitionOptions): Fleet {
  let result!: Fleet;
  let previousState!: Fleet['state'];

  opts.repo.update(opts.id, opts.expectedVersion, (fleet) => {
    if (isTerminal(fleet.state)) {
      throw new FleetEditError(`Fleet is in terminal state ${fleet.state}`);
    }
    assertValidTransition(fleet.state, opts.targetState);
    previousState = fleet.state;
    const ts = now();
    result = {
      ...fleet,
      state: opts.targetState,
      updatedAt: ts,
      ...opts.extraFields,
      timeline: [
        ...fleet.timeline,
        { type: opts.eventType, timestamp: ts, ...(opts.eventData && { data: opts.eventData }) },
      ],
    };
    return result;
  });

  opts.events?.publish('fleet:stateChanged', {
    fleetId: opts.id,
    from: previousState,
    to: opts.targetState,
  });

  return result;
}

export function startPreparation(
  repo: FleetRepository,
  id: string,
  expectedVersion: number,
  events?: EventBroker,
): Fleet {
  return transitionFleet({ repo, id, expectedVersion, targetState: 'Preparing', eventType: 'FleetPreparationStarted', events });
}

export function completePreparation(
  repo: FleetRepository,
  id: string,
  expectedVersion: number,
  reservedResources: Record<string, number>,
  events?: EventBroker,
): Fleet {
  return transitionFleet({
    repo,
    id,
    expectedVersion,
    targetState: 'Ready',
    eventType: 'FleetReady',
    eventData: { reservedResources },
    extraFields: { reservedResources },
    events,
  });
}

export function failPreparation(
  repo: FleetRepository,
  id: string,
  expectedVersion: number,
  reason: string,
  events?: EventBroker,
): Fleet {
  return transitionFleet({ repo, id, expectedVersion, targetState: 'FailedPreparation', eventType: 'FleetPreparationFailed', eventData: { reason }, events });
}

export function deployFleet(
  repo: FleetRepository,
  id: string,
  expectedVersion: number,
  events?: EventBroker,
): Fleet {
  return transitionFleet({ repo, id, expectedVersion, targetState: 'Deployed', eventType: 'FleetDeployed', events });
}

export function enterBattle(
  repo: FleetRepository,
  id: string,
  expectedVersion: number,
  events?: EventBroker,
): Fleet {
  return transitionFleet({ repo, id, expectedVersion, targetState: 'InBattle', eventType: 'FleetEnteredBattle', events });
}

export function resolveVictorious(
  repo: FleetRepository,
  id: string,
  expectedVersion: number,
  events?: EventBroker,
): Fleet {
  return transitionFleet({ repo, id, expectedVersion, targetState: 'Victorious', eventType: 'FleetVictorious', events });
}

export function resolveDestroyed(
  repo: FleetRepository,
  id: string,
  expectedVersion: number,
  events?: EventBroker,
): Fleet {
  return transitionFleet({ repo, id, expectedVersion, targetState: 'Destroyed', eventType: 'FleetDestroyed', events });
}
