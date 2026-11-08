import { useState } from 'react';
import { LogOut } from 'lucide-react';
import { useRouter } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { readTheme, saveTheme, type ThemeChoice } from '../../../lib/theme';
import { cn } from '../../../lib/cn';
import { Button } from '../Button';

/**
 * The theme choice. `compact` (top bar) hides the visible word "Theme" on
 * small screens; the select keeps it as its name.
 */
export function ThemeSelect({ compact = false }: { compact?: boolean }) {
  const [choice, setChoice] = useState<ThemeChoice>(readTheme);
  return (
    <label className="flex shrink-0 items-center gap-2 text-secondary text-fg">
      <span className={cn(compact && 'sr-only sm:not-sr-only')}>Theme</span>
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

/** Sign out. `compact` (top bar) shows only the icon on small screens. */
export function SignOutButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="secondary"
      busy={busy}
      className="shrink-0"
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
      {compact && !busy && <LogOut aria-hidden="true" className="size-5" />}
      <span className={cn(compact && 'sr-only sm:not-sr-only')}>Sign out</span>
    </Button>
  );
}
