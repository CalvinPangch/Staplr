import { useId, type TextareaHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export interface TextAreaProps extends Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  'value'
> {
  label: string;
  /** Controlled value; needed for the character counter. */
  value: string;
  maxLength: number;
  hint?: string;
  error?: string | undefined;
}

export function TextArea({
  label,
  value,
  maxLength,
  hint,
  error,
  id,
  className,
  ...rest
}: TextAreaProps) {
  const auto = useId();
  const areaId = id ?? auto;
  const hintId = `${areaId}-hint`;
  const errorId = `${areaId}-error`;
  const countId = `${areaId}-count`;
  const describedBy = [hint ? hintId : '', error ? errorId : '', countId]
    .filter(Boolean)
    .join(' ');
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={areaId} className="text-secondary font-medium">
        {label}
      </label>
      <textarea
        id={areaId}
        value={value}
        maxLength={maxLength}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          'min-h-28 rounded-control border bg-surface px-3 py-2 text-fg',
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
      <p id={countId} className="text-secondary text-muted">
        {value.length} of {maxLength} characters
      </p>
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
