import { Link } from '@tanstack/react-router';

const sections = [
  {
    to: '/projects',
    title: 'Projects',
    description: 'Open your projects and follow work across your team.',
    action: 'View workspace',
  },
  {
    to: '/settings',
    title: 'Settings',
    description: 'Manage your team, connections and workspace preferences.',
    action: 'Manage workspace',
  },
] as const;

export function HomePage() {
  return (
    <div className="home-page">
      <section className="home-hero">
        <p className="eyebrow">YOUR TEAM WORKSPACE</p>
        <h1>Welcome to Staplr</h1>
        <p>
          Bring your repositories, AI providers, and agents together. Build a
          team for every project and keep work moving.
        </p>
        <Link to="/projects" className="home-primary">
          Open workspace <span aria-hidden="true">→</span>
        </Link>
      </section>
      <section aria-labelledby="workspace-heading" className="home-section">
        <div className="home-section-heading">
          <div>
            <p className="eyebrow">GET ORGANIZED</p>
            <h2 id="workspace-heading">Your workspace</h2>
          </div>
          <p>Everything you need to get your team ready.</p>
        </div>
        <div className="home-grid">
          {sections.map((section, index) => (
            <article key={section.to} className="home-card">
              <span className="home-card-number">0{index + 1}</span>
              <h3>{section.title}</h3>
              <p>{section.description}</p>
              <Link to={section.to} className="home-card-action">
                {section.action} <span aria-hidden="true">↗</span>
              </Link>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
