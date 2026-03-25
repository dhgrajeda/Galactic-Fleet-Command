import { ConcurrencyError } from '../persistence';
import type { CommandResult } from './types';

const RETRY_DELAYS = [0, 100, 500];

function delay(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Executes a function with retries on ConcurrencyError.
 * Returns the result on success, or a failure result after exhausting retries.
 */
export async function withRetry(
  fn: () => CommandResult,
  log: { warn: (msg: string, meta: Record<string, unknown>) => void },
): Promise<CommandResult> {
  for (let attempt = 0; attempt < RETRY_DELAYS.length; attempt++) {
    if (attempt > 0) {
      log.warn('Retrying command', { attempt, delayMs: RETRY_DELAYS[attempt] });
      await delay(RETRY_DELAYS[attempt]);
    }

    try {
      return fn();
    } catch (err) {
      const isRetryable = err instanceof ConcurrencyError && attempt < RETRY_DELAYS.length - 1;
      if (isRetryable) continue;
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  return { success: false, error: 'Unknown error' };
}
