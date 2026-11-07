import { useState } from 'react';
import {
  Link,
  Outlet,
  useRouter,
  useRouterState,
  type ErrorComponentProps,
} from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../lib/api';
import { readTheme, saveTheme, type ThemeChoice } from '../lib/theme';
import { Button } from '../components/ui/Button';

const publicPaths = ['/setup', '/sign-in'];
const localHosts = ['localhost', '127.0.0.1', '[::1]'];

const navItems = [
  { to: '/settings/source-control', label: 'Source control' },
  { to: '/settings/providers', label: 'Providers' },
  { to: '/souls', label: 'Souls' },
  { to: '/agents', label: 'Agents' },
  { to: '/audit', label: 'Audit' },
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

function ThemeSelect() {
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

function SignOutButton() {
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
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-bg focus:px-4 focus:py-2 focus:text-fg"
      >
        Skip to main content
      </a>
      <InsecureBanner />
      <header className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-edge-soft bg-surface px-4 py-2">
        <span className="text-lg font-bold">Staplr</span>
        {signedIn && (
          <nav aria-label="Main" className="flex-1">
            <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
              {navItems.map((item) => (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    className="inline-flex min-h-11 items-center rounded-lg px-3 text-fg no-underline hover:bg-surface-strong"
                    activeProps={{
                      'aria-current': 'page',
                      className:
                        'inline-flex min-h-11 items-center rounded-lg px-3 font-semibold text-fg underline',
                    }}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
        {!signedIn && <div className="flex-1" />}
        <ThemeSelect />
        {signedIn && <SignOutButton />}
      </header>
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-5xl p-4">
        <Outlet />
      </main>
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
