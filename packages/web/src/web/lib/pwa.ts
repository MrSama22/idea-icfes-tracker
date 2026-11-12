// Instalación como app + almacenamiento persistente en el dispositivo.
import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

if (typeof window !== "undefined") {
  // Solo en producción: en desarrollo el SW interferiría con la recarga en caliente
  if ("serviceWorker" in navigator && import.meta.env.PROD) {
    window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
  }
  // Pide al navegador no borrar los datos guardados en este dispositivo
  navigator.storage?.persist?.().catch(() => {});

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    listeners.forEach((l) => l());
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    listeners.forEach((l) => l());
  });
}

export const isStandalone = () =>
  typeof window !== "undefined" &&
  (window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true);

export const isIOS = () => typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);

export function useInstall() {
  const [, force] = useState(0);
  const [persistido, setPersistido] = useState<boolean | null>(null);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    navigator.storage?.persisted?.().then(setPersistido).catch(() => setPersistido(null));
    return () => {
      listeners.delete(l);
    };
  }, []);
  return {
    instalada: isStandalone(),
    puedeInstalar: !!deferred,
    ios: isIOS(),
    persistido,
    instalar: async () => {
      if (!deferred) return;
      await deferred.prompt();
      await deferred.userChoice;
      deferred = null;
      force((n) => n + 1);
    },
  };
}
