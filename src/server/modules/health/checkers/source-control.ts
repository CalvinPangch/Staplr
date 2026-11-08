import type { createScheduler } from '../scheduler.js';
import type { SourceControlService } from '../../source-control/service.js';

/** Re-verifies every token: at start-up, every hour and on "Check now". */
export function registerSourceControlChecker(
  scheduler: ReturnType<typeof createScheduler>,
  service: SourceControlService,
) {
  scheduler.registerChecker('source-control', () => service.checkAll());
}
