export const THEME_COOKIE_NAME = 'dashboard-theme';

export type Theme = 'light' | 'dark';

export function parseTheme(value: string | undefined): Theme {
  return value === 'dark' ? 'dark' : 'light';
}

/** Client-safe cookie setter string (1 year, path=/). */
export function buildThemeCookie(theme: Theme): string {
  return `${THEME_COOKIE_NAME}=${theme}; path=/; max-age=31536000; SameSite=Lax`;
}
