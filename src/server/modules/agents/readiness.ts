import type {
  ModelAvailability,
  ProviderStatus,
  Readiness,
} from '../../../shared/status.js';

export interface ReadinessReason {
  code: 'no_provider_connection' | 'needs_relogin' | 'model_unavailable';
  message: string;
}

export interface ReadinessInput {
  /** null when the provider connection was disconnected */
  connection: { status: ProviderStatus } | null;
  /** null when the model is no longer in the catalog */
  model: {
    label: string;
    retired: boolean;
    availability: ModelAvailability;
  } | null;
}

/**
 * An agent is ready only when its connection exists and is signed in, and its
 * model is current and verified for that exact connection. Every reason that
 * applies is reported, each with the way to fix it.
 */
export function agentReadiness(input: ReadinessInput): {
  readiness: Readiness;
  reasons: ReadinessReason[];
} {
  const reasons: ReadinessReason[] = [];
  if (!input.connection)
    reasons.push({
      code: 'no_provider_connection',
      message:
        'This agent has no provider connection. Choose a connection and model for it.',
    });
  else if (input.connection.status === 'needs_relogin')
    reasons.push({
      code: 'needs_relogin',
      message:
        'The provider connection needs attention. Replace the API key (Claude) or Re-login (Codex) on the Providers screen.',
    });

  const { model } = input;
  if (!model)
    reasons.push({
      code: 'model_unavailable',
      message: 'This model is no longer offered. Choose another model.',
    });
  else if (model.retired)
    reasons.push({
      code: 'model_unavailable',
      message: `${model.label} has been retired. Choose another model.`,
    });
  else if (input.connection && model.availability === 'unavailable')
    reasons.push({
      code: 'model_unavailable',
      message: `${model.label} is not available to this connection. Choose a different model or connection.`,
    });
  else if (input.connection && model.availability === 'unknown')
    reasons.push({
      code: 'model_unavailable',
      message: `${model.label} has not been checked for this connection yet. Use Check availability.`,
    });

  return { readiness: reasons.length === 0 ? 'ready' : 'not_ready', reasons };
}
