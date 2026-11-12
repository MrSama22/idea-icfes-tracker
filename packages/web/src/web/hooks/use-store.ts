import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { store } from "../lib/store";

export function useDB() {
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}

export function useSimulacro(id: string) {
  const db = useDB();
  const simulacro = db.simulacros.find((s) => s.id === id) ?? null;
  const errores = useMemo(() => db.errores.filter((e) => e.simulacroId === id), [db.errores, id]);
  return { simulacro, errores, db };
}

/** Re-render periódico (para el temporizador). */
export function useNow(active: boolean, intervalMs = 250) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [active, intervalMs]);
  return active ? now : Date.now();
}
