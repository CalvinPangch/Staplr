import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import type { SourceControlConnection } from '../../../shared/schemas/source-control';
import { api, errorMessage } from '../../lib/api';
import { zodResolver } from '../../lib/zodResolver';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { useAnnounce } from '../../components/ui/LiveRegion';
import { TextField } from '../../components/ui/TextField';
import { connectionsKey } from './api';

const schema = z.object({
  token: z
    .string()
    .min(1, 'Enter the new access token.')
    .max(4096, 'This token is too long.'),
});
type Values = z.infer<typeof schema>;

export function ReplaceTokenDialog({
  connection,
  open,
  onOpenChange,
}: {
  connection: SourceControlConnection;
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
    resolver: zodResolver(schema),
    defaultValues: { token: '' },
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
      title="Replace the access token"
      description={`The new token is checked before it replaces the one saved for ${connection.name}. If it is rejected, the current token stays in place.`}
    >
      {serverError && (
        <p
          role="alert"
          className="rounded-lg border border-danger bg-danger-soft p-3 text-danger"
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
            await api(`/api/source-control-connections/${connection.id}`, {
              method: 'PATCH',
              body: { token: values.token },
            });
            await queryClient.invalidateQueries({ queryKey: connectionsKey });
            announce(`Token replaced for ${connection.name}.`);
            close(false);
          } catch (error) {
            setServerError(errorMessage(error));
          }
        })}
      >
        <TextField
          label="New access token"
          type="password"
          autoComplete="off"
          error={errors.token?.message}
          {...register('token')}
        />
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" busy={isSubmitting}>
            Replace token
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
