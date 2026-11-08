import { FolderKanban, House, Settings, type LucideIcon } from 'lucide-react';

/**
 * The top-level places (feature 004, FR-015a): Home, Projects and Settings;
 * Agents lives under Settings (owner decision, 2026-11-09). The sidebar, the
 * slide-in panel and the phone tab bar show the same list.
 */
export interface NavItem {
  to: '/' | '/projects' | '/settings';
  label: string;
  icon: LucideIcon;
  /** Paths that belong to this place, so it stays current on its sub-pages. */
  match: (path: string) => boolean;
}

const under = (prefixes: string[]) => (path: string) =>
  prefixes.some((p) => path === p || path.startsWith(`${p}/`));

export const navItems: NavItem[] = [
  { to: '/', label: 'Home', icon: House, match: (path) => path === '/' },
  {
    to: '/projects',
    label: 'Projects',
    icon: FolderKanban,
    match: under(['/projects']),
  },
  {
    to: '/settings',
    label: 'Settings',
    icon: Settings,
    match: under(['/settings', '/agents', '/audit', '/diagnostics']),
  },
];

const sections: [string, string][] = [
  ['/agents', 'Agents'],
  ['/audit', 'Audit log'],
  ['/diagnostics', 'Diagnostics'],
];

/** The name the top navigation bar shows for the current page. */
export function sectionName(path: string): string {
  for (const [prefix, name] of sections) if (under([prefix])(path)) return name;
  return navItems.find((item) => item.match(path))?.label ?? 'Staplr';
}
