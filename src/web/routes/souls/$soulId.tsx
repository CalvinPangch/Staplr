import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { Controller, useForm } from 'react-hook-form';
import {
  soulCreateSchema,
  soulInputSchema,
  type Soul,
  type SoulInput,
} from '../../../shared/schemas/souls';
import type { RoleType } from '../../../shared/status';
import { api, errorMessage } from '../../lib/api';
import { zodResolver } from '../../lib/zodResolver';
import { Button } from '../../components/ui/Button';
import { DataState } from '../../components/ui/DataState';
import { useAnnounce } from '../../components/ui/LiveRegion';
import { Select } from '../../components/ui/Select';
import { TextArea } from '../../components/ui/TextArea';
import { TextField } from '../../components/ui/TextField';
import { newSoulRoles, roleLabels, soulsKey } from '../../features/souls/api';

const blank: SoulInput = {
  name: '',
  roleType: 'developer',
  description: '',
  instructions: '',
};

function Editor({ soul }: { soul: Soul | null }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const announce = useAnnounce();
  const readOnly = soul?.isDefault ?? false;
  const [serverError, setServerError] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SoulInput>({
    resolver: zodResolver(soul ? soulInputSchema : soulCreateSchema),
    defaultValues: soul
      ? {
          name: soul.name,
          roleType: soul.roleType,
          description: soul.description,
          instructions: soul.instructions,
        }
      : blank,
  });

  async function copy() {
    if (!soul) return;
    setServerError(null);
    setCopying(true);
    try {
      const created = await api<Soul>(`/api/souls/${soul.id}/copy`, {
        method: 'POST',
        body: {},
      });
      await queryClient.invalidateQueries({ queryKey: soulsKey });
      announce(`Created ${created.name}. You can edit it now.`);
      await navigate({ to: '/souls/$soulId', params: { soulId: created.id } });
    } catch (failure) {
      setServerError(errorMessage(failure));
    } finally {
      setCopying(false);
    }
  }

  const roleOptions = (soul ? [soul.roleType] : newSoulRoles).map((value) => ({
    value,
    label: roleLabels[value],
  }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1>{soul ? soul.name : 'New soul'}</h1>
        {soul?.isDefault && (
          <span className="rounded-full bg-surface-strong px-2 py-0.5 text-sm">
            Default
          </span>
        )}
      </div>
      {readOnly && (
        <div className="flex flex-col gap-2 rounded-lg border border-edge-soft bg-surface p-3">
          <p>
            Default souls are read-only. Copy this soul to make changes of your
            own.
          </p>
          <div>
            <Button
              variant="primary"
              busy={copying}
              onClick={() => void copy()}
            >
              Copy to customize
            </Button>
          </div>
        </div>
      )}
      {soul && soul.usedByAgents.length > 0 && !readOnly && (
        <div
          role="note"
          className="rounded-lg border border-warning bg-warning-soft p-3 text-warning"
        >
          <p className="font-medium">
            Changes apply to every agent that uses this soul:
          </p>
          <ul className="list-disc pl-6">
            {soul.usedByAgents.map((agent) => (
              <li key={agent.id}>{agent.name}</li>
            ))}
          </ul>
        </div>
      )}
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
        className="flex max-w-3xl flex-col gap-4"
        onSubmit={handleSubmit(async (values) => {
          setServerError(null);
          try {
            const saved = soul
              ? await api<Soul>(`/api/souls/${soul.id}`, {
                  method: 'PUT',
                  body: values,
                })
              : await api<Soul>('/api/souls', { method: 'POST', body: values });
            await queryClient.invalidateQueries({ queryKey: soulsKey });
            announce(`Saved ${saved.name}.`);
            await navigate({ to: '/souls' });
          } catch (error) {
            setServerError(errorMessage(error));
          }
        })}
      >
        <TextField
          label="Name"
          autoComplete="off"
          readOnly={readOnly}
          error={errors.name?.message}
          {...register('name')}
        />
        <Controller
          control={control}
          name="roleType"
          render={({ field }) => (
            <Select
              label="Role"
              value={field.value}
              onValueChange={(value) => field.onChange(value as RoleType)}
              options={roleOptions}
              disabled={readOnly || soul !== null}
              hint={
                soul
                  ? 'The role cannot be changed after a soul is created.'
                  : 'A Project Manager soul can only come from copying the default one.'
              }
              error={errors.roleType?.message}
            />
          )}
        />
        <Controller
          control={control}
          name="description"
          render={({ field }) => (
            <TextArea
              label="Description"
              maxLength={500}
              readOnly={readOnly}
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              name={field.name}
              className="min-h-20"
              error={errors.description?.message}
            />
          )}
        />
        <Controller
          control={control}
          name="instructions"
          render={({ field }) => (
            <TextArea
              label="Working instructions"
              hint="Markdown. Tell the agent how to work, what to check and what never to do."
              maxLength={20000}
              readOnly={readOnly}
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              name={field.name}
              className="min-h-72 font-mono text-sm"
              error={errors.instructions?.message}
            />
          )}
        />
        <div className="flex flex-wrap gap-2">
          {!readOnly && (
            <Button type="submit" variant="primary" busy={isSubmitting}>
              {soul ? 'Save changes' : 'Create soul'}
            </Button>
          )}
          <Link
            to="/souls"
            className="inline-flex min-h-11 items-center rounded-lg border border-edge bg-bg px-4 py-2 hover:bg-surface"
          >
            {readOnly ? 'Back to souls' : 'Cancel'}
          </Link>
        </div>
      </form>
    </div>
  );
}

export function SoulEditorPage() {
  const { soulId } = useParams({ strict: false }) as { soulId: string };
  const creating = soulId === 'new';
  const query = useQuery({
    queryKey: [...soulsKey, soulId],
    queryFn: () => api<Soul>(`/api/souls/${soulId}`),
    enabled: !creating,
    staleTime: 0,
  });
  if (creating) return <Editor key="new" soul={null} />;
  return (
    <DataState
      what="the soul"
      isLoading={query.isPending}
      error={query.error}
      isEmpty={false}
      empty={null}
      onRetry={() => void query.refetch()}
    >
      {/* the form takes its starting values once, so remount it per soul */}
      {query.data && <Editor key={query.data.id} soul={query.data} />}
    </DataState>
  );
}
