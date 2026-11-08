import { useId, useRef, useState, type KeyboardEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  maxAgentFileLength,
  parseAgentFile,
  type FileProblem,
} from '../../../shared/agent-file';
import { TextArea } from '../../components/ui/TextArea';
import { cn } from '../../lib/cn';
import { roleLabels } from './api';

const tabs = ['edit', 'preview'] as const;
type Tab = (typeof tabs)[number];

/**
 * The agent's Markdown file: a settings header and its instructions (feature
 * 003). Problems found while typing come from the same parser the server uses;
 * problems only the server can find (a taken name, an unknown connection, an
 * unverified model) are passed in after a refused save.
 */
export function AgentFileEditor({
  value,
  onChange,
  serverProblems,
}: {
  value: string;
  onChange: (value: string) => void;
  serverProblems: FileProblem[];
}) {
  const id = useId();
  const [tab, setTab] = useState<Tab>('edit');
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({
    edit: null,
    preview: null,
  });
  const parsed = parseAgentFile(value);
  const problems = parsed.ok ? serverProblems : parsed.problems;

  function onTabKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const index = tabs.indexOf(tab);
    const next =
      event.key === 'Home'
        ? tabs[0]
        : event.key === 'End'
          ? tabs[tabs.length - 1]
          : tabs[
              (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) %
                tabs.length
            ];
    if (next) {
      setTab(next);
      tabRefs.current[next]?.focus();
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        role="tablist"
        aria-label="Agent file"
        className="inline-flex self-start rounded-control bg-bg p-1"
      >
        {tabs.map((name) => (
          <button
            key={name}
            ref={(element) => {
              tabRefs.current[name] = element;
            }}
            type="button"
            role="tab"
            id={`${id}-${name}-tab`}
            aria-selected={tab === name}
            aria-controls={`${id}-${name}-panel`}
            tabIndex={tab === name ? 0 : -1}
            onClick={() => setTab(name)}
            onKeyDown={onTabKey}
            className={cn(
              'min-h-11 min-w-24 rounded-control px-4 text-secondary font-semibold transition-colors duration-150',
              tab === name
                ? 'bg-surface text-fg shadow-card'
                : 'text-muted hover:text-fg',
            )}
          >
            {name === 'edit' ? 'Edit' : 'Preview'}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`${id}-edit-panel`}
        aria-labelledby={`${id}-edit-tab`}
        hidden={tab !== 'edit'}
      >
        <TextArea
          label="Agent file (Markdown)"
          value={value}
          maxLength={maxAgentFileLength}
          rows={22}
          spellCheck={false}
          className="font-mono text-secondary"
          hint="The header between the --- lines sets name, role, provider, connection and model. Everything below it is the agent's instructions."
          error={
            problems.length === 0
              ? undefined
              : `${problems.length === 1 ? '1 problem' : `${problems.length} problems`} in the file, listed below.`
          }
          onChange={(event) => onChange(event.target.value)}
        />
        {problems.length > 0 && (
          <ul
            aria-label="Problems in the agent file"
            className="m-0 mt-2 flex list-none flex-col gap-1 rounded-card border border-status-failed bg-status-failed-soft p-4 text-secondary text-status-failed"
          >
            {problems.map((problem) => (
              <li key={`${problem.line}-${problem.field}-${problem.message}`}>
                <span className="font-medium">Line {problem.line}:</span>{' '}
                {problem.message}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div
        role="tabpanel"
        id={`${id}-preview-panel`}
        aria-labelledby={`${id}-preview-tab`}
        hidden={tab !== 'preview'}
        className="flex flex-col gap-3 rounded-control border border-separator bg-surface p-4"
      >
        {parsed.ok ? (
          <>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-secondary">
              <dt className="text-muted">Name</dt>
              <dd className="break-all">{parsed.settings.name}</dd>
              <dt className="text-muted">Role</dt>
              <dd>{roleLabels[parsed.settings.role]}</dd>
              <dt className="text-muted">Connection</dt>
              <dd className="break-all">
                {parsed.settings.connection || 'Not set'}
              </dd>
              <dt className="text-muted">Model</dt>
              <dd className="break-all">
                {parsed.settings.model || 'Not set'}
              </dd>
            </dl>
            <div className="break-words text-secondary [&_code]:font-mono [&_h1]:mt-3 [&_h1]:text-section [&_h1]:font-semibold [&_h2]:mt-3 [&_h2]:text-section [&_h2]:font-semibold [&_h3]:mt-2 [&_h3]:font-semibold [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-2 [&_pre]:overflow-x-auto [&_ul]:list-disc [&_ul]:pl-6">
              {parsed.instructions.trim() === '' ? (
                <p className="text-muted">No instructions yet.</p>
              ) : (
                <ReactMarkdown
                  skipHtml
                  components={{
                    a: ({ href, children }) => (
                      <a
                        href={href}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="underline"
                      >
                        {children}
                        <span className="sr-only"> (opens in a new tab)</span>
                      </a>
                    ),
                  }}
                >
                  {parsed.instructions}
                </ReactMarkdown>
              )}
            </div>
          </>
        ) : (
          <p>
            The preview appears once the settings header has no problems. Switch
            to Edit to fix them.
          </p>
        )}
      </div>
    </div>
  );
}
