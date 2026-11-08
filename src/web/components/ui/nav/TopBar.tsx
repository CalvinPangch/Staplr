import type { Ref } from 'react';
import { Menu } from 'lucide-react';
import { useRouterState } from '@tanstack/react-router';
import { SignOutButton, ThemeSelect } from './AccountControls';
import { sectionName } from './navItems';

/**
 * The top navigation bar on every signed-in screen (feature 004, FR-005a):
 * sticky and frosted, with the menu button, the current section's name, the
 * theme choice and Sign out. Text on it is the primary colour only, so it stays
 * readable over anything scrolling underneath.
 */
export function TopBar({
  expanded,
  controls,
  onToggle,
  buttonRef,
}: {
  /** Whether the sidebar (wide) or the panel (narrow) is showing. */
  expanded: boolean;
  /** The id of what the menu button shows and hides. */
  controls: string;
  onToggle: () => void;
  buttonRef?: Ref<HTMLButtonElement>;
}) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <header className="frosted sticky top-0 z-30 flex min-h-14 items-center gap-2 border-b border-separator px-4 md:gap-3 md:px-8">
      <button
        ref={buttonRef}
        type="button"
        aria-label="Menu"
        aria-expanded={expanded}
        aria-controls={controls}
        onClick={onToggle}
        className="grid size-11 shrink-0 place-items-center rounded-control text-fg hover:bg-accent-soft"
      >
        <Menu aria-hidden="true" className="size-6" />
      </button>
      <p className="m-0 min-w-0 flex-1 truncate text-body font-semibold text-fg">
        {sectionName(path)}
      </p>
      <ThemeSelect compact />
      <SignOutButton compact />
    </header>
  );
}
