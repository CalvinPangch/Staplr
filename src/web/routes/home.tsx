import { Link } from '@tanstack/react-router';
import {
  Bot,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleX,
  FolderKanban,
  Plug,
  type LucideIcon,
} from 'lucide-react';
import { Card } from '../components/ui/Card';
import { DataState } from '../components/ui/DataState';
import { PageBody, PageHeader } from '../components/ui/PageHeader';
import { useAgents } from '../features/agents/api';
import { attentionItems } from '../features/home/attention';
import { useProjects } from '../features/projects/api';
import { useProviderConnections } from '../features/providers/api';
import { useConnections } from '../features/source-control/api';

function Summary({
  to,
  icon: Icon,
  title,
  count,
  detail,
}: {
  to: string;
  icon: LucideIcon;
  title: string;
  count: number | null;
  detail: string;
}) {
  return (
    <li>
      <Link
        to={to}
        data-card=""
        className="flex min-h-16 items-center gap-4 rounded-card border border-separator bg-surface p-4 text-fg shadow-card transition-colors duration-150 hover:border-accent"
      >
        <span
          aria-hidden="true"
          className="grid size-12 shrink-0 place-items-center rounded-control bg-accent-soft text-accent"
        >
          <Icon className="size-6" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="font-semibold">{title}</span>
          <span className="text-secondary text-muted">
            {count === null ? 'Loading…' : detail}
          </span>
        </span>
        <ChevronRight aria-hidden="true" className="size-5 text-muted" />
      </Link>
    </li>
  );
}

export function HomePage() {
  const agents = useAgents();
  const providers = useProviderConnections();
  const sourceControl = useConnections();
  const projects = useProjects();
  const queries = [agents, providers, sourceControl, projects];
  const loading = queries.some((q) => q.isPending);
  const error = queries.find((q) => q.error)?.error;
  const items = attentionItems({
    agents: agents.data ?? [],
    providerConnections: providers.data ?? [],
    sourceControl: sourceControl.data ?? [],
    projects: projects.data ?? [],
  });
  const ready = (agents.data ?? []).filter((a) => a.readiness === 'ready');
  const connections =
    (providers.data?.length ?? 0) + (sourceControl.data?.length ?? 0);

  return (
    <>
      <PageHeader
        title="Home"
        description="What needs your attention first, then your workspace at a glance."
      />
      <PageBody>
        <section aria-label="Needs attention" className="flex flex-col gap-3">
          <h2>Needs attention</h2>
          <DataState
            what="your workspace"
            isLoading={loading}
            error={error}
            isEmpty={false}
            empty={null}
            onRetry={() => queries.forEach((q) => void q.refetch())}
          >
            {items.length === 0 ? (
              <Card className="flex items-center gap-3">
                <CircleCheck
                  aria-hidden="true"
                  className="size-6 shrink-0 text-status-good"
                />
                <p>Everything is ready.</p>
              </Card>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-3 p-0">
                {items.map((item) => {
                  const Icon =
                    item.severity === 'failed' ? CircleX : CircleAlert;
                  return (
                    <li key={`${item.kind}-${item.id}`}>
                      <Link
                        to={item.href}
                        data-card=""
                        className="flex min-h-16 items-center gap-4 rounded-card border border-separator bg-surface p-4 text-fg shadow-card transition-colors duration-150 hover:border-accent"
                      >
                        <Icon
                          aria-hidden="true"
                          className={`size-6 shrink-0 ${
                            item.severity === 'failed'
                              ? 'text-status-failed'
                              : 'text-status-attention'
                          }`}
                        />
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span
                            className="truncate font-semibold"
                            title={item.name}
                          >
                            {item.name}
                          </span>
                          <span className="text-secondary text-fg">
                            {item.reason}
                          </span>
                        </span>
                        <ChevronRight
                          aria-hidden="true"
                          className="size-5 shrink-0 text-muted"
                        />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </DataState>
        </section>
        <section aria-label="Workspace" className="flex flex-col gap-3">
          <h2>Workspace</h2>
          <ul className="m-0 grid list-none gap-3 p-0 md:grid-cols-3">
            <Summary
              to="/projects"
              icon={FolderKanban}
              title="Projects"
              count={projects.data?.length ?? null}
              detail={`${projects.data?.length ?? 0} ${projects.data?.length === 1 ? 'project' : 'projects'}`}
            />
            <Summary
              to="/agents"
              icon={Bot}
              title="Agents"
              count={agents.data?.length ?? null}
              detail={`${ready.length} of ${agents.data?.length ?? 0} ready`}
            />
            <Summary
              to="/settings/providers"
              icon={Plug}
              title="Connections"
              count={providers.data && sourceControl.data ? connections : null}
              detail={`${connections} ${connections === 1 ? 'connection' : 'connections'}`}
            />
          </ul>
        </section>
      </PageBody>
    </>
  );
}
