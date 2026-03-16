export {
  FleetEditError,
  InvalidTransitionError,
  createFleet,
  updateFleet,
  getFleet,
  startPreparation,
  completePreparation,
  failPreparation,
  deployFleet,
  enterBattle,
  resolveVictorious,
  resolveDestroyed,
} from './FleetService';

export {
  canTransition,
  assertValidTransition,
  allowedTransitions,
  isTerminal,
} from './stateMachine';
