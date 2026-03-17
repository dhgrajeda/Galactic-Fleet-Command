import { EventEmitter } from 'events';

import type { FleetState, Command } from './persistence';

export interface FleetStateChangedEvent {
  fleetId: string;
  from: FleetState;
  to: FleetState;
}

export interface CommandSucceededEvent {
  command: Command;
}

export interface CommandFailedEvent {
  command: Command;
  error?: string;
}

export interface AppEvents {
  'fleet:stateChanged': FleetStateChangedEvent;
  'command:succeeded': CommandSucceededEvent;
  'command:failed': CommandFailedEvent;
}

/**
 * Typed wrapper around Node's EventEmitter.
 * Swap the underlying emitter for distributed pub/sub (Redis, etc.) later.
 */
export class EventBus {
  private readonly emitter = new EventEmitter();

  emit<K extends keyof AppEvents>(event: K, data: AppEvents[K]): void {
    this.emitter.emit(event, data);
  }

  on<K extends keyof AppEvents>(event: K, listener: (data: AppEvents[K]) => void): void {
    this.emitter.on(event, listener);
  }

  off<K extends keyof AppEvents>(event: K, listener: (data: AppEvents[K]) => void): void {
    this.emitter.off(event, listener);
  }

  removeAllListeners(): void {
    this.emitter.removeAllListeners();
  }
}
