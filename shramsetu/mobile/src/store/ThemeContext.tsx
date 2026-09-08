import AsyncStorage from "@react-native-async-storage/async-storage";
import { useColorScheme as useNativeWindColorScheme } from "nativewind";
import { createContext, useContext, useEffect, useState, ReactNode } from "react";

type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);
const STORAGE_KEY = "shramsetu_theme";

// Wraps NativeWind's own colorScheme control (which drives `dark:` classes
// throughout the app) with AsyncStorage persistence, so the user's choice
// survives app restarts instead of just following the OS setting.
export function ThemeProvider({ children }: { children: ReactNode }) {
  const { colorScheme, setColorScheme } = useNativeWindColorScheme();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored === "light" || stored === "dark") setColorScheme(stored);
      setReady(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setTheme = (t: Theme) => {
    setColorScheme(t);
    AsyncStorage.setItem(STORAGE_KEY, t);
  };
  const toggleTheme = () => setTheme(colorScheme === "dark" ? "light" : "dark");

  if (!ready) return null;

  return (
    <ThemeContext.Provider value={{ theme: (colorScheme ?? "light") as Theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
