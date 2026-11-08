import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { ChevronRight } from 'lucide-react';

export interface Crumb {
  label: string;
  to: string;
  params?: Record<string, string>;
}

/**
 * The page title row every signed-in screen starts with (feature 004, FR-005),
 * as in AdminLTE: breadcrumbs (Home › section › page) above a large title, a
 * one-line description and at most one main action. Solid and in the page
 * flow; only the top navigation bar stays at the top.
 *
 * `breadcrumbs` lists the steps before this page; Home is added in front and
 * the title is added as the last, current step.
 */
export function PageHeader({
  title,
  description,
  action,
  breadcrumbs = [],
  wide = false,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  breadcrumbs?: Crumb[];
  /** Full width, for screens such as the board. */
  wide?: boolean;
}) {
  const trail: Crumb[] =
    title === 'Home' && breadcrumbs.length === 0
      ? []
      : [{ label: 'Home', to: '/' }, ...breadcrumbs];
  return (
    <header
      className={`mx-auto flex w-full flex-col gap-2 pb-6 pt-6 ${wide ? '' : 'max-w-5xl'}`}
    >
      <nav aria-label="Breadcrumb">
        <ol className="m-0 flex list-none flex-wrap items-center gap-1 p-0 text-secondary text-muted">
          {trail.map((crumb) => (
            <li key={crumb.to} className="flex items-center gap-1">
              <Link
                to={crumb.to}
                params={crumb.params}
                className="inline-flex min-h-11 min-w-11 items-center text-accent hover:underline"
              >
                {crumb.label}
              </Link>
              <ChevronRight
                aria-hidden="true"
                className="size-4 shrink-0 text-muted"
              />
            </li>
          ))}
          <li className="flex min-w-0 items-center">
            <span aria-current="page" className="truncate text-fg">
              {title}
            </span>
          </li>
        </ol>
      </nav>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="break-words text-title text-fg">{title}</h1>
          {description && <p className="text-body text-fg">{description}</p>}
        </div>
        {action && (
          <div className="flex min-w-0 max-w-full flex-wrap gap-2">
            {action}
          </div>
        )}
      </div>
    </header>
  );
}

/** The page's content under the title row, centred at the same width. */
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
