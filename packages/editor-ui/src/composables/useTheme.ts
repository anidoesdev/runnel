import { ref } from 'vue';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'runnel.theme';

/**
 * The theme is per browser, not per account: it belongs to the device you're looking at, and
 * storing it server-side would make a shared login fight over it. Applied as `data-theme` on
 * <html>, which global.css's dark block keys off.
 *
 * Reads and writes are wrapped because storage throws in a private window with site data
 * blocked — losing the preference is fine, breaking the editor is not.
 */
const stored = ((): Theme | null => {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'dark' || value === 'light' ? value : null;
  } catch {
    return null;
  }
})();

const prefersDark = typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
const theme = ref<Theme>(stored ?? (prefersDark ? 'dark' : 'light'));

function apply(next: Theme): void {
  document.documentElement.setAttribute('data-theme', next);
}

export function useTheme() {
  return {
    theme,
    setTheme(next: Theme): void {
      theme.value = next;
      apply(next);
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // A remembered theme is a convenience; a blocked storage write must not break anything.
      }
    },
    /** Called once at startup so the first paint already has the right palette. */
    initTheme(): void {
      apply(theme.value);
    },
  };
}
