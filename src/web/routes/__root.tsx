import { useCallback, useRef, useState } from 'react';
import {
  Link,
  Outlet,
  useRouter,
  useRouterState,
  type ErrorComponentProps,
} from '@tanstack/react-router';
import { errorMessage } from '../lib/api';
import { useMediaQuery } from '../lib/useMediaQuery';
import { Button } from '../components/ui/Button';
import { PageBody, PageHeader } from '../components/ui/PageHeader';
import { Brand, Sidebar } from '../components/ui/nav/Sidebar';
import { TabBar } from '../components/ui/nav/TabBar';
import { TopBar } from '../components/ui/nav/TopBar';
import { SidebarPanel } from '../components/ui/nav/SidebarPanel';
import { ThemeSelect } from '../components/ui/nav/AccountControls';

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

export {
  SignOutButton,
  ThemeSelect,
} from '../components/ui/nav/AccountControls';

const sidebarKey = 'staplr-sidebar';
function readCollapsed() {
  try {
    return localStorage.getItem(sidebarKey) === 'collapsed';
  } catch {
    return false;
  }
}
function saveCollapsed(collapsed: boolean) {
  try {
    localStorage.setItem(sidebarKey, collapsed ? 'collapsed' : 'expanded');
  } catch {
    // a per-browser convenience only; without storage it is simply not kept
  }
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
      <WorkspaceShell />
    </>
  );
}

/**
 * The AdminLTE layout (feature 004): the dark sidebar from 1024 px (or the
 * slide-in panel below that), the sticky top navigation bar, the page, and the
 * tab bar on phones.
 */
function WorkspaceShell() {
  const wide = useMediaQuery('(min-width: 1024px)');
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [panelOpen, setPanelOpen] = useState(false);
  const closePanel = useCallback((open: boolean) => setPanelOpen(open), []);
  const menuButton = useRef<HTMLButtonElement>(null);
  return (
    <div className="shell" data-sidebar={collapsed ? 'collapsed' : 'expanded'}>
      {wide && <Sidebar collapsed={collapsed} />}
      <div className="shell-content">
        <TopBar
          buttonRef={menuButton}
          expanded={wide ? !collapsed : panelOpen}
          controls={wide ? 'sidebar' : 'sidebar-panel'}
          onToggle={() => {
            if (!wide) return setPanelOpen(true);
            setCollapsed(!collapsed);
            saveCollapsed(!collapsed);
          }}
        />
        <main id="main" tabIndex={-1} className="shell-main px-4 pb-8 md:px-8">
          <Outlet />
        </main>
      </div>
      {!wide && (
        <SidebarPanel
          open={panelOpen}
          onOpenChange={closePanel}
          returnFocusTo={menuButton}
        />
      )}
      <TabBar />
    </div>
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
