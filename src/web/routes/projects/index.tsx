import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import type { Project } from '../../../shared/schemas/projects';
import { Button } from '../../components/ui/Button';
import { DataState } from '../../components/ui/DataState';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { AddProjectWizard } from '../../features/projects/AddProjectWizard';
import { useProjects } from '../../features/projects/api';

function ProjectCard({ project }: { project: Project }) {
  return (
    <li className="resource-card flex flex-col gap-3 rounded-lg border border-edge-soft bg-bg p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="break-all text-lg font-semibold">{project.name}</h2>
        <StatusBadge status={project.readiness} />
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted">Repository</dt>
        <dd className="break-all">{project.repoFullName}</dd>
        <dt className="text-muted">Base branch</dt>
        <dd>{project.baseBranch}</dd>
        <dt className="text-muted">Download</dt>
        <dd>
          <StatusBadge status={project.downloadStatus} />
          {project.downloadStatus === 'downloading' &&
            project.downloadProgress !== null && (
              <span className="ml-2">{project.downloadProgress}%</span>
            )}
        </dd>
      </dl>
      {project.reasons.length > 0 && (
        <ul className="m-0 list-disc pl-6 text-sm">
          {project.reasons.map((reason, index) => (
            <li key={`${reason.code}-${reason.agentId ?? index}`}>
              {reason.message}
            </li>
          ))}
        </ul>
      )}
      <div>
        <Link
          to="/projects/$projectId"
          params={{ projectId: project.id }}
          className="inline-flex min-h-11 items-center rounded-lg border border-edge bg-bg px-4 py-2 hover:bg-surface"
        >
          Open<span className="sr-only"> {project.name}</span>
        </Link>
      </div>
    </li>
  );
}

export function ProjectsPage() {
  const query = useProjects();
  const [adding, setAdding] = useState(false);
  const projects = query.data ?? [];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1>Projects</h1>
        <Button variant="primary" onClick={() => setAdding(true)}>
          Add project
        </Button>
      </div>
      <p className="text-muted">
        A project is a repository downloaded to this installation plus the team
        of agents that will work on it.
      </p>
      <DataState
        what="projects"
        isLoading={query.isPending}
        error={query.error}
        isEmpty={projects.length === 0}
        empty={
          <p>
            No projects yet. Add a project to download a repository and build
            its team.
          </p>
        }
        onRetry={() => void query.refetch()}
      >
        <ul className="resource-grid m-0 list-none p-0">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </ul>
      </DataState>
      <AddProjectWizard open={adding} onOpenChange={setAdding} />
    </div>
  );
}
