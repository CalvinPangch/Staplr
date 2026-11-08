import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import type { ProviderConnection } from '../../../shared/schemas/providers';
import { api, errorMessage } from '../../lib/api';
import { zodResolver } from '../../lib/zodResolver';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Dialog } from '../../components/ui/Dialog';
import { useAnnounce } from '../../components/ui/LiveRegion';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { TextField } from '../../components/ui/TextField';
import { formatTime } from '../source-control/api';
import { fetchModels, modelsKey } from '../agents/api';
import { ApiKeyDialog } from './ApiKeyDialog';
import {
  authLabel,
  providerName,
  providersKey,
  startCodexLogin,
  type Impact,
} from './api';

const renameSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Enter a name of 1 to 80 characters.')
    .max(80, 'Enter a name of 1 to 80 characters.'),
});

function RenameDialog({
  connection,
  open,
  onOpenChange,
}: {
  connection: ProviderConnection;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const announce = useAnnounce();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<{ name: string }>({
    resolver: zodResolver(renameSchema),
    defaultValues: { name: connection.name },
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setServerError(null);
        onOpenChange(next);
      }}
      title="Rename connection"
      description="Agents keep using this connection under its new name."
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
            await api(`/api/provider-connections/${connection.id}`, {
              method: 'PATCH',
              body: { name: values.name },
            });
            await queryClient.invalidateQueries({ queryKey: providersKey });
            announce(`Connection renamed to ${values.name}.`);
            onOpenChange(false);
          } catch (error) {
            setServerError(errorMessage(error));
          }
        })}
      >
        <TextField
          label="Connection name"
          autoComplete="off"
          error={errors.name?.message}
          {...register('name')}
        />
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" busy={isSubmitting}>
            Save name
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/** What model discovery found for a Codex login (feature 002). */
function DiscoveryStatus({ connection }: { connection: ProviderConnection }) {
  const announce = useAnnounce();
  const status = connection.discoveryStatus;
  const models = useQuery({
    queryKey: [...modelsKey(connection.id), connection.modelsRefreshedAt],
    queryFn: () => fetchModels(connection.id),
    enabled: status === 'finished',
  });
  const available =
    models.data?.models.filter((m) => m.availability === 'available').length ??
    null;
  let text: string | null = null;
  if (status === 'running') text = 'Discovering models…';
  else if (status === 'failed') text = connection.discoveryError;
  else if (status === 'finished' && available !== null)
    text =
      available === 0
        ? 'This account has no Codex models available'
        : `${available} ${available === 1 ? 'model' : 'models'} available`;
  const last = useRef(status);
  useEffect(() => {
    if (last.current === 'running' && status !== 'running' && text)
      announce(`${connection.name}: ${text}`);
    // wait for the model count before leaving "running", so the answer is announced
    if (status === 'running' || text !== null) last.current = status;
  }, [status, text, announce, connection.name]);
  if (status === 'not_started' || !text) return null;
  return (
    <p
      className={
        status === 'failed'
          ? 'rounded-lg border border-warning bg-warning-soft p-3 text-sm text-warning'
          : 'text-sm'
      }
    >
      {text}
      {status === 'finished' && connection.modelsRefreshedAt && (
        <>
          {' · found '}
          <time dateTime={connection.modelsRefreshedAt}>
            {formatTime(connection.modelsRefreshedAt)}
          </time>
        </>
      )}
    </p>
  );
}

export function ProviderCard({
  connection,
}: {
  connection: ProviderConnection;
}) {
  const queryClient = useQueryClient();
  const announce = useAnnounce();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replacing, setReplacing] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [startingLogin, setStartingLogin] = useState(false);
  const [impact, setImpact] = useState<Impact | null>(null);
  const [impactError, setImpactError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [removing, setRemoving] = useState(false);
  const needsFix = connection.status === 'needs_relogin';
  const isClaude = connection.provider === 'claude';

  async function checkNow() {
    setError(null);
    setChecking(true);
    try {
      const updated = await api<ProviderConnection>(
        `/api/provider-connections/${connection.id}/check`,
        { method: 'POST' },
      );
      queryClient.setQueryData<ProviderConnection[]>(providersKey, (list) =>
        list?.map((c) => (c.id === updated.id ? updated : c)),
      );
      announce(`${updated.name}: ${updated.lastCheckResult ?? 'checked'}`);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setChecking(false);
    }
  }

  async function relogin() {
    setError(null);
    setStartingLogin(true);
    try {
      const session = await startCodexLogin({ reloginOf: connection.id });
      await navigate({
        to: '/settings/providers/login/$sessionId',
        params: { sessionId: session.id },
      });
    } catch (failure) {
      setError(errorMessage(failure));
      setStartingLogin(false);
    }
  }

  async function askToDisconnect() {
    setImpactError(null);
    setImpact(null);
    setDeleting(true);
    try {
      setImpact(
        await api<Impact>(`/api/provider-connections/${connection.id}/impact`),
      );
    } catch (failure) {
      setImpactError(errorMessage(failure));
    }
  }

  async function remove() {
    setRemoving(true);
    try {
      await api(`/api/provider-connections/${connection.id}`, {
        method: 'DELETE',
      });
      await queryClient.invalidateQueries({ queryKey: providersKey });
      announce(`Connection ${connection.name} disconnected.`);
      setDeleting(false);
    } catch (failure) {
      setDeleting(false);
      setError(errorMessage(failure));
    } finally {
      setRemoving(false);
    }
  }

  const affected = impact ? impact.agents.length + impact.projects.length : 0;

  return (
    <li className="flex flex-col gap-3 rounded-lg border border-edge-soft bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="break-all text-lg font-semibold">{connection.name}</h2>
        <StatusBadge status={connection.status} />
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted">Provider</dt>
        <dd>{providerName[connection.provider]}</dd>
        <dt className="text-muted">Sign-in</dt>
        <dd>{authLabel[connection.authType]}</dd>
        <dt className="text-muted">Last checked</dt>
        <dd>
          {connection.lastCheckedAt ? (
            <time dateTime={connection.lastCheckedAt}>
              {formatTime(connection.lastCheckedAt)}
            </time>
          ) : (
            'Never'
          )}
        </dd>
        {connection.credentialExpiresAt && (
          <>
            <dt className="text-muted">Login expires</dt>
            <dd>
              <time dateTime={connection.credentialExpiresAt}>
                {formatTime(connection.credentialExpiresAt)}
              </time>
            </dd>
          </>
        )}
      </dl>
      {connection.lastCheckResult && (
        <p className="text-sm">{connection.lastCheckResult}</p>
      )}
      {!isClaude && <DiscoveryStatus connection={connection} />}
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-danger bg-danger-soft p-3 text-sm text-danger"
        >
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button busy={checking} onClick={() => void checkNow()}>
          Check now
        </Button>
        {isClaude ? (
          <Button
            variant={needsFix ? 'primary' : 'secondary'}
            onClick={() => setReplacing(true)}
          >
            Replace API key
          </Button>
        ) : (
          <Button
            variant={needsFix ? 'primary' : 'secondary'}
            busy={startingLogin}
            onClick={() => void relogin()}
          >
            Re-login
          </Button>
        )}
        <Button onClick={() => setRenaming(true)}>Rename</Button>
        <Button variant="danger" onClick={() => void askToDisconnect()}>
          Disconnect
        </Button>
      </div>
      {isClaude && (
        <ApiKeyDialog
          connection={connection}
          open={replacing}
          onOpenChange={setReplacing}
        />
      )}
      {renaming && (
        <RenameDialog
          connection={connection}
          open={renaming}
          onOpenChange={setRenaming}
        />
      )}
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Disconnect ${connection.name}?`}
        description="Staplr forgets this connection and its stored credential. Nothing is revoked at the provider; do that there if you no longer want it to work."
        confirmLabel="Disconnect"
        destructive
        busy={removing}
        onConfirm={() => void remove()}
      >
        {impactError && (
          <p role="alert" className="text-danger">
            {impactError}
          </p>
        )}
        {!impact && !impactError && <p>Checking what depends on it…</p>}
        {impact && affected === 0 && (
          <p>No agents or projects use this connection.</p>
        )}
        {impact && affected > 0 && (
          <div className="flex flex-col gap-2">
            {impact.agents.length > 0 && (
              <div>
                <p className="font-medium">Agents that will stop working:</p>
                <ul className="list-disc pl-6">
                  {impact.agents.map((a) => (
                    <li key={a.id}>{a.name}</li>
                  ))}
                </ul>
              </div>
            )}
            {impact.projects.length > 0 && (
              <div>
                <p className="font-medium">
                  Projects that will show Not ready:
                </p>
                <ul className="list-disc pl-6">
                  {impact.projects.map((p) => (
                    <li key={p.id}>{p.name}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </ConfirmDialog>
    </li>
  );
}
