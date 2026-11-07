import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type { Project } from '../../../shared/schemas/projects';
import { api, errorMessage } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { useAnnounce } from '../../components/ui/LiveRegion';
import { TextField } from '../../components/ui/TextField';
import { projectsKey } from './api';
import { RepositoryPicker, type PickedRepository } from './RepositoryPicker';

type Step = 'repository' | 'confirm';

/** Choose a repository, then confirm the name; the download starts on Add. */
export function AddProjectWizard({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const announce = useAnnounce();
  const [step, setStep] = useState<Step>('repository');
  const [picked, setPicked] = useState<PickedRepository | null>(null);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | undefined>();
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function close(next: boolean) {
    if (!next) {
      setStep('repository');
      setPicked(null);
      setName('');
      setNameError(undefined);
      setServerError(null);
    }
    onOpenChange(next);
  }

  async function add() {
    if (!picked) return;
    const trimmed = name.trim();
    if (trimmed.length < 1 || trimmed.length > 80) {
      setNameError('Enter a name of 1 to 80 characters.');
      return;
    }
    setNameError(undefined);
    setServerError(null);
    setBusy(true);
    try {
      const project = await api<Project>('/api/projects', {
        method: 'POST',
        body: {
          sourceControlConnectionId: picked.connectionId,
          repoRemoteId: picked.repository.remoteId,
          name: trimmed,
        },
      });
      await queryClient.invalidateQueries({ queryKey: projectsKey });
      announce(`Added ${project.name}. Downloading the repository.`);
      close(false);
      await navigate({
        to: '/projects/$projectId',
        params: { projectId: project.id },
      });
    } catch (error) {
      setServerError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={close}
      title="Add a project"
      description={
        step === 'repository'
          ? 'Step 1 of 2: choose a connection and the repository to work on.'
          : 'Step 2 of 2: confirm. The repository is downloaded to this installation.'
      }
    >
      {serverError && (
        <p
          role="alert"
          className="rounded-lg border border-danger bg-danger-soft p-3 text-danger"
        >
          {serverError}
        </p>
      )}
      {step === 'repository' ? (
        <>
          <RepositoryPicker
            onPick={(next) => {
              setPicked(next);
              if (next)
                setName(
                  next.repository.fullName.split('/').pop() ??
                    next.repository.fullName,
                );
            }}
          />
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => close(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={picked === null}
              onClick={() => setStep('confirm')}
            >
              Next
            </Button>
          </div>
        </>
      ) : (
        <>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted">Repository</dt>
            <dd className="break-all">{picked?.repository.fullName}</dd>
            <dt className="text-muted">Base branch</dt>
            <dd>
              {picked?.repository.defaultBranch} (you can change it later)
            </dd>
          </dl>
          <TextField
            label="Project name"
            autoComplete="off"
            value={name}
            onChange={(event) => setName(event.target.value)}
            error={nameError}
          />
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => setStep('repository')}>
              Back
            </Button>
            <Button variant="primary" busy={busy} onClick={() => void add()}>
              Add project
            </Button>
          </div>
        </>
      )}
    </Dialog>
  );
}
