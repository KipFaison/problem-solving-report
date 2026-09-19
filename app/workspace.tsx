import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { getState, type WorkspaceState } from './api.ts';

// One source of truth for the page: the live workspace on the server. Every
// surface reads it from here, and every action that changes it calls refresh()
// afterwards, so saving an annotation on one tab shows up on the other two.

interface WorkspaceContext {
  state: WorkspaceState | null;
  error: string | null;
  refresh: () => Promise<void>;
}

const Context = createContext<WorkspaceContext | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WorkspaceState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setState(await getState());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return <Context.Provider value={{ state, error, refresh }}>{children}</Context.Provider>;
}

export function useWorkspace(): WorkspaceContext {
  const value = useContext(Context);
  if (!value) throw new Error('useWorkspace must be used inside WorkspaceProvider');
  return value;
}
