import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
// Inter (variable weight), served by Staplr itself; browsers fetch only the subsets a page uses.
import '@fontsource-variable/inter/wght.css';
import './styles/app.css';
import { signedOutEvent } from './lib/api';
import { applyStoredTheme } from './lib/theme';
import { LiveRegionProvider } from './components/ui/LiveRegion';
import { ToastProvider } from './components/ui/Toast';
import { createAppRouter } from './router';

applyStoredTheme();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false },
  },
});
const router = createAppRouter(queryClient);

// A protected request answered 401: the session ended, so start over at sign-in.
window.addEventListener(signedOutEvent, () => {
  queryClient.clear();
  void router.navigate({ to: '/sign-in' });
});

const root = document.getElementById('root');
if (!root) throw new Error('The page has no #root element');
createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <LiveRegionProvider>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </LiveRegionProvider>
    </QueryClientProvider>
  </StrictMode>,
);
