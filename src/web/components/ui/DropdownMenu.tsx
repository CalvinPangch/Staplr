import type { ReactNode } from 'react';
import * as RadixMenu from '@radix-ui/react-dropdown-menu';
import { cn } from '../../lib/cn';

export interface MenuItem {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
}

export interface DropdownMenuProps {
  /** Accessible name of the button that opens the menu. */
  label: string;
  trigger: ReactNode;
  items: MenuItem[];
  className?: string;
}

export function DropdownMenu({
  label,
  trigger,
  items,
  className,
}: DropdownMenuProps) {
  return (
    <RadixMenu.Root>
      <RadixMenu.Trigger
        aria-label={label}
        className={cn(
          'inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-edge bg-bg px-3 text-fg hover:bg-surface',
          className,
        )}
      >
        {trigger}
      </RadixMenu.Trigger>
      <RadixMenu.Portal>
        <RadixMenu.Content
          align="end"
          sideOffset={4}
          className="z-50 min-w-44 rounded-lg border border-edge bg-bg p-1 text-fg shadow-lg"
        >
          {items.map((item) => (
            <RadixMenu.Item
              key={item.label}
              disabled={item.disabled ?? false}
              onSelect={item.onSelect}
              className="flex min-h-11 cursor-pointer items-center rounded px-3 py-2 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-60 data-[highlighted]:bg-surface-strong"
            >
              {item.label}
            </RadixMenu.Item>
          ))}
        </RadixMenu.Content>
      </RadixMenu.Portal>
    </RadixMenu.Root>
  );
}
