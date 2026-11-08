import { cn } from '../../lib/cn';

type Tone = 'good' | 'warn' | 'bad' | 'neutral' | 'busy';

/** Every status in the spec's vocabulary, as readable text plus a symbol. */
const known: Record<string, { text: string; tone: Tone }> = {
  connected: { text: 'Connected', tone: 'good' },
  needs_attention: { text: 'Needs attention', tone: 'warn' },
  needs_relogin: { text: 'Needs re-login', tone: 'warn' },
  ready: { text: 'Ready', tone: 'good' },
  not_ready: { text: 'Not ready', tone: 'bad' },
  downloading: { text: 'Downloading', tone: 'busy' },
  downloaded: { text: 'Downloaded', tone: 'good' },
  download_failed: { text: 'Download failed', tone: 'bad' },
  in_progress: { text: 'In progress', tone: 'busy' },
  succeeded: { text: 'Succeeded', tone: 'good' },
  failed: { text: 'Failed', tone: 'bad' },
  cancelled: { text: 'Cancelled', tone: 'neutral' },
  expired: { text: 'Expired', tone: 'warn' },
  available: { text: 'Available', tone: 'good' },
  unavailable: { text: 'Unavailable', tone: 'bad' },
  unknown: { text: 'Not checked', tone: 'neutral' },
  new: { text: 'New', tone: 'neutral' },
  review: { text: 'Review', tone: 'neutral' },
  testing: { text: 'Testing', tone: 'neutral' },
  end: { text: 'End', tone: 'good' },
};

const symbols: Record<Tone, string> = {
  good: '✓',
  warn: '!',
  bad: '✕',
  neutral: '•',
  busy: '…',
};

const tones: Record<Tone, string> = {
  good: 'bg-success-soft text-success',
  warn: 'bg-warning-soft text-warning',
  bad: 'bg-danger-soft text-danger',
  neutral: 'bg-surface text-fg',
  busy: 'bg-info-soft text-fg',
};

export interface StatusBadgeProps {
  status: string;
  /** Optional reason shown after the status, for example "revoked". */
  reason?: string | undefined;
}

export function StatusBadge({ status, reason }: StatusBadgeProps) {
  const entry = known[status] ?? { text: status, tone: 'neutral' as const };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-edge-soft px-2.5 py-0.5 text-sm font-medium',
        tones[entry.tone],
      )}
    >
      <span aria-hidden="true">{symbols[entry.tone]}</span>
      <span>
        {entry.text}
        {reason ? `: ${reason}` : ''}
      </span>
    </span>
  );
}
