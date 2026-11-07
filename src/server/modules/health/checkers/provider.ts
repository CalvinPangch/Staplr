import type { createScheduler } from '../scheduler.js';
import type { ProviderService } from '../../providers/service.js';

/**
 * Re-checks every provider connection: at start-up, every hour and on
 * "Check now". Authentication failures set needs_relogin; model denial and
 * transient errors do not (research R19).
 */
export function registerProviderChecker(
  scheduler: ReturnType<typeof createScheduler>,
  service: ProviderService,
) {
  scheduler.registerChecker('providers', () => service.checkAll());
}
