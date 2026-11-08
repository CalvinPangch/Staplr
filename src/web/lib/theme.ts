export type ThemeChoice = 'system' | 'light' | 'dark';

const storageKey = 'staplr-theme';

export function readTheme(): ThemeChoice {
  try {
    const stored = localStorage.getItem(storageKey);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    return 'system';
  }
}

function showTheme(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', choice);
}

/** Applies the remembered choice at start-up; storage may be unavailable. */
export function applyStoredTheme() {
  showTheme(readTheme());
}

export function saveTheme(choice: ThemeChoice) {
  showTheme(choice);
  try {
    if (choice === 'system') localStorage.removeItem(storageKey);
    else localStorage.setItem(storageKey, choice);
  } catch {
    /* the choice still applies for this visit */
  }
}
