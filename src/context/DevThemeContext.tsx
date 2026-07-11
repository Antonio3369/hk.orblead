import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ALL_THEME_TOKEN_VARS, presetForMode, type ThemeMode } from "@/config/themeTokens";
import { useAuth } from "@/context/AuthContext";
import {
  applyThemeToDocument,
  clearDevThemeState,
  initDevThemeFromStorage,
  mergeTheme,
  resetThemeDocument,
  saveDevThemeState,
  type DevThemeState,
} from "@/utils/devTheme";

interface DevThemeContextValue {
  mode: ThemeMode;
  overrides: Record<string, string>;
  effective: Record<string, string>;
  setMode: (mode: ThemeMode) => void;
  setToken: (varName: string, value: string) => void;
  resetAll: () => void;
  resetToken: (varName: string) => void;
}

const DevThemeContext = createContext<DevThemeContextValue | null>(null);
const noopContext: DevThemeContextValue = {
  mode: "light",
  overrides: {},
  effective: presetForMode("light"),
  setMode: () => {},
  setToken: () => {},
  resetAll: () => {},
  resetToken: () => {},
};

export function DevThemeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [state, setState] = useState<DevThemeState>({ mode: "light", overrides: {} });
  const appliedRef = useRef<"admin" | "default" | null>(null);

  useEffect(() => {
    if (isAdmin) {
      setState(initDevThemeFromStorage());
      return;
    }
    setState({ mode: "light", overrides: {} });
    if (appliedRef.current !== "default") {
      resetThemeDocument();
      appliedRef.current = "default";
    }
  }, [isAdmin]);

  const effective = useMemo(
    () => mergeTheme(state.mode, state.overrides),
    [state.mode, state.overrides]
  );

  useEffect(() => {
    if (!isAdmin) return;
    applyThemeToDocument(effective, state.mode);
    saveDevThemeState(state);
    appliedRef.current = "admin";
  }, [effective, state.mode, state.overrides, isAdmin]);

  const setMode = useCallback((mode: ThemeMode) => {
    setState((prev) => ({ ...prev, mode }));
  }, []);

  const setToken = useCallback((varName: string, value: string) => {
    setState((prev) => ({
      ...prev,
      overrides: { ...prev.overrides, [varName]: value },
    }));
  }, []);

  const resetToken = useCallback((varName: string) => {
    setState((prev) => {
      const next = { ...prev.overrides };
      delete next[varName];
      return { ...prev, overrides: next };
    });
  }, []);

  const resetAll = useCallback(() => {
    clearDevThemeState();
    setState({ mode: "light", overrides: {} });
    applyThemeToDocument(presetForMode("light"), "light");
  }, []);

  const value = useMemo(
    () => ({
      mode: state.mode,
      overrides: state.overrides,
      effective,
      setMode,
      setToken,
      resetAll,
      resetToken,
    }),
    [state.mode, state.overrides, effective, setMode, setToken, resetAll, resetToken]
  );

  if (!isAdmin) {
    return <DevThemeContext.Provider value={noopContext}>{children}</DevThemeContext.Provider>;
  }

  return <DevThemeContext.Provider value={value}>{children}</DevThemeContext.Provider>;
}

export function useDevTheme(): DevThemeContextValue {
  const ctx = useContext(DevThemeContext);
  if (!ctx) throw new Error("useDevTheme must be used within DevThemeProvider");
  return ctx;
}

export function useDevThemeOptional(): DevThemeContextValue | null {
  return useContext(DevThemeContext);
}

export function isThemeTokenVar(name: string): boolean {
  return ALL_THEME_TOKEN_VARS.includes(name);
}
