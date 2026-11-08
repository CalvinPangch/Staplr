import { useState } from 'react';
import {
  Link,
  Outlet,
  useRouter,
  useRouterState,
  type ErrorComponentProps,
} from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchProjects, projectsKey } from '../features/projects/api';
import { api, errorMessage } from '../lib/api';
import { readTheme, saveTheme, type ThemeChoice } from '../lib/theme';
import { Button } from '../components/ui/Button';

const publicPaths = ['/setup', '/sign-in'];
const localHosts = ['localhost', '127.0.0.1', '[::1]'];

const navItems = [
  { to: '/projects', label: 'Projects' },
  { to: '/settings', label: 'Settings' },
] as const;

function InsecureBanner() {
  const insecure =
    window.location.protocol === 'http:' &&
    !localHosts.includes(window.location.hostname);
  if (!insecure) return null;
  return (
    <div
      role="alert"
      className="border-b border-warning bg-warning-soft px-4 py-2 text-sm text-warning"
    >
      This connection is not encrypted. Passwords and tokens you enter can be
      read on the network. Use an https:// address.
    </div>
  );
}

export function ThemeSelect() {
  const [choice, setChoice] = useState<ThemeChoice>(readTheme);
  return (
    <label className="flex items-center gap-2 text-sm">
      Theme
      <select
        value={choice}
        onChange={(event) => {
          const next = event.target.value as ThemeChoice;
          setChoice(next);
          saveTheme(next);
        }}
        className="min-h-11 rounded-lg border border-edge bg-bg px-2 text-fg"
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  );
}

export function SignOutButton() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="secondary"
      busy={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await api('/api/session', { method: 'DELETE' });
        } finally {
          queryClient.clear();
          await router.navigate({ to: '/sign-in' });
          setBusy(false);
        }
      }}
    >
      Sign out
    </Button>
  );
}

export function AppShell() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const signedIn = !publicPaths.includes(path);
  const projects = useQuery({
    queryKey: projectsKey,
    queryFn: fetchProjects,
    enabled: signedIn,
  });
  const isSettingsPath = [
    '/settings',
    '/souls',
    '/agents',
    '/audit',
    '/diagnostics',
  ].some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
  const currentSection = isSettingsPath
    ? 'Settings'
    : path.startsWith('/projects')
      ? 'Projects'
      : 'Overview';
  const brand = (
    <>
      <span className="app-brand-mark" aria-hidden="true">
        S
      </span>
      <span>
        <strong>Staplr</strong>
        <small>TEAM WORKSPACE</small>
      </span>
    </>
  );
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-bg focus:px-4 focus:py-2 focus:text-fg"
      >
        Skip to main content
      </a>
      <InsecureBanner />
      <div className="app-layout">
        <header className="app-sidebar">
          {signedIn ? (
            <Link to="/" className="app-brand" aria-label="Staplr home">
              {brand}
            </Link>
          ) : (
            <div className="app-brand">{brand}</div>
          )}
          {signedIn && (
            <nav
              id="workspace-navigation"
              aria-label="Main"
              className="app-nav"
            >
              <p className="app-nav-label">WORKSPACE</p>
              <ul>
                {navItems.map((item) => (
                  <li key={item.to}>
                    <Link
                      to={item.to}
                      className="app-nav-link"
                      activeProps={{
                        'aria-current': 'page',
                        className: 'app-nav-link active',
                      }}
                    >
                      <span className="app-nav-dot" aria-hidden="true" />
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="app-nav-label mt-6">YOUR PROJECTS</p>
              {projects.isPending ? (
                <p className="sidebar-message">Loading projects…</p>
              ) : projects.isError ? (
                <p className="sidebar-message">Could not load projects.</p>
              ) : projects.data?.length ? (
                <ul>
                  {projects.data.map((project) => (
                    <li key={project.id}>
                      <Link
                        to="/projects/$projectId"
                        params={{ projectId: project.id }}
                        className="app-nav-link project-nav-link"
                        activeProps={{
                          'aria-current': 'page',
                          className: 'app-nav-link project-nav-link active',
                        }}
                      >
                        <span className="app-nav-dot" aria-hidden="true" />
                        <span>{project.name}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="sidebar-message">No projects yet.</p>
              )}
            </nav>
          )}
          {!signedIn && (
            <div className="app-sidebar-footer">
              <ThemeSelect />
            </div>
          )}
        </header>
        <div className="app-content">
          <div className="app-topbar">
            <span>YOUR WORKSPACE</span>
            <span>Staplr / {currentSection}</span>
          </div>
          <main id="main" tabIndex={-1} className="app-main">
            <Outlet />
          </main>
        </div>
      </div>
    </>
  );
}

export function StartError({ error }: ErrorComponentProps) {
  const router = useRouter();
  return (
    <main id="main" className="mx-auto w-full max-w-5xl p-4">
      <div
        role="alert"
        className="flex flex-col items-start gap-3 rounded-lg border border-danger bg-danger-soft p-4 text-danger"
      >
        <p className="font-medium">
          Could not start Staplr. {errorMessage(error)}
        </p>
        <Button variant="secondary" onClick={() => void router.invalidate()}>
          Retry
        </Button>
      </div>
    </main>
  );
}

export function Pending() {
  return (
    <main id="main" className="mx-auto w-full max-w-5xl p-4">
      <p role="status" className="text-muted">
        Loading Staplr…
      </p>
    </main>
  );
}

export function NotFound() {
  return (
    <div className="flex flex-col items-start gap-3">
      <h1>Page not found</h1>
      <p>That page does not exist. Go back to the start page.</p>
      <Link to="/" className="min-h-11 py-2">
        Go to the start page
      </Link>
    </div>
  );
}
