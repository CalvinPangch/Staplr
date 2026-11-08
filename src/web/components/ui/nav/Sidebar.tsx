import { Link, useRouterState } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { fetchProjects, projectsKey } from '../../../features/projects/api';
import { cn } from '../../../lib/cn';
import { navItems } from './navItems';

export function Brand() {
  return (
    <span className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className="grid size-8 place-items-center rounded-control bg-accent text-body font-bold text-accent-fg"
      >
        S
      </span>
      <span className="text-section font-semibold text-fg">Staplr</span>
    </span>
  );
}

/**
 * The sidebar on screens 768 px and wider (feature 004): frosted glass, the
 * four places, then the owner's projects. Text is the primary colour or the
 * accent only, so it stays readable over anything behind the glass.
 */
export function Sidebar() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const projects = useQuery({ queryKey: projectsKey, queryFn: fetchProjects });
  return (
    <aside className="shell-sidebar frosted flex-col gap-6 px-3 py-4">
      <Link
        to="/"
        aria-label="Staplr home"
        className="flex min-h-11 items-center rounded-control px-2"
      >
        <Brand />
      </Link>
      <nav aria-label="Main" className="flex flex-col gap-1">
        {navItems.map((item) => {
          const current = item.match(path);
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              aria-current={current ? 'page' : undefined}
              className={cn(
                'flex min-h-11 items-center gap-3 rounded-control px-3 text-body transition-colors duration-150',
                current
                  ? 'bg-accent-soft font-semibold text-accent'
                  : 'text-fg hover:bg-accent-soft',
              )}
            >
              <Icon aria-hidden="true" className="size-5 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <section
        aria-label="Your projects"
        className="flex min-h-0 flex-col gap-1"
      >
        <h2 className="px-3 text-caption font-semibold uppercase tracking-wide text-fg">
          Your projects
        </h2>
        {projects.isPending ? (
          <p className="px-3 text-secondary text-fg">Loading projects…</p>
        ) : projects.isError ? (
          <p className="px-3 text-secondary text-fg">
            Could not load projects.
          </p>
        ) : projects.data?.length ? (
          <ul className="m-0 flex list-none flex-col gap-1 overflow-y-auto p-0">
            {projects.data.map((project) => (
              <li key={project.id}>
                <Link
                  to="/projects/$projectId"
                  params={{ projectId: project.id }}
                  title={project.name}
                  className="block min-h-11 truncate rounded-control px-3 py-3 text-secondary text-fg hover:bg-accent-soft"
                  activeProps={{
                    'aria-current': 'page',
                    className: 'font-semibold text-accent',
                  }}
                >
                  {project.name}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-3 text-secondary text-fg">No projects yet.</p>
        )}
      </section>
    </aside>
  );
}
