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
import { PageBody, PageHeader } from '../components/ui/PageHeader';
import { Brand, Sidebar } from '../components/ui/nav/Sidebar';
import { TabBar } from '../components/ui/nav/TabBar';

const publicPaths = ['/setup', '/sign-in'];
const localHosts = ['localhost', '127.0.0.1', '[::1]'];

function InsecureBanner() {
  const insecure =
    window.location.protocol === 'http:' &&
    !localHosts.includes(window.location.hostname);
  if (!insecure) return null;
  return (
    <div
      role="alert"
      className="border-b border-status-attention bg-status-attention-soft px-4 py-2 text-secondary text-status-attention"
    >
      This connection is not encrypted. Passwords and tokens you enter can be
      read on the network. Use an https:// address.
    </div>
  );
}

export function ThemeSelect() {
  const [choice, setChoice] = useState<ThemeChoice>(readTheme);
  return (
    <label className="flex items-center gap-2 text-secondary">
      Theme
      <select
        value={choice}
        onChange={(event) => {
          const next = event.target.value as ThemeChoice;
          setChoice(next);
          saveTheme(next);
        }}
        className="min-h-11 rounded-control border border-control bg-surface px-2 text-fg"
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
  const skip = (
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-control focus:bg-surface focus:px-4 focus:py-2 focus:text-fg"
    >
      Skip to main content
    </a>
  );
  if (!signedIn)
    return (
      <>
        {skip}
        <InsecureBanner />
        <div className="flex min-h-screen flex-col items-center gap-8 px-4 py-6">
          <div className="flex w-full max-w-md flex-wrap items-center justify-between gap-3">
            <Brand />
            <ThemeSelect />
          </div>
          <main id="main" tabIndex={-1} className="w-full max-w-md">
            <Outlet />
          </main>
        </div>
      </>
    );
  return (
    <>
      {skip}
      <InsecureBanner />
      <div className="shell">
        <Sidebar />
        <main id="main" tabIndex={-1} className="shell-main px-4 pb-8 md:px-8">
          <Outlet />
        </main>
        <TabBar />
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
        className="flex flex-col items-start gap-3 rounded-control border border-status-failed bg-status-failed-soft p-4 text-status-failed"
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
    <>
      <PageHeader
        title="Page not found"
        description="That page does not exist. Go back to the start page."
      />
      <PageBody>
        <Link
          to="/"
          className="inline-flex min-h-11 items-center self-start rounded-control border border-control bg-surface px-4 font-semibold text-fg hover:bg-bg"
        >
          Go to the start page
        </Link>
      </PageBody>
    </>
  );
}
