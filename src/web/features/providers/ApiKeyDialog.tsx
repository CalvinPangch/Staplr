import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import type { ProviderConnection } from '../../../shared/schemas/providers';
import { api, errorMessage } from '../../lib/api';
import { zodResolver } from '../../lib/zodResolver';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { useAnnounce } from '../../components/ui/LiveRegion';
import { TextField } from '../../components/ui/TextField';
import { providersKey } from './api';

const apiKey = z
  .string()
  .min(1, 'Enter the API key.')
  .max(4096, 'This API key is too long.');
const name = z
  .string()
  .trim()
  .min(1, 'Enter a name of 1 to 80 characters.')
  .max(80, 'Enter a name of 1 to 80 characters.');
const createSchema = z.object({ name, apiKey });
const replaceSchema = z.object({ name: z.string(), apiKey });
type Values = z.infer<typeof createSchema>;

export const billingNotice =
  'Claude usage is billed to the owner of this API key, directly by Anthropic. Staplr does not resell usage and never asks for Claude.ai subscription credentials. The key is checked with Anthropic, then stored encrypted and never shown again.';

/** Add a Claude connection (no `connection`) or replace its key. */
export function ApiKeyDialog({
  connection,
  open,
  onOpenChange,
}: {
  connection?: ProviderConnection;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const announce = useAnnounce();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(connection ? replaceSchema : createSchema),
    defaultValues: { name: '', apiKey: '' },
  });

  function close(next: boolean) {
    if (!next) {
      reset();
      setServerError(null);
    }
    onOpenChange(next);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={close}
      title={connection ? 'Replace the API key' : 'Add a Claude connection'}
      description={
        connection
          ? `The new key is checked before it replaces the one saved for ${connection.name}. If it is rejected, the current key stays in place.`
          : billingNotice
      }
    >
      {connection && (
        <p className="text-secondary text-muted">{billingNotice}</p>
      )}
      {serverError && (
        <p
          role="alert"
          className="rounded-card border border-status-failed bg-status-failed-soft p-4 text-status-failed"
        >
          {serverError}
        </p>
      )}
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={handleSubmit(async (values) => {
          setServerError(null);
          try {
            if (connection)
              await api(`/api/provider-connections/${connection.id}/api-key`, {
                method: 'PUT',
                body: { apiKey: values.apiKey },
              });
            else
              await api('/api/provider-connections', {
                method: 'POST',
                body: {
                  provider: 'claude',
                  authType: 'api_key',
                  name: values.name,
                  apiKey: values.apiKey,
                },
              });
            await queryClient.invalidateQueries({ queryKey: providersKey });
            announce(
              connection
                ? `API key replaced for ${connection.name}.`
                : 'Claude connection added.',
            );
            close(false);
          } catch (error) {
            setServerError(errorMessage(error));
          }
        })}
      >
        {!connection && (
          <TextField
            label="Connection name"
            autoComplete="off"
            error={errors.name?.message}
            {...register('name')}
          />
        )}
        <TextField
          label="Anthropic API key"
          type="password"
          autoComplete="off"
          error={errors.apiKey?.message}
          {...register('apiKey')}
        />
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" busy={isSubmitting}>
            {connection ? 'Replace API key' : 'Add connection'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
