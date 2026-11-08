import { describe, it, expect } from 'vitest';
import { agentReadiness } from '../../src/server/modules/agents/readiness';

const connected = { status: 'connected' as const };
const needsRelogin = { status: 'needs_relogin' as const };
const codes = (result: ReturnType<typeof agentReadiness>) =>
  result.reasons.map((r) => r.code);

describe('agent readiness', () => {
  it('is ready with a connected connection and an available model', () => {
    expect(
      agentReadiness({
        connection: connected,
        model: { label: 'Sonnet', retired: false, availability: 'available' },
      }),
    ).toEqual({ readiness: 'ready', reasons: [] });
  });

  it('reports no_provider_connection when the link is gone', () => {
    const result = agentReadiness({
      connection: null,
      model: { label: 'Sonnet', retired: false, availability: 'unknown' },
    });
    expect(result.readiness).toBe('not_ready');
    expect(codes(result)).toEqual(['no_provider_connection']);
  });

  it('reports needs_relogin from the connection status', () => {
    const result = agentReadiness({
      connection: needsRelogin,
      model: { label: 'Sonnet', retired: false, availability: 'available' },
    });
    expect(codes(result)).toEqual(['needs_relogin']);
  });

  it.each([
    ['retired', { retired: true, availability: 'available' as const }],
    ['unavailable', { retired: false, availability: 'unavailable' as const }],
    ['unknown', { retired: false, availability: 'unknown' as const }],
  ])('reports model_unavailable for a %s model', (_name, model) => {
    const result = agentReadiness({
      connection: connected,
      model: { label: 'Sonnet', ...model },
    });
    expect(result.readiness).toBe('not_ready');
    expect(codes(result)).toEqual(['model_unavailable']);
  });

  it('treats a model missing from the catalog as unavailable', () => {
    const result = agentReadiness({ connection: connected, model: null });
    expect(codes(result)).toEqual(['model_unavailable']);
  });

  it('accumulates every reason that applies', () => {
    const result = agentReadiness({
      connection: needsRelogin,
      model: { label: 'Sonnet', retired: false, availability: 'unknown' },
    });
    expect(codes(result)).toEqual(['needs_relogin', 'model_unavailable']);
  });

  it('tells the person how to fix each reason', () => {
    const none = agentReadiness({
      connection: null,
      model: { label: 'Sonnet', retired: false, availability: 'available' },
    });
    expect(none.reasons[0]?.message).toMatch(/Choose a connection/);
    const relogin = agentReadiness({
      connection: needsRelogin,
      model: { label: 'Sonnet', retired: false, availability: 'available' },
    });
    expect(relogin.reasons[0]?.message).toMatch(/Replace the API key|Re-login/);
    const unknown = agentReadiness({
      connection: connected,
      model: { label: 'Sonnet', retired: false, availability: 'unknown' },
    });
    expect(unknown.reasons[0]?.message).toMatch(/Check availability/);
    const denied = agentReadiness({
      connection: connected,
      model: { label: 'Sonnet', retired: false, availability: 'unavailable' },
    });
    expect(denied.reasons[0]?.message).toMatch(/Sonnet/);
    expect(denied.reasons[0]?.message).toMatch(/another model|different/);
    const retired = agentReadiness({
      connection: connected,
      model: { label: 'Sonnet', retired: true, availability: 'available' },
    });
    expect(retired.reasons[0]?.message).toMatch(/retired/);
  });
});
