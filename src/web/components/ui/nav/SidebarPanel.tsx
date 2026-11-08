import { useEffect, useRef, type RefObject } from 'react';
import * as RadixDialog from '@radix-ui/react-dialog';
import { useRouterState } from '@tanstack/react-router';
import { SidebarContent } from './Sidebar';

/**
 * Below 1024 px the menu button opens the dark sidebar as a slide-in panel
 * (feature 004, FR-015b). Radix Dialog keeps focus inside, closes on Escape
 * and on a tap outside, and gives focus back to the menu button; choosing a
 * link closes it too.
 */
export function SidebarPanel({
  open,
  onOpenChange,
  returnFocusTo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The menu button, which gets focus back when the panel closes. */
  returnFocusTo: RefObject<HTMLButtonElement | null>;
}) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const first = useRef(path);
  useEffect(() => {
    if (path !== first.current) {
      first.current = path;
      onOpenChange(false);
    }
  }, [path, onOpenChange]);
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="sidebar-overlay fixed inset-0 z-40 bg-black/40" />
        <RadixDialog.Content
          id="sidebar-panel"
          aria-describedby={undefined}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnFocusTo.current?.focus();
          }}
          className="sidebar-panel sidebar-surface fixed inset-y-0 left-0 z-50 flex flex-col overflow-y-auto"
        >
          <RadixDialog.Title className="sr-only">Navigation</RadixDialog.Title>
          <SidebarContent />
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
