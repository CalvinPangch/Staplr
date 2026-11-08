import type { ButtonHTMLAttributes } from 'react';
import { LoaderCircle } from 'lucide-react';
import { cn } from '../../lib/cn';

/**
 * The four kinds of button (feature 004, FR-008). At most one `primary` per
 * area; `destructive` is outlined, and filled only to confirm in a dialog.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'destructive' | 'quiet';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-fg hover:opacity-90 active:opacity-80',
  secondary:
    'border border-control bg-surface text-fg hover:bg-bg active:bg-separator',
  destructive:
    'border border-status-failed bg-surface text-status-failed hover:bg-status-failed-soft',
  quiet: 'text-accent hover:bg-accent-soft',
};
const filledDestructive =
  'bg-status-failed text-on-failed hover:opacity-90 active:opacity-80';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** For `destructive` only: the filled look used to confirm in a dialog. */
  filled?: boolean;
  /** Shows that work is in progress and blocks repeat clicks. */
  busy?: boolean;
}

export function Button({
  variant = 'secondary',
  filled = false,
  busy = false,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      data-variant={variant}
      aria-busy={busy || undefined}
      disabled={disabled || busy}
      className={cn(
        'inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-2 rounded-control px-4 py-2 text-body font-semibold',
        'transition-[background-color,opacity,color] duration-150 ease-[cubic-bezier(0.2,0,0,1)]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        variant === 'destructive' && filled
          ? filledDestructive
          : variants[variant],
        className,
      )}
      {...rest}
    >
      {busy && (
        <LoaderCircle
          aria-hidden="true"
          className="size-4 animate-spin motion-reduce:animate-none"
        />
      )}
      {children}
    </button>
  );
}
