import type { FleetState } from '../../../src/persistence';
import {
  allowedTransitions,
  assertValidTransition,
  canTransition,
  InvalidTransitionError,
  isTerminal,
} from '../../../src/domain/fleet/stateMachine';

// ── fixtures ──────────────────────────────────────────────────────────────────

const VALID_EDGES: [FleetState, FleetState][] = [
  ['Docked', 'Preparing'],
  ['Preparing', 'Ready'],
  ['Preparing', 'FailedPreparation'],
  ['Ready', 'Deployed'],
  ['Deployed', 'InBattle'],
  ['InBattle', 'Victorious'],
  ['InBattle', 'Destroyed'],
];

const INVALID_EDGES: [FleetState, FleetState][] = [
  // skipping states
  ['Docked', 'Ready'],
  ['Docked', 'Deployed'],
  ['Docked', 'InBattle'],
  ['Docked', 'Victorious'],
  ['Docked', 'Destroyed'],
  ['Docked', 'FailedPreparation'],
  // backwards
  ['Preparing', 'Docked'],
  ['Ready', 'Preparing'],
  ['Ready', 'Docked'],
  ['Deployed', 'Ready'],
  ['Deployed', 'Docked'],
  ['InBattle', 'Deployed'],
  ['InBattle', 'Docked'],
  // terminal states have no outgoing transitions
  ['Victorious', 'Docked'],
  ['Victorious', 'Destroyed'],
  ['Destroyed', 'Docked'],
  ['Destroyed', 'Victorious'],
  // dead-end state has no outgoing transitions
  ['FailedPreparation', 'Docked'],
  ['FailedPreparation', 'Preparing'],
];

// ── canTransition ─────────────────────────────────────────────────────────────

describe('canTransition', () => {
  test.each(VALID_EDGES)('%s → %s returns true', (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });

  test.each(INVALID_EDGES)('%s → %s returns false', (from, to) => {
    expect(canTransition(from, to)).toBe(false);
  });
});

// ── assertValidTransition ─────────────────────────────────────────────────────

describe('assertValidTransition', () => {
  test.each(VALID_EDGES)('%s → %s does not throw', (from, to) => {
    expect(() => assertValidTransition(from, to)).not.toThrow();
  });

  test.each(INVALID_EDGES)('%s → %s throws InvalidTransitionError', (from, to) => {
    expect(() => assertValidTransition(from, to)).toThrow(InvalidTransitionError);
  });

  it('error carries from/to state and a readable message', () => {
    let caught: unknown;
    try {
      assertValidTransition('Ready', 'Preparing');
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(InvalidTransitionError);
    const err = caught as InvalidTransitionError;
    expect(err.from).toBe('Ready');
    expect(err.to).toBe('Preparing');
    expect(err.message).toContain('Ready');
    expect(err.message).toContain('Preparing');
  });
});

// ── allowedTransitions ────────────────────────────────────────────────────────

describe('allowedTransitions', () => {
  it('Docked can only go to Preparing', () => {
    expect(allowedTransitions('Docked')).toEqual(['Preparing']);
  });

  it('Preparing can go to Ready or FailedPreparation', () => {
    expect(allowedTransitions('Preparing')).toEqual(['Ready', 'FailedPreparation']);
  });

  it('Ready can only go to Deployed', () => {
    expect(allowedTransitions('Ready')).toEqual(['Deployed']);
  });

  it('Deployed can only go to InBattle', () => {
    expect(allowedTransitions('Deployed')).toEqual(['InBattle']);
  });

  it('InBattle can go to Victorious or Destroyed', () => {
    expect(allowedTransitions('InBattle')).toEqual(['Victorious', 'Destroyed']);
  });

  it.each(['Victorious', 'Destroyed', 'FailedPreparation'] as FleetState[])(
    '%s returns empty array (no valid next states)',
    (state) => {
      expect(allowedTransitions(state)).toEqual([]);
    },
  );
});

// ── isTerminal ────────────────────────────────────────────────────────────────

describe('isTerminal', () => {
  it.each(['Victorious', 'Destroyed', 'FailedPreparation'] as FleetState[])('%s is terminal', (state) => {
    expect(isTerminal(state)).toBe(true);
  });

  it.each([
    'Docked',
    'Preparing',
    'Ready',
    'Deployed',
    'InBattle',
  ] as FleetState[])('%s is not terminal', (state) => {
    expect(isTerminal(state)).toBe(false);
  });
});
