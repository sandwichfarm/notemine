import { createContext, useContext, ParentComponent, createSignal, onMount, createEffect } from 'solid-js';

type Theme = 'light' | 'dark';

interface ThemeContextValue {
  theme: () => Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>();

export const ThemeProvider: ParentComponent = (props) => {
  // Detect system preference
  const getSystemTheme = (): Theme => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'dark';
  };

  // Load from localStorage or use system preference
  const getInitialTheme = (): Theme => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('theme') as Theme;
      if (stored) return stored;
    }
    return getSystemTheme();
  };

  const [theme, setThemeSignal] = createSignal<Theme>(getInitialTheme());

  const setTheme = (newTheme: Theme) => {
    setThemeSignal(newTheme);
    if (typeof window !== 'undefined') {
      localStorage.setItem('theme', newTheme);
    }
  };

  const toggleTheme = () => {
    setTheme(theme() === 'light' ? 'dark' : 'light');
  };

  // Apply theme to document
  createEffect(() => {
    if (typeof document !== 'undefined') {
      const html = document.documentElement;
      if (theme() === 'dark') {
        html.classList.add('dark');
      } else {
        html.classList.remove('dark');
      }
    }
  });

  // Listen for system theme changes
  onMount(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = (e: MediaQueryListEvent) => {
        // Only update if no theme is stored (respecting user choice)
        if (!localStorage.getItem('theme')) {
          setTheme(e.matches ? 'dark' : 'light');
        }
      };
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  });

  const value: ThemeContextValue = {
    theme,
    setTheme,
    toggleTheme,
  };

  return (
    <ThemeContext.Provider value={value}>
      {props.children}
    </ThemeContext.Provider>
  );
};

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}
