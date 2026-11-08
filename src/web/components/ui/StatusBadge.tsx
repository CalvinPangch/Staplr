import {
  Circle,
  CircleAlert,
  CircleCheck,
  CircleX,
  LoaderCircle,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '../../lib/cn';

/** The five status meanings (feature 004, FR-007); always an icon and a word. */
export type StatusMeaning =
  'good' | 'attention' | 'failed' | 'progress' | 'neutral';

/** Every status in the spec's vocabulary, as readable text and a meaning. */
const known: Record<string, { text: string; meaning: StatusMeaning }> = {
  connected: { text: 'Connected', meaning: 'good' },
  needs_attention: { text: 'Needs attention', meaning: 'attention' },
  needs_relogin: { text: 'Needs re-login', meaning: 'attention' },
  ready: { text: 'Ready', meaning: 'good' },
  not_ready: { text: 'Not ready', meaning: 'attention' },
  downloading: { text: 'Downloading', meaning: 'progress' },
  downloaded: { text: 'Downloaded', meaning: 'good' },
  download_failed: { text: 'Download failed', meaning: 'failed' },
  in_progress: { text: 'In progress', meaning: 'progress' },
  checking: { text: 'Checking', meaning: 'progress' },
  succeeded: { text: 'Succeeded', meaning: 'good' },
  failed: { text: 'Failed', meaning: 'failed' },
  cancelled: { text: 'Cancelled', meaning: 'neutral' },
  expired: { text: 'Expired', meaning: 'attention' },
  available: { text: 'Available', meaning: 'good' },
  unavailable: { text: 'Unavailable', meaning: 'failed' },
  unknown: { text: 'Not checked', meaning: 'neutral' },
  new: { text: 'New', meaning: 'neutral' },
  review: { text: 'Review', meaning: 'neutral' },
  testing: { text: 'Testing', meaning: 'neutral' },
  end: { text: 'End', meaning: 'good' },
};

const icons: Record<StatusMeaning, LucideIcon> = {
  good: CircleCheck,
  attention: CircleAlert,
  failed: CircleX,
  progress: LoaderCircle,
  neutral: Circle,
};

const tones: Record<StatusMeaning, string> = {
  good: 'bg-status-good-soft text-status-good',
  attention: 'bg-status-attention-soft text-status-attention',
  failed: 'bg-status-failed-soft text-status-failed',
  progress: 'bg-status-progress-soft text-status-progress',
  neutral: 'bg-status-neutral-soft text-status-neutral border border-separator',
};

export interface StatusBadgeProps {
  /** A known status such as "ready" or "needs_relogin". */
  status?: string;
  /** Or an explicit meaning and label. */
  meaning?: StatusMeaning;
  label?: string;
  /** Optional reason shown after the status, for example "revoked". */
  reason?: string | undefined;
}

export function StatusBadge({
  status,
  meaning,
  label,
  reason,
}: StatusBadgeProps) {
  const entry =
    status !== undefined
      ? (known[status] ?? { text: status, meaning: 'neutral' as const })
      : { text: label ?? '', meaning: meaning ?? 'neutral' };
  const Icon = icons[entry.meaning];
  return (
    <span
      data-status-badge=""
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-pill px-2 py-1 text-caption font-medium',
        tones[entry.meaning],
      )}
    >
      <Icon aria-hidden="true" className="size-3.5 shrink-0" />
      <span className="truncate">
        {entry.text}
        {reason ? `: ${reason}` : ''}
      </span>
    </span>
  );
}
