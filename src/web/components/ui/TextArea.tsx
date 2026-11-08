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
      <label htmlFor={areaId} className="text-sm font-medium">
        {label}
      </label>
      <textarea
        id={areaId}
        value={value}
        maxLength={maxLength}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          'min-h-28 rounded-lg border bg-bg px-3 py-2 text-fg',
          error ? 'border-danger' : 'border-edge',
          className,
        )}
        {...rest}
      />
      {hint && (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      )}
      <p id={countId} className="text-sm text-muted">
        {value.length} of {maxLength} characters
      </p>
      {error && (
        <p id={errorId} className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
