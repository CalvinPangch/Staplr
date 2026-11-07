import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

const variants: Record<Variant, string> = {
  primary: 'bg-primary text-primary-fg hover:opacity-90',
  secondary: 'border border-edge bg-bg text-fg hover:bg-surface',
  danger: 'bg-danger text-danger-fg hover:opacity-90',
  ghost: 'text-fg hover:bg-surface',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  /** Shows that work is in progress and blocks repeat clicks. */
  busy?: boolean;
}

export function Button({
  variant = 'secondary',
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
      aria-busy={busy || undefined}
      disabled={disabled || busy}
      className={cn(
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold',
        'disabled:cursor-not-allowed disabled:opacity-60',
        variants[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
