import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ChevronRight } from 'lucide-react';
import type { Project } from '../../../shared/schemas/projects';
import { Button } from '../../components/ui/Button';
import { Card, CardRow } from '../../components/ui/Card';
import { DataState } from '../../components/ui/DataState';
import { PageBody, PageHeader } from '../../components/ui/PageHeader';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { AddProjectWizard } from '../../features/projects/AddProjectWizard';
import { useProjects } from '../../features/projects/api';

function ProjectCard({ project }: { project: Project }) {
  return (
    <Card as="li">
      <CardRow
        title={project.name}
        href={`/projects/${project.id}`}
        details={
          <span className="flex flex-wrap items-center gap-2">
            <span className="break-all">
              {project.repoFullName} · {project.baseBranch}
            </span>
            <StatusBadge status={project.downloadStatus} />
            {project.downloadStatus === 'downloading' &&
              project.downloadProgress !== null && (
                <span>{project.downloadProgress}%</span>
              )}
          </span>
        }
        status={<StatusBadge status={project.readiness} />}
        reason={project.reasons.map((reason) => reason.message).join(' ')}
        actions={
          <Link
            to="/projects/$projectId"
            params={{ projectId: project.id }}
            className="inline-flex min-h-11 items-center gap-1 rounded-control px-3 font-semibold text-accent hover:bg-accent-soft"
          >
            Open<span className="sr-only"> {project.name}</span>
            <ChevronRight aria-hidden="true" className="size-4" />
          </Link>
        }
      />
    </Card>
  );
}

export function ProjectsPage() {
  const query = useProjects();
  const [adding, setAdding] = useState(false);
  const projects = query.data ?? [];
  return (
    <>
      <PageHeader
        title="Projects"
        description="Repositories downloaded to this installation, each with its own team of agents."
        action={
          <Button variant="primary" onClick={() => setAdding(true)}>
            Add project
          </Button>
        }
      />
      <PageBody>
        <DataState
          what="projects"
          isLoading={query.isPending}
          error={query.error}
          isEmpty={projects.length === 0}
          empty={
            <>
              <p>
                No projects yet. Add a project to download a repository and
                build its team.
              </p>
              <Button variant="primary" onClick={() => setAdding(true)}>
                Add your first project
              </Button>
            </>
          }
          onRetry={() => void query.refetch()}
        >
          <ul className="m-0 grid list-none gap-4 p-0 lg:grid-cols-2">
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </ul>
        </DataState>
      </PageBody>
      <AddProjectWizard open={adding} onOpenChange={setAdding} />
    </>
  );
}
