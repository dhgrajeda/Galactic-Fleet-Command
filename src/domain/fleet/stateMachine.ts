import type { FleetState } from '../../persistence';

const TRANSITIONS: Record<FleetState, FleetState[]> = {
  Docked: ['Preparing'],
  Preparing: ['Ready', 'FailedPreparation'],
  Ready: ['Deployed'],
  Deployed: ['InBattle'],
  InBattle: ['Victorious', 'Destroyed'],
  Victorious: [],
  Destroyed: [],
  FailedPreparation: [],
};

const TERMINAL: Set<FleetState> = new Set(['Victorious', 'Destroyed']);

export class InvalidTransitionError extends Error {
  constructor(
    public readonly from: FleetState,
    public readonly to: FleetState,
  ) {
    super(`Invalid transition from ${from} to ${to}`);
    this.name = 'InvalidTransitionError';
  }
}

export function canTransition(from: FleetState, to: FleetState): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertValidTransition(from: FleetState, to: FleetState): void {
  if (!canTransition(from, to)) {
    throw new InvalidTransitionError(from, to);
  }
}

export function allowedTransitions(state: FleetState): FleetState[] {
  return TRANSITIONS[state];
}

export function isTerminal(state: FleetState): boolean {
  return TERMINAL.has(state);
}
