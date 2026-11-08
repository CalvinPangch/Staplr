import { useEffect, useState } from 'react';
import { Link, useRouterState } from '@tanstack/react-router';
import { cn } from '../../../lib/cn';
import { navItems } from './navItems';

const typingTarget = (el: Element | null) =>
  el instanceof HTMLTextAreaElement ||
  (el instanceof HTMLInputElement &&
    !['checkbox', 'radio', 'button', 'submit'].includes(el.type)) ||
  (el instanceof HTMLElement && el.isContentEditable);

/**
 * The phone navigation (feature 004, FR-015a): a frosted tab bar at the bottom
 * with the four places, clear of the device's safe area. It steps aside while
 * the owner types, so the on-screen keyboard never puts it over the field.
 */
export function TabBar() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    const update = () => setTyping(typingTarget(document.activeElement));
    // focus moves after focusout fires, so check once it has settled
    const later = () => setTimeout(update, 0);
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', later);
    return () => {
      document.removeEventListener('focusin', update);
      document.removeEventListener('focusout', later);
    };
  }, []);
  return (
    <nav aria-label="Main" hidden={typing} className="tab-bar frosted">
      <ul className="m-0 grid list-none grid-cols-4 p-0">
        {navItems.map((item) => {
          const current = item.match(path);
          const Icon = item.icon;
          return (
            <li key={item.to}>
              <Link
                to={item.to}
                aria-current={current ? 'page' : undefined}
                className={cn(
                  'flex min-h-12 flex-col items-center justify-center gap-1 py-1 text-caption',
                  current ? 'font-semibold text-accent' : 'text-fg',
                )}
              >
                <Icon aria-hidden="true" className="size-6" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
