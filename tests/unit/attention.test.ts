import { describe, it, expect } from 'vitest';
import { attentionItems } from '../../src/web/features/home/attention';

/** Feature 004, FR-010: what Home lists first, derived from data it already reads. */
const none = {
  agents: [],
  providerConnections: [],
  sourceControl: [],
  projects: [],
};

describe('attentionItems', () => {
  it('is empty when everything is ready', () => {
    expect(attentionItems(none)).toEqual([]);
    expect(
      attentionItems({
        ...none,
        agents: [{ id: 'a', name: 'Dev', readiness: 'ready', reasons: [] }],
        providerConnections: [
          {
            id: 'p',
            name: 'Claude',
            status: 'connected',
            lastCheckResult: null,
          },
        ],
      }),
    ).toEqual([]);
  });

  it('lists each kind with its reason and the screen that fixes it, failures first', () => {
    const items = attentionItems({
      agents: [
        {
          id: 'a1',
          name: 'Dev',
          readiness: 'not_ready',
          reasons: [
            {
              code: 'needs_relogin',
              message: 'The connection needs re-login.',
            },
            { code: 'model_unavailable', message: 'Model not available.' },
          ],
        },
      ],
      providerConnections: [
        {
          id: 'p1',
          name: 'Work Claude',
          status: 'needs_relogin',
          lastCheckResult: 'Anthropic rejected this API key.',
        },
      ],
      sourceControl: [
        {
          id: 's1',
          name: 'GitHub',
          status: 'needs_attention',
          lastCheckResult: 'This token has expired.',
        },
      ],
      projects: [
        {
          id: 'x1',
          name: 'Shop',
          downloadStatus: 'download_failed',
          reasons: [
            { code: 'download_failed', message: 'The download failed.' },
          ],
        },
        {
          id: 'x2',
          name: 'Blog',
          downloadStatus: 'downloaded',
          reasons: [
            {
              code: 'no_project_manager',
              message: 'The team has no Project Manager.',
            },
          ],
        },
        {
          id: 'x3',
          name: 'Fine',
          downloadStatus: 'downloaded',
          reasons: [],
        },
      ],
    });
    expect(items).toEqual([
      {
        kind: 'project',
        id: 'x1',
        name: 'Shop',
        reason: 'The download failed.',
        href: '/projects/x1',
        severity: 'failed',
      },
      {
        kind: 'agent',
        id: 'a1',
        name: 'Dev',
        reason: 'The connection needs re-login.',
        href: '/agents/a1',
        severity: 'attention',
      },
      {
        kind: 'connection',
        id: 'p1',
        name: 'Work Claude',
        reason: 'Anthropic rejected this API key.',
        href: '/settings/providers',
        severity: 'attention',
      },
      {
        kind: 'source-control',
        id: 's1',
        name: 'GitHub',
        reason: 'This token has expired.',
        href: '/settings/source-control',
        severity: 'attention',
      },
      {
        kind: 'project',
        id: 'x2',
        name: 'Blog',
        reason: 'The team has no Project Manager.',
        href: '/projects/x2',
        severity: 'attention',
      },
    ]);
  });

  it('falls back to a plain reason when none was recorded', () => {
    const [item] = attentionItems({
      ...none,
      providerConnections: [
        {
          id: 'p',
          name: 'Codex',
          status: 'needs_relogin',
          lastCheckResult: null,
        },
      ],
    });
    expect(item?.reason).toBe('Needs re-login.');
  });
});
