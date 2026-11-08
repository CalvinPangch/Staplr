import { Link } from '@tanstack/react-router';
import {
  Bot,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleX,
  FolderKanban,
  Plug,
} from 'lucide-react';
import { Card } from '../components/ui/Card';
import { StatTile } from '../components/ui/StatTile';
import { DataState } from '../components/ui/DataState';
import { PageBody, PageHeader } from '../components/ui/PageHeader';
import { useAgents } from '../features/agents/api';
import { attentionItems } from '../features/home/attention';
import { useProjects } from '../features/projects/api';
import { useProviderConnections } from '../features/providers/api';
import { useConnections } from '../features/source-control/api';

const count = (n: number | undefined) => (n === undefined ? '…' : String(n));

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
        description="Your workspace at a glance, then what needs your attention."
      />
      <PageBody>
        <section aria-label="Overview">
          <ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              label="Projects"
              value={count(projects.data?.length)}
              icon={FolderKanban}
              tone="accent"
              to="/projects"
              moreLabel="projects"
            />
            <StatTile
              label="Agents ready"
              value={
                agents.data ? `${ready.length} of ${agents.data.length}` : '…'
              }
              icon={Bot}
              tone="progress"
              to="/agents"
              moreLabel="agents"
            />
            <StatTile
              label="Connections"
              value={
                providers.data && sourceControl.data ? String(connections) : '…'
              }
              icon={Plug}
              tone="accent"
              to="/settings/providers"
              moreLabel="connections"
            />
            <StatTile
              label="Needs attention"
              value={loading ? '…' : String(items.length)}
              icon={CircleAlert}
              tone={
                items.some((i) => i.severity === 'failed')
                  ? 'failed'
                  : 'attention'
              }
              to="/"
              hash="needs-attention"
              moreLabel="what needs attention"
            />
          </ul>
        </section>
        <section
          id="needs-attention"
          aria-label="Needs attention"
          className="flex scroll-mt-16 flex-col gap-3"
        >
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
      </PageBody>
    </>
  );
}
