import type { ReactNode } from 'react';

/**
 * The header every signed-in screen starts with (feature 004, FR-005): a large
 * title, a one-line description and at most one main action. It stays at the
 * top while the page scrolls, on frosted glass (solid when the system asks for
 * reduced transparency). Text on it is the primary colour only, so it stays
 * readable over any content scrolling underneath.
 */
export function PageHeader({
  title,
  description,
  action,
  wide = false,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  /** Full width, for screens such as the board. */
  wide?: boolean;
}) {
  return (
    <header className="frosted sticky top-0 z-20 -mx-4 mb-6 border-b border-separator px-4 py-4 md:-mx-8 md:px-8">
      <div
        className={`mx-auto flex w-full flex-wrap items-end justify-between gap-3 ${wide ? '' : 'max-w-5xl'}`}
      >
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="break-words text-title text-fg">{title}</h1>
          {description && <p className="text-body text-fg">{description}</p>}
        </div>
        {action && <div className="flex shrink-0 gap-2">{action}</div>}
      </div>
    </header>
  );
}

/** The page's content under the header, centred at the same width. */
export function PageBody({
  children,
  wide = false,
}: {
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className={`mx-auto flex w-full flex-col gap-6 ${wide ? '' : 'max-w-5xl'}`}
    >
      {children}
    </div>
  );
}
