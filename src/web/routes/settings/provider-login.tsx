import { useEffect, useRef, useState } from 'react';
import { PageBody, PageHeader } from '../../components/ui/PageHeader';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import type { SandboxSession } from '../../../shared/schemas/sandbox';
import { api, errorMessage } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { DataState } from '../../components/ui/DataState';
import { useAnnounce } from '../../components/ui/LiveRegion';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { providersKey } from '../../features/providers/api';

type ServerMessage =
  | { type: 'output'; data: string }
  | {
      type: 'status';
      status: SandboxSession['status'];
      failureReason?: string | null;
    }
  | { type: 'expiresAt'; at: string }
  | { type: 'error'; code: string; message: string };

function clock(totalSeconds: number) {
  const seconds = Math.max(0, totalSeconds);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** The sign-in sandbox for Codex: terminal, time left, finish and cancel. */
export function ProviderLoginPage() {
  const { sessionId } = useParams({ strict: false }) as { sessionId: string };
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const announce = useAnnounce();
  const session = useQuery({
    queryKey: ['sandbox-session', sessionId],
    queryFn: () => api<SandboxSession>(`/api/sandbox-sessions/${sessionId}`),
    staleTime: 0,
  });
  const host = useRef<HTMLDivElement>(null);
  const [liveExpiresAt, setExpiresAt] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [ended, setEnded] = useState<{
    status: SandboxSession['status'];
    reason: string | null;
  } | null>(null);
  const [socketNote, setSocketNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'complete' | 'cancel' | null>(null);
  const warned = useRef(false);

  const open = session.data?.status === 'in_progress' && !ended;
  // Only the address matters: a refetched session must not restart the terminal.
  const terminalUrl = session.data?.terminalUrl;

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!open || !terminalUrl || !host.current) return;
    const terminal = new Terminal({
      cols: 80,
      rows: 24,
      screenReaderMode: true,
      convertEol: true,
      fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
      fontSize: 14,
    });
    terminal.open(host.current);
    // Escape leaves the terminal so keyboard users are never trapped in it.
    terminal.attachCustomKeyEventHandler((event) => {
      if (event.type === 'keydown' && event.key === 'Escape') {
        terminal.blur();
        return false;
      }
      // Ctrl+C (Cmd+C) with text selected copies it, as in other web terminals.
      // Sending it to the sandbox would stop the Codex login half way.
      const copy =
        (event.ctrlKey || event.metaKey) &&
        !event.shiftKey &&
        event.key.toLowerCase() === 'c';
      if (copy && terminal.hasSelection()) {
        if (event.type === 'keydown')
          void navigator.clipboard
            ?.writeText(terminal.getSelection())
            .catch(() => undefined);
        return false;
      }
      return true;
    });
    const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
    let socket: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let closing = false;
    // A previous page or effect may not have released its terminal yet (4409);
    // try again shortly before telling the person it is open elsewhere.
    function connect(attempt: number) {
      const current = new WebSocket(
        `${scheme}://${window.location.host}${terminalUrl}`,
      );
      socket = current;
      current.onopen = () =>
        current.send(JSON.stringify({ type: 'resize', cols: 80, rows: 24 }));
      current.onmessage = (event: MessageEvent<string>) => {
        const message = JSON.parse(event.data) as ServerMessage;
        if (message.type === 'output') terminal.write(message.data);
        else if (message.type === 'expiresAt') setExpiresAt(message.at);
        else if (message.type === 'status' && message.status !== 'in_progress')
          setEnded({
            status: message.status,
            reason: message.failureReason ?? null,
          });
        else if (message.type === 'error') setSocketNote(message.message);
      };
      current.onclose = (event) => {
        if (closing || event.code !== 4409) return;
        if (attempt < 8) retry = setTimeout(() => connect(attempt + 1), 400);
        else setSocketNote('This session is already open in another tab.');
      };
    }
    connect(0);
    const input = terminal.onData((data) => {
      if (socket?.readyState === WebSocket.OPEN)
        socket.send(JSON.stringify({ type: 'input', data }));
    });
    return () => {
      closing = true;
      clearTimeout(retry);
      input.dispose();
      socket?.close();
      terminal.dispose();
    };
  }, [open, terminalUrl]);

  // The terminal pushes new deadlines; until it does, use the session's own.
  const expiresAt = liveExpiresAt ?? session.data?.expiresAt ?? null;
  const secondsLeft = expiresAt
    ? Math.round((Date.parse(expiresAt) - now) / 1000)
    : null;
  useEffect(() => {
    if (open && secondsLeft !== null && secondsLeft <= 60 && !warned.current) {
      warned.current = true;
      announce('One minute left before this sign-in session closes.');
    }
    if (secondsLeft !== null && secondsLeft > 60) warned.current = false;
  }, [open, secondsLeft, announce]);

  async function complete() {
    setError(null);
    setBusy('complete');
    try {
      await api(`/api/sandbox-sessions/${sessionId}/complete`, {
        method: 'POST',
      });
      await queryClient.invalidateQueries({ queryKey: providersKey });
      announce('Codex connected.');
      await navigate({ to: '/settings/providers' });
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(null);
    }
  }

  async function cancel() {
    setError(null);
    setBusy('cancel');
    try {
      await api(`/api/sandbox-sessions/${sessionId}`, { method: 'DELETE' });
      await navigate({ to: '/settings/providers' });
    } catch (failure) {
      setError(errorMessage(failure));
      setBusy(null);
    }
  }

  const finished =
    ended ??
    (session.data && session.data.status !== 'in_progress'
      ? { status: session.data.status, reason: session.data.failureReason }
      : null);

  return (
    <>
      <PageHeader
        title="Sign in to Codex"
        description="Finish the Codex sign-in in the terminal below; it runs in an isolated sandbox."
        action={finished && <StatusBadge status={finished.status} />}
      />
      <PageBody>
        <DataState
          what="the sign-in session"
          isLoading={session.isPending}
          error={session.error}
          isEmpty={false}
          empty={null}
          onRetry={() => void session.refetch()}
        >
          {session.data && (
            <>
              <p className="text-muted">{session.data.instructions}</p>
              {finished ? (
                <div className="flex flex-col gap-3">
                  <p role="status">
                    {finished.status === 'expired'
                      ? 'This sign-in session timed out. Nothing was saved. Start a new one from the Providers screen.'
                      : finished.status === 'cancelled'
                        ? 'This sign-in session was cancelled. Nothing was saved.'
                        : finished.status === 'succeeded'
                          ? 'This sign-in session finished and the login was saved. Staplr is now finding which models it can use; the Providers screen shows the result.'
                          : (finished.reason ??
                            'This sign-in session ended. Nothing was saved.')}
                  </p>
                  <Link
                    to="/settings/providers"
                    className="min-h-11 self-start py-2 underline"
                  >
                    Back to providers
                  </Link>
                </div>
              ) : (
                <>
                  {secondsLeft !== null && (
                    <p className="text-secondary">
                      Time left:{' '}
                      <time
                        dateTime={`PT${Math.max(0, secondsLeft)}S`}
                        className="font-mono"
                      >
                        {clock(secondsLeft)}
                      </time>{' '}
                      <span className="text-muted">
                        (resets whenever you type in the terminal)
                      </span>
                    </p>
                  )}
                  {error && (
                    <p
                      role="alert"
                      className="rounded-card border border-status-failed bg-status-failed-soft p-4 text-secondary text-status-failed"
                    >
                      {error}
                    </p>
                  )}
                  {socketNote && (
                    <p
                      role="alert"
                      className="rounded-card border border-status-attention bg-status-attention-soft p-4 text-secondary text-status-attention"
                    >
                      {socketNote}
                    </p>
                  )}
                  <p className="text-secondary">
                    After you sign in, Staplr finds which models this login can
                    use. Finding your models sends one very short request per
                    model (about 10).
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="primary"
                      busy={busy === 'complete'}
                      onClick={() => void complete()}
                    >
                      I’ve finished logging in
                    </Button>
                    <Button
                      busy={busy === 'cancel'}
                      onClick={() => void cancel()}
                    >
                      Cancel sign-in
                    </Button>
                  </div>
                  <div
                    role="group"
                    aria-label="Codex sign-in terminal. Press Escape to leave the terminal."
                    className="overflow-x-auto rounded-control border border-control bg-black p-2"
                  >
                    <div ref={host} />
                  </div>
                  <p className="text-secondary text-muted">
                    Press Escape to leave the terminal and reach the buttons. To
                    copy the code, select it and press Ctrl+C. Without a
                    selection, Ctrl+C stops the login and you have to start
                    again.
                  </p>
                </>
              )}
            </>
          )}
        </DataState>
      </PageBody>
    </>
  );
}
