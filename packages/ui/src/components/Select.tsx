import * as RSelect from '@radix-ui/react-select';
import { useId } from 'react';
import { cn, focusRing } from '../cn.js';

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
  disabled?: boolean;
  hint?: string;
}

export function Select({
  label,
  value,
  onValueChange,
  options,
  placeholder = 'Chọn…',
  disabled,
  hint,
}: SelectProps) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label id={`${id}-label`} className="text-sm font-medium text-ink">
        {label}
      </label>
      <RSelect.Root value={value} onValueChange={onValueChange} disabled={disabled}>
        <RSelect.Trigger
          aria-labelledby={`${id}-label`}
          className={cn(
            'inline-flex h-10 items-center justify-between gap-2 rounded-md border border-line bg-bg-deep/60 px-3 text-sm text-ink',
            'hover:border-ink-muted/60 disabled:cursor-not-allowed disabled:opacity-50 data-[placeholder]:text-ink-muted',
            focusRing,
          )}
        >
          <RSelect.Value placeholder={placeholder} />
          <RSelect.Icon aria-hidden className="text-ink-muted">
            ▾
          </RSelect.Icon>
        </RSelect.Trigger>
        <RSelect.Portal>
          <RSelect.Content
            position="popper"
            sideOffset={6}
            className="z-50 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-md border border-line bg-surface shadow-deep"
          >
            <RSelect.Viewport className="p-1">
              {options.map((o) => (
                <RSelect.Item
                  key={o.value}
                  value={o.value}
                  disabled={o.disabled}
                  className="relative flex h-9 cursor-pointer select-none items-center rounded-sm px-3 pl-7 text-sm text-ink outline-none data-[disabled]:cursor-not-allowed data-[highlighted]:bg-accent/15 data-[disabled]:opacity-50"
                >
                  <RSelect.ItemIndicator className="absolute left-2 text-accent">✓</RSelect.ItemIndicator>
                  <RSelect.ItemText>{o.label}</RSelect.ItemText>
                </RSelect.Item>
              ))}
            </RSelect.Viewport>
          </RSelect.Content>
        </RSelect.Portal>
      </RSelect.Root>
      {hint && <p className="text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}
