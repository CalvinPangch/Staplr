import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useForm, useWatch } from 'react-hook-form';
import {
  permissionIds,
  permissionLabels,
  sourceControlCreateSchema,
  type SourceControlCreate,
} from '../../../shared/schemas/source-control';
import { ApiError, api, errorMessage } from '../../lib/api';
import { zodResolver } from '../../lib/zodResolver';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { useAnnounce } from '../../components/ui/LiveRegion';
import { Select } from '../../components/ui/Select';
import { TextField } from '../../components/ui/TextField';
import { connectionsKey } from './api';

export function AddConnectionDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const announce = useAnnounce();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    control,
    setValue,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<SourceControlCreate>({
    resolver: zodResolver(sourceControlCreateSchema),
    defaultValues: { name: '', platform: 'github', baseUrl: '', token: '' },
  });
  const platform = useWatch({ control, name: 'platform' });

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
      title="Add a source control connection"
      description="Agents use this token to read your repositories and propose changes."
    >
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
          const body: SourceControlCreate = {
            name: values.name,
            platform: values.platform,
            token: values.token,
            ...(values.platform === 'gitlab' && values.baseUrl
              ? { baseUrl: values.baseUrl }
              : {}),
          };
          try {
            await api('/api/source-control-connections', {
              method: 'POST',
              body,
            });
            await queryClient.invalidateQueries({ queryKey: connectionsKey });
            announce(`Connection ${values.name} added.`);
            close(false);
          } catch (error) {
            if (error instanceof ApiError && error.code === 'conflict')
              setError('name', { type: 'server', message: error.message });
            else setServerError(errorMessage(error));
          }
        })}
      >
        <Select
          label="Platform"
          value={platform}
          onValueChange={(value) =>
            setValue('platform', value as SourceControlCreate['platform'])
          }
          options={[
            { value: 'github', label: 'GitHub' },
            { value: 'gitlab', label: 'GitLab' },
          ]}
        />
        <TextField
          label="Name"
          hint="A label to tell connections apart, for example “work GitHub”."
          error={errors.name?.message}
          {...register('name')}
        />
        {platform === 'gitlab' && (
          <TextField
            label="GitLab address"
            hint="Leave empty for gitlab.com. A self-hosted instance needs an https:// address."
            placeholder="https://gitlab.example.com"
            error={errors.baseUrl?.message}
            {...register('baseUrl')}
          />
        )}
        <TextField
          label="Access token"
          type="password"
          autoComplete="off"
          hint={`The token needs permission to: ${permissionIds
            .map((id) => permissionLabels[id])
            .join(', ')}.`}
          error={errors.token?.message}
          {...register('token')}
        />
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" busy={isSubmitting}>
            Add connection
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
