import {
  Bot,
  FolderKanban,
  House,
  Settings,
  type LucideIcon,
} from 'lucide-react';

/**
 * The four top-level places (feature 004, FR-015a). The sidebar and the phone
 * tab bar show the same list; an Apple tab bar holds at most five.
 */
export interface NavItem {
  to: '/' | '/projects' | '/agents' | '/settings';
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
  { to: '/agents', label: 'Agents', icon: Bot, match: under(['/agents']) },
  {
    to: '/settings',
    label: 'Settings',
    icon: Settings,
    match: under(['/settings', '/audit', '/diagnostics']),
  },
];
