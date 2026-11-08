import { Link } from '@tanstack/react-router';
import {
  Activity,
  Bot,
  ChevronRight,
  GitBranch,
  ScrollText,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { PageBody, PageHeader } from '../../components/ui/PageHeader';
import { SignOutButton, ThemeSelect } from '../__root';

const sections: {
  to: string;
  title: string;
  description: string;
  icon: LucideIcon;
}[] = [
  {
    to: '/settings/source-control',
    title: 'Source control',
    description: 'Connect GitHub and GitLab repositories.',
    icon: GitBranch,
  },
  {
    to: '/settings/providers',
    title: 'Providers and prices',
    description: 'Manage AI connections, model access, and pricing.',
    icon: Sparkles,
  },
  {
    to: '/agents',
    title: 'Agents',
    description:
      'Each agent is one Markdown file: its role, model and instructions.',
    icon: Bot,
  },
  {
    to: '/audit',
    title: 'Audit log',
    description: 'Review changes made in your workspace.',
    icon: ScrollText,
  },
  {
    to: '/diagnostics',
    title: 'Diagnostics',
    description: 'Review errors captured by this installation.',
    icon: Activity,
  },
];

export function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Settings"
        description="Connections, agents and the records this installation keeps."
      />
      <PageBody>
        <section
          aria-labelledby="settings-workspace"
          className="flex flex-col gap-3"
        >
          <h2 id="settings-workspace">Workspace</h2>
          <ul className="m-0 grid list-none gap-3 p-0 md:grid-cols-2">
            {sections.map((section) => {
              const Icon = section.icon;
              return (
                <li key={section.to}>
                  <Link
                    to={section.to}
                    aria-label={section.title}
                    data-card=""
                    className="flex min-h-16 items-center gap-4 rounded-card border border-separator bg-surface p-4 text-fg shadow-card transition-colors duration-150 hover:border-accent"
                  >
                    <span
                      aria-hidden="true"
                      className="grid size-12 shrink-0 place-items-center rounded-control bg-accent-soft text-accent"
                    >
                      <Icon className="size-6" />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="font-semibold">{section.title}</span>
                      <span className="text-secondary text-muted">
                        {section.description}
                      </span>
                    </span>
                    <ChevronRight
                      aria-hidden="true"
                      className="size-5 shrink-0 text-muted"
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
        <section
          aria-labelledby="settings-account"
          className="flex flex-col gap-3"
        >
          <h2 id="settings-account">Preferences and account</h2>
          <Card className="flex flex-wrap items-center justify-between gap-4">
            <ThemeSelect />
            <SignOutButton />
          </Card>
        </section>
      </PageBody>
    </>
  );
}
