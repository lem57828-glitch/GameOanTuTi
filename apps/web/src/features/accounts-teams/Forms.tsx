import { type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Alert, Button, Input } from '@arena/ui';
import { ApiError } from '../../lib/api';

export interface Field {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  maxLength?: number;
  minLength?: number;
  value?: string;
  options?: { value: string; label: string }[];
  multiline?: boolean;
}
export function ErrorMessage({ error }: { error: Error | null }) {
  if (!error) return null;
  const details =
    error instanceof ApiError && Array.isArray(error.details)
      ? error.details.map((i: { message: string }) => i.message).join(' ')
      : '';
  return (
    <Alert tone="error" title="Không thể thực hiện">
      {details || error.message}
    </Alert>
  );
}
export function ActionForm({
  fields,
  submit,
  onSubmit,
  onDone,
  success,
  disabled = false,
}: {
  fields: Field[];
  submit: string;
  onSubmit: (values: Record<string, string>) => Promise<unknown>;
  onDone?: () => void | Promise<void>;
  success?: string;
  disabled?: boolean;
}) {
  const action = useMutation({
    mutationFn: onSubmit,
    onSuccess: async () => {
      await onDone?.();
    },
  });
  function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    action.mutate(Object.fromEntries(new FormData(event.currentTarget).entries()) as Record<string, string>);
  }
  return (
    <form className="flex flex-col gap-4" onSubmit={send}>
      {fields.map((f) =>
        f.options ? (
          <label key={f.name} className="flex flex-col gap-2 text-sm">
            {f.label}
            <select
              name={f.name}
              defaultValue={f.value}
              required={f.required !== false}
              className="h-10 rounded-md border border-line bg-bg-deep px-3"
            >
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        ) : f.multiline ? (
          <label key={f.name} className="flex flex-col gap-2 text-sm">
            {f.label}
            <textarea
              name={f.name}
              defaultValue={f.value}
              required={f.required !== false}
              maxLength={f.maxLength}
              rows={7}
              className="rounded-md border border-line bg-bg-deep p-3"
            />
          </label>
        ) : (
          <Input
            key={f.name}
            label={f.label}
            name={f.name}
            type={f.type ?? 'text'}
            defaultValue={f.value}
            required={f.required !== false}
            minLength={f.minLength}
            maxLength={f.maxLength}
            autoComplete={f.type === 'password' ? 'new-password' : undefined}
          />
        ),
      )}
      <ErrorMessage error={action.error} />
      {action.isSuccess && success && <Alert tone="success" title={success} />}
      <Button type="submit" loading={action.isPending} disabled={disabled || action.isPending}>
        {submit}
      </Button>
    </form>
  );
}
export function ActionButton({
  children,
  run,
  onDone,
  confirm,
  disabled,
}: {
  children: string;
  run: () => Promise<unknown>;
  onDone?: () => void | Promise<void>;
  confirm?: string;
  disabled?: boolean;
}) {
  const action = useMutation({
    mutationFn: run,
    onSuccess: async () => {
      await onDone?.();
    },
  });
  return (
    <div className="flex flex-col gap-2">
      <Button
        size="sm"
        variant="secondary"
        disabled={disabled || action.isPending}
        loading={action.isPending}
        onClick={() => {
          if (!confirm || window.confirm(confirm)) action.mutate();
        }}
      >
        {children}
      </Button>
      <ErrorMessage error={action.error} />
      {action.isSuccess && (
        <p role="status" className="text-xs text-success">
          Đã thực hiện.
        </p>
      )}
    </div>
  );
}
