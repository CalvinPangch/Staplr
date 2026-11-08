import { useId } from 'react';
import * as RadixSelect from '@radix-ui/react-select';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/cn';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps {
  label: string;
  value: string | undefined;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  hint?: string;
  error?: string | undefined;
  disabled?: boolean;
}

export function Select({
  label,
  value,
  onValueChange,
  options,
  placeholder = 'Choose an option',
  hint,
  error,
  disabled,
}: SelectProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy =
    [hint ? hintId : '', error ? errorId : ''].filter(Boolean).join(' ') ||
    undefined;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-secondary font-medium">
        {label}
      </label>
      <RadixSelect.Root
        value={value ?? ''}
        onValueChange={onValueChange}
        disabled={disabled ?? false}
      >
        <RadixSelect.Trigger
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            'flex min-h-11 items-center justify-between gap-2 rounded-control border bg-surface px-3 py-2 text-left text-fg',
            'disabled:cursor-not-allowed disabled:opacity-60',
            error ? 'border-status-failed' : 'border-control',
          )}
        >
          <RadixSelect.Value placeholder={placeholder} />
          <ChevronDown aria-hidden="true" className="size-4 text-muted" />
        </RadixSelect.Trigger>
        <RadixSelect.Portal>
          <RadixSelect.Content
            position="popper"
            sideOffset={4}
            className="z-50 max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-y-auto rounded-card border border-separator bg-surface-raised p-1 shadow-card"
          >
            <RadixSelect.Viewport>
              {options.map((option) => (
                <RadixSelect.Item
                  key={option.value}
                  value={option.value}
                  disabled={option.disabled ?? false}
                  className="flex min-h-11 cursor-pointer items-center gap-2 rounded-control px-3 py-2 text-fg data-[disabled]:cursor-not-allowed data-[disabled]:opacity-60 data-[highlighted]:bg-accent-soft"
                >
                  <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
                  <RadixSelect.ItemIndicator aria-hidden="true">
                    ✓
                  </RadixSelect.ItemIndicator>
                </RadixSelect.Item>
              ))}
            </RadixSelect.Viewport>
          </RadixSelect.Content>
        </RadixSelect.Portal>
      </RadixSelect.Root>
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
