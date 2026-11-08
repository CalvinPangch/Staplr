import { Link } from '@tanstack/react-router';
import { ArrowRight, type LucideIcon } from 'lucide-react';
import { cn } from '../../lib/cn';

export type TileTone = 'accent' | 'progress' | 'attention' | 'failed';

const tones: Record<TileTone, string> = {
  accent: 'bg-tile-accent',
  progress: 'bg-tile-progress',
  attention: 'bg-tile-attention',
  failed: 'bg-tile-failed',
};

/**
 * An AdminLTE stat tile for Home (feature 004, FR-010a): a solid colour with
 * white text, a large number, a label, a decorative icon and a "More info"
 * link whose name says where it goes.
 */
export function StatTile({
  label,
  value,
  icon: Icon,
  tone,
  to,
  hash,
  moreLabel,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  tone: TileTone;
  to: string;
  /** A place on the destination page, for example a section id. */
  hash?: string;
  /** Completes "More info about …" for screen readers. */
  moreLabel: string;
}) {
  return (
    <li
      className={cn(
        'flex flex-col overflow-hidden rounded-card text-white shadow-card',
        tones[tone],
      )}
    >
      <div className="flex items-start justify-between gap-3 p-4">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="m-0 text-title font-bold">{value}</p>
          <p className="m-0 text-body">{label}</p>
        </div>
        <Icon aria-hidden="true" className="size-12 shrink-0 opacity-60" />
      </div>
      <Link
        to={to}
        hash={hash}
        className="mt-auto flex min-h-11 items-center justify-center gap-2 bg-black/20 px-4 text-secondary font-semibold text-white hover:bg-black/30 focus-visible:outline-white focus-visible:-outline-offset-4"
      >
        More info<span className="sr-only"> about {moreLabel}</span>
        <ArrowRight aria-hidden="true" className="size-4" />
      </Link>
    </li>
  );
}
