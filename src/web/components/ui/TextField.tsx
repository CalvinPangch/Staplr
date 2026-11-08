import { useId, type InputHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  /** Specific message shown next to the field; sets aria-invalid. */
  error?: string | undefined;
}

export function TextField({
  label,
  hint,
  error,
  id,
  className,
  ...rest
}: TextFieldProps) {
  const auto = useId();
  const inputId = id ?? auto;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const describedBy =
    [hint ? hintId : '', error ? errorId : ''].filter(Boolean).join(' ') ||
    undefined;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={inputId} className="text-secondary font-medium">
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          'min-h-11 rounded-control border bg-surface px-3 py-2 text-fg',
          error ? 'border-status-failed' : 'border-control',
          className,
        )}
        {...rest}
      />
      {hint && (
        <p id={hintId} className="text-secondary text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p
          id={errorId}
          className="text-secondary font-medium text-status-failed"
        >
          {error}
        </p>
      )}
    </div>
  );
}
