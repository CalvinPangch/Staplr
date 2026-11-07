import type { QueryClient } from '@tanstack/react-query';
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  redirect,
} from '@tanstack/react-router';
import { ApiError, api } from './lib/api';
import { AppShell, NotFound, Pending, StartError } from './routes/__root';
import { AuditPage } from './routes/audit';
import { HomePage } from './routes/home';
import { SourceControlPage } from './routes/settings/source-control';
import { SetupPage } from './routes/setup';
import { SignInPage } from './routes/sign-in';

interface RouterContext {
  queryClient: QueryClient;
}

/**
 * Runs before every page: first-run setup while there is no owner, sign-in
 * while there is no session, and the requested page otherwise.
 */
async function guard({
  location,
  context,
}: {
  location: { pathname: string };
  context: RouterContext;
}) {
  const { queryClient } = context;
  const path = location.pathname;
  const status = await queryClient.fetchQuery({
    queryKey: ['setup-status'],
    queryFn: () => api<{ needsSetup: boolean }>('/api/setup/status'),
    staleTime: 0,
  });
  if (status.needsSetup) {
    if (path !== '/setup') throw redirect({ to: '/setup' });
    return;
  }
  if (path === '/setup') throw redirect({ to: '/sign-in' });
  try {
    await queryClient.fetchQuery({
      queryKey: ['session'],
      queryFn: () => api<{ username: string }>('/api/session'),
      staleTime: 0,
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      if (path !== '/sign-in') throw redirect({ to: '/sign-in' });
      return;
    }
    throw error;
  }
  if (path === '/sign-in') throw redirect({ to: '/' });
}

export function createAppRouter(queryClient: QueryClient) {
  const rootRoute = createRootRouteWithContext<RouterContext>()({
    component: AppShell,
    pendingComponent: Pending,
    beforeLoad: guard,
  });
  const routeTree = rootRoute.addChildren([
    createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: HomePage,
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: '/setup',
      component: SetupPage,
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: '/sign-in',
      component: SignInPage,
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: '/settings/source-control',
      component: SourceControlPage,
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: '/audit',
      component: AuditPage,
    }),
  ]);
  return createRouter({
    routeTree,
    context: { queryClient },
    defaultPendingComponent: Pending,
    defaultPendingMs: 100,
    defaultPendingMinMs: 300,
    defaultNotFoundComponent: NotFound,
    defaultErrorComponent: StartError,
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
