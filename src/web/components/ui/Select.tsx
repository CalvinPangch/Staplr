import { useId } from 'react';
import * as RadixSelect from '@radix-ui/react-select';
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
      <label htmlFor={id} className="text-sm font-medium">
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
            'flex min-h-11 items-center justify-between gap-2 rounded-lg border bg-bg px-3 py-2 text-left text-fg',
            'disabled:cursor-not-allowed disabled:opacity-60',
            error ? 'border-danger' : 'border-edge',
          )}
        >
          <RadixSelect.Value placeholder={placeholder} />
          <span aria-hidden="true">▾</span>
        </RadixSelect.Trigger>
        <RadixSelect.Portal>
          <RadixSelect.Content
            position="popper"
            sideOffset={4}
            className="z-50 max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-y-auto rounded-lg border border-edge bg-bg p-1 shadow-lg"
          >
            <RadixSelect.Viewport>
              {options.map((option) => (
                <RadixSelect.Item
                  key={option.value}
                  value={option.value}
                  disabled={option.disabled ?? false}
                  className="flex min-h-11 cursor-pointer items-center gap-2 rounded px-3 py-2 text-fg data-[disabled]:cursor-not-allowed data-[disabled]:opacity-60 data-[highlighted]:bg-surface-strong"
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
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
