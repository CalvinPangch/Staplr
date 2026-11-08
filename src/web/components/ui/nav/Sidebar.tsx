import { Link, useRouterState } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { fetchProjects, projectsKey } from '../../../features/projects/api';
import { cn } from '../../../lib/cn';
import { navItems } from './navItems';

/** Staplr's mark and name. `onDark` for the dark sidebar. */
export function Brand({
  onDark = false,
  markOnly = false,
}: {
  onDark?: boolean;
  markOnly?: boolean;
}) {
  return (
    <span className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className="grid size-8 shrink-0 place-items-center rounded-control bg-accent text-body font-bold text-accent-fg"
      >
        S
      </span>
      <span
        className={cn(
          'text-section font-semibold',
          onDark ? 'text-sidebar-fg' : 'text-fg',
          markOnly && 'sr-only',
        )}
      >
        Staplr
      </span>
    </span>
  );
}

/**
 * What the dark sidebar holds (feature 004, FR-001, FR-005a): the brand, the
 * main places, then the owner's projects. Collapsed, it is a rail of icons
 * whose links keep their names for screen readers and as tooltips. Used by
 * the wide-screen sidebar and by the slide-in panel.
 */
export function SidebarContent({ collapsed = false }: { collapsed?: boolean }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const projects = useQuery({ queryKey: projectsKey, queryFn: fetchProjects });
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 px-3 py-4">
      <Link
        to="/"
        aria-label="Staplr home"
        className={cn(
          'flex min-h-11 items-center rounded-control',
          collapsed ? 'justify-center' : 'px-2',
        )}
      >
        <Brand onDark markOnly={collapsed} />
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
              title={collapsed ? item.label : undefined}
              className={cn(
                'flex min-h-11 items-center gap-3 rounded-control text-body transition-colors duration-150',
                collapsed ? 'justify-center' : 'px-3',
                current
                  ? 'bg-sidebar-current font-semibold text-sidebar-accent'
                  : 'text-sidebar-fg hover:bg-sidebar-current',
              )}
            >
              <Icon aria-hidden="true" className="size-5 shrink-0" />
              <span className={cn(collapsed && 'sr-only')}>{item.label}</span>
            </Link>
          );
        })}
      </nav>
      {!collapsed && (
        <section
          aria-labelledby="sidebar-projects"
          className="flex min-h-0 flex-col gap-1"
        >
          <h2
            id="sidebar-projects"
            className="px-3 text-caption font-semibold uppercase tracking-wide text-sidebar-muted"
          >
            Your projects
          </h2>
          {projects.isPending ? (
            <p className="px-3 text-secondary text-sidebar-muted">
              Loading projects…
            </p>
          ) : projects.isError ? (
            <p className="px-3 text-secondary text-sidebar-muted">
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
                    className="block min-h-11 truncate rounded-control px-3 py-3 text-secondary text-sidebar-fg hover:bg-sidebar-current"
                    activeProps={{
                      'aria-current': 'page',
                      className: 'font-semibold text-sidebar-accent',
                    }}
                  >
                    {project.name}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 text-secondary text-sidebar-muted">
              No projects yet.
            </p>
          )}
        </section>
      )}
    </div>
  );
}

/**
 * The sidebar on screens 1024 px and wider: dark and frosted in both themes,
 * 248 px wide, or a 72 px icon rail when collapsed.
 */
export function Sidebar({ collapsed }: { collapsed: boolean }) {
  return (
    <aside
      id="sidebar"
      aria-label="Sidebar"
      className="shell-sidebar sidebar-surface"
    >
      <SidebarContent collapsed={collapsed} />
    </aside>
  );
}
