import { useId, useState, type KeyboardEvent } from 'react';
import { cn } from '../../lib/cn';

export interface ComboboxOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

export interface ComboboxProps {
  label: string;
  inputValue: string;
  onInputChange: (value: string) => void;
  options: ComboboxOption[];
  onSelect: (option: ComboboxOption) => void;
  loading?: boolean;
  /** Shown when the search returned nothing; should say how to fix it. */
  emptyMessage: string;
  hint?: string;
  error?: string | undefined;
}

/** WAI-ARIA 1.2 editable combobox with a list of suggestions. */
export function Combobox({
  label,
  inputValue,
  onInputChange,
  options,
  onSelect,
  loading = false,
  emptyMessage,
  hint,
  error,
}: ComboboxProps) {
  const id = useId();
  const listId = `${id}-list`;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const optionId = (index: number) => `${id}-option-${index}`;
  const enabled = options.filter((o) => !o.disabled);

  function choose(option: ComboboxOption | undefined) {
    if (!option || option.disabled) return;
    onSelect(option);
    setOpen(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, options.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (event.key === 'Enter' && open) {
      event.preventDefault();
      choose(options[active]);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  }

  const describedBy =
    [hint ? hintId : '', error ? errorId : ''].filter(Boolean).join(' ') ||
    undefined;
  const status = loading
    ? 'Loading results'
    : options.length === 0
      ? emptyMessage
      : `${enabled.length} results available`;

  return (
    <div className="relative flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={
          open && options.length > 0 ? optionId(active) : undefined
        }
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        autoComplete="off"
        value={inputValue}
        onChange={(event) => {
          onInputChange(event.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        className={cn(
          'min-h-11 rounded-lg border bg-bg px-3 py-2 text-fg',
          error ? 'border-danger' : 'border-edge',
        )}
      />
      <ul
        id={listId}
        role="listbox"
        aria-label={label}
        hidden={!open}
        className="absolute top-full z-40 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-edge bg-bg p-1 shadow-lg"
      >
        {options.map((option, index) => (
          <li
            key={option.value}
            id={optionId(index)}
            role="option"
            tabIndex={-1}
            aria-selected={index === active}
            aria-disabled={option.disabled || undefined}
            // mousedown keeps focus in the input so blur does not close the list first
            onMouseDown={(event) => {
              event.preventDefault();
              choose(option);
            }}
            className={cn(
              'flex min-h-11 cursor-pointer flex-col justify-center rounded px-3 py-2',
              index === active && 'bg-surface-strong',
              option.disabled && 'cursor-not-allowed opacity-60',
            )}
          >
            <span>{option.label}</span>
            {option.description && (
              <span className="text-sm text-muted">{option.description}</span>
            )}
          </li>
        ))}
      </ul>
      <p role="status" className="text-sm text-muted">
        {status}
      </p>
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
