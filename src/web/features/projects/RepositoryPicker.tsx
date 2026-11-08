import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { Repository } from '../../../shared/schemas/projects';
import { Combobox } from '../../components/ui/Combobox';
import { Select } from '../../components/ui/Select';
import { useConnections } from '../source-control/api';
import { fetchRepositories } from './api';

export interface PickedRepository {
  connectionId: string;
  repository: Repository;
}

/**
 * Two steps in one control: choose a source control connection, then search
 * the repositories it can push to. Used to add a project and to relink one.
 */
export function RepositoryPicker({
  onPick,
  initialConnectionId = '',
}: {
  onPick: (picked: PickedRepository | null) => void;
  initialConnectionId?: string;
}) {
  const connections = useConnections();
  const [connectionId, setConnectionId] = useState(initialConnectionId);
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');

  // Wait for a pause in typing before asking the platform.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(input.trim()), 250);
    return () => clearTimeout(timer);
  }, [input]);

  const usable = (connections.data ?? []).filter(
    (c) => c.status === 'connected',
  );
  const repositories = useQuery({
    queryKey: ['repositories', connectionId, search],
    queryFn: () => fetchRepositories(connectionId, search),
    enabled: connectionId !== '',
    staleTime: 30_000,
  });

  return (
    <div className="flex flex-col gap-4">
      <Select
        label="Source control connection"
        value={connectionId === '' ? undefined : connectionId}
        onValueChange={(value) => {
          setConnectionId(value);
          setInput('');
          onPick(null);
        }}
        options={usable.map((c) => ({
          value: c.id,
          label: `${c.name} (${c.accountName})`,
        }))}
        placeholder={
          usable.length === 0
            ? 'No connected source control connection'
            : 'Choose a connection'
        }
        hint="Only connections that are Connected can be used."
      />
      {connections.isSuccess && usable.length === 0 && (
        <p className="text-sm">
          Add a GitHub or GitLab token first.{' '}
          <Link to="/settings/source-control" className="underline">
            Open Source control
          </Link>
        </p>
      )}
      {connectionId !== '' && (
        <>
          <Combobox
            label="Repository"
            inputValue={input}
            onInputChange={setInput}
            options={(repositories.data ?? []).map((r) => ({
              value: r.remoteId,
              label: r.fullName,
              description: r.private ? 'Private' : 'Public',
            }))}
            loading={repositories.isFetching}
            emptyMessage="No repositories found. Only repositories this connection can push to are listed: check the search, or give the token read and write access to the repository."
            hint="Type to search. Only repositories this connection can push to are listed."
            onSelect={(option) => {
              const repository = repositories.data?.find(
                (r) => r.remoteId === option.value,
              );
              if (repository) {
                setInput(repository.fullName);
                onPick({ connectionId, repository });
              }
            }}
            error={
              repositories.isError
                ? 'Could not load repositories. Check the connection and try again.'
                : undefined
            }
          />
        </>
      )}
    </div>
  );
}
