import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  permissionLabels,
  type SourceControlConnection,
} from '../../../shared/schemas/source-control';
import { api, errorMessage } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { useAnnounce } from '../../components/ui/LiveRegion';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { connectionsKey, formatTime } from './api';
import { ReplaceTokenDialog } from './ReplaceTokenDialog';

const reasonText = {
  invalid: 'invalid',
  expired: 'expired',
  revoked: 'revoked',
  missing_permission: 'missing permission',
} as const;

const platformName = { github: 'GitHub', gitlab: 'GitLab' } as const;

export function ConnectionCard({
  connection,
}: {
  connection: SourceControlConnection;
}) {
  const queryClient = useQueryClient();
  const announce = useAnnounce();
  const [checking, setChecking] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function checkNow() {
    setError(null);
    setChecking(true);
    try {
      const updated = await api<SourceControlConnection>(
        `/api/source-control-connections/${connection.id}/check`,
        { method: 'POST' },
      );
      queryClient.setQueryData<SourceControlConnection[]>(
        connectionsKey,
        (list) => list?.map((c) => (c.id === updated.id ? updated : c)),
      );
      announce(`${updated.name}: ${updated.lastCheckResult ?? 'checked'}`);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setChecking(false);
    }
  }

  async function remove() {
    setError(null);
    setRemoving(true);
    try {
      await api(`/api/source-control-connections/${connection.id}`, {
        method: 'DELETE',
      });
      await queryClient.invalidateQueries({ queryKey: connectionsKey });
      announce(`Connection ${connection.name} deleted.`);
      setDeleting(false);
    } catch (failure) {
      setDeleting(false);
      setError(errorMessage(failure));
    } finally {
      setRemoving(false);
    }
  }

  return (
    <li
      data-card=""
      className="flex flex-col gap-4 rounded-card border border-separator bg-surface p-4 shadow-card md:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="break-all text-section font-semibold">
          {connection.name}
        </h2>
        <StatusBadge
          status={connection.status}
          reason={
            connection.statusReason
              ? reasonText[connection.statusReason]
              : undefined
          }
        />
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-secondary">
        <dt className="text-muted">Platform</dt>
        <dd>{platformName[connection.platform]}</dd>
        {connection.platform === 'gitlab' && (
          <>
            <dt className="text-muted">Address</dt>
            <dd className="break-all">{connection.baseUrl}</dd>
          </>
        )}
        <dt className="text-muted">Account</dt>
        <dd className="break-all">{connection.accountName}</dd>
        <dt className="text-muted">Token</dt>
        <dd>
          <span aria-label={`ends in ${connection.tokenLast4}`}>
            …{connection.tokenLast4}
          </span>
        </dd>
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
      </dl>
      {connection.lastCheckResult && (
        <p className="text-secondary">{connection.lastCheckResult}</p>
      )}
      {connection.missingPermissions.length > 0 && (
        <div className="text-secondary">
          <p className="font-medium">This token is missing:</p>
          <ul className="list-disc pl-6">
            {connection.missingPermissions.map((id) => (
              <li key={id}>{permissionLabels[id]}</li>
            ))}
          </ul>
        </div>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-card border border-status-failed bg-status-failed-soft p-4 text-secondary text-status-failed"
        >
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button busy={checking} onClick={() => void checkNow()}>
          Check now
        </Button>
        <Button onClick={() => setReplacing(true)}>Replace token</Button>
        <Button variant="destructive" onClick={() => setDeleting(true)}>
          Delete
        </Button>
      </div>
      <ReplaceTokenDialog
        connection={connection}
        open={replacing}
        onOpenChange={setReplacing}
      />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete ${connection.name}?`}
        description="Staplr forgets this token. It is not revoked on the platform; do that there if you no longer want it to work."
        confirmLabel="Delete connection"
        destructive
        busy={removing}
        onConfirm={() => void remove()}
      >
        <p>
          Projects that use it will show Not ready until you connect another
          account.
        </p>
      </ConfirmDialog>
    </li>
  );
}
