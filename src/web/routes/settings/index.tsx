import { Link } from '@tanstack/react-router';
import { SignOutButton, ThemeSelect } from '../__root';

const sections = [
  {
    to: '/settings/source-control',
    title: 'Source control',
    description: 'Connect GitHub and GitLab repositories.',
  },
  {
    to: '/settings/providers',
    title: 'Providers and prices',
    description: 'Manage AI connections, model access, and pricing.',
  },
  {
    to: '/souls',
    title: 'Souls',
    description: 'Define the roles and instructions your agents use.',
  },
  {
    to: '/agents',
    title: 'Agents',
    description: 'Configure agents and the models they use.',
  },
  {
    to: '/audit',
    title: 'Audit log',
    description: 'Review changes made in your workspace.',
  },
  {
    to: '/diagnostics',
    title: 'Diagnostics',
    description: 'Review errors captured by this installation.',
  },
] as const;

export function SettingsPage() {
  return (
    <div className="settings-page">
      <header>
        <p className="eyebrow">WORKSPACE MANAGEMENT</p>
        <h1>Settings</h1>
        <p className="settings-intro">
          Manage your connections, team configuration, and workspace
          preferences.
        </p>
      </header>
      <section aria-labelledby="settings-workspace">
        <h2 id="settings-workspace">Workspace</h2>
        <div className="settings-grid">
          {sections.map((section) => (
            <Link
              key={section.to}
              to={section.to}
              className="settings-card"
              aria-label={section.title}
            >
              <span>
                <strong>{section.title}</strong>
                <span>{section.description}</span>
              </span>
              <span className="settings-arrow" aria-hidden="true">
                →
              </span>
            </Link>
          ))}
        </div>
      </section>
      <section aria-labelledby="settings-account">
        <h2 id="settings-account">Preferences and account</h2>
        <div className="settings-account">
          <ThemeSelect />
          <SignOutButton />
        </div>
      </section>
    </div>
  );
}
