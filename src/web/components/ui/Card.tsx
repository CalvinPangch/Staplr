import type { ElementType, HTMLAttributes, ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { cn } from '../../lib/cn';

/**
 * The one card design (feature 004, FR-006): solid surface, rounded corners,
 * a hairline and soft shadow in light mode, none in dark mode.
 */
export function Card({
  as: Tag = 'div',
  className,
  ...rest
}: HTMLAttributes<HTMLElement> & { as?: ElementType }) {
  return (
    <Tag
      data-card=""
      className={cn(
        'rounded-card border border-separator bg-surface p-4 shadow-card md:p-6',
        className,
      )}
      {...rest}
    />
  );
}

export interface CardRowProps {
  title: string;
  /** Makes the title a link (internal route). */
  href?: string;
  /** Short details under the title, for example the role and model. */
  details?: ReactNode;
  /** A StatusBadge. */
  status?: ReactNode;
  /** Why the item needs attention, shown under the title. */
  reason?: string | undefined;
  /** Buttons and links for this item. */
  actions?: ReactNode;
  headingLevel?: 2 | 3;
}

/** Title, details, status and actions in the same places on every card. */
export function CardRow({
  title,
  href,
  details,
  status,
  reason,
  actions,
  headingLevel = 2,
}: CardRowProps) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Heading
            className="truncate text-section font-semibold text-fg"
            title={title}
          >
            {href ? (
              <Link to={href} className="text-fg hover:text-accent">
                {title}
              </Link>
            ) : (
              title
            )}
          </Heading>
          {details && (
            <div className="text-secondary text-muted">{details}</div>
          )}
        </div>
        {status && <div className="shrink-0">{status}</div>}
      </div>
      {reason && <p className="text-secondary text-fg">{reason}</p>}
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
