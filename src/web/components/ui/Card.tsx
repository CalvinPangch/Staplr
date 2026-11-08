import type { ElementType, HTMLAttributes, ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { cn } from '../../lib/cn';

/**
 * The one card design (feature 004, FR-006): solid surface, rounded corners,
 * a hairline and soft shadow in light mode, none in dark mode. As in AdminLTE,
 * a card may have a header bar (title on the left, small tools such as a status
 * or actions on the right) and a footer bar for actions, each separated from
 * the body by a hairline. With a header or footer, `className` styles the body.
 */
export function Card({
  as: Tag = 'div',
  className,
  title,
  headingLevel = 2,
  titleId,
  tools,
  footer,
  children,
  ...rest
}: Omit<HTMLAttributes<HTMLElement>, 'title'> & {
  as?: ElementType;
  title?: ReactNode;
  headingLevel?: 2 | 3;
  /** An id for the title, so a section can be labelled by it. */
  titleId?: string;
  tools?: ReactNode;
  footer?: ReactNode;
}) {
  const card = 'rounded-card border border-separator bg-surface shadow-card';
  if (!title && !footer)
    return (
      <Tag data-card="" className={cn(card, 'p-4 md:p-6', className)} {...rest}>
        {children}
      </Tag>
    );
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <Tag data-card="" className={cn(card, 'flex flex-col')} {...rest}>
      {title && (
        <div
          data-card-header=""
          className="flex flex-wrap items-center justify-between gap-3 border-b border-separator px-4 py-3 md:px-6"
        >
          <Heading
            id={titleId}
            className="min-w-0 break-words text-body font-semibold text-fg"
          >
            {title}
          </Heading>
          {tools && (
            <div className="flex shrink-0 items-center gap-2">{tools}</div>
          )}
        </div>
      )}
      <div className={cn('p-4 md:p-6', className)}>{children}</div>
      {footer && (
        <div
          data-card-footer=""
          className="flex flex-wrap items-center gap-2 border-t border-separator px-4 py-3 md:px-6"
        >
          {footer}
        </div>
      )}
    </Tag>
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
