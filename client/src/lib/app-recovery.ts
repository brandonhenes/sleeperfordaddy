const RECOVERY_STORAGE_KEY = "edge-app-recovery-attempted-at";
const RECOVERY_COOLDOWN_MS = 15_000;

const RECOVERABLE_ERROR_PATTERNS = [
  /failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /importing a module script failed/i,
  /failed to load module script/i,
  /loading chunk \d+ failed/i,
  /chunkloaderror/i,
  /script error/i,
];

function describeError(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return `${error.name} ${error.message}`;
  if (error && typeof error === "object") {
    const maybeError = error as { message?: unknown; reason?: unknown; target?: unknown };
    const parts = [maybeError.message, maybeError.reason].filter(Boolean);
    if (parts.length > 0) return parts.map(String).join(" ");
  }
  return "";
}

function isAssetElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === "SCRIPT" || target.tagName === "LINK";
}

function canAttemptRecovery(): boolean {
  try {
    const lastAttempt = Number(window.sessionStorage.getItem(RECOVERY_STORAGE_KEY) ?? "0");
    return !lastAttempt || Date.now() - lastAttempt > RECOVERY_COOLDOWN_MS;
  } catch {
    return true;
  }
}

function markRecoveryAttempted() {
  try {
    window.sessionStorage.setItem(RECOVERY_STORAGE_KEY, String(Date.now()));
  } catch {
    // Storage can be unavailable in private or locked-down webviews.
  }
}

export function isRecoverableAppLoadError(error: unknown): boolean {
  const message = describeError(error);
  return RECOVERABLE_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

export async function clearAppRuntimeCaches() {
  const cacheNames = "caches" in window ? await window.caches.keys() : [];
  await Promise.all(cacheNames.map((name) => window.caches.delete(name)));

  if ("serviceWorker" in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
  }
}

export async function recoverFromAppLoadError(force = false) {
  if (!force && !canAttemptRecovery()) return false;
  markRecoveryAttempted();
  await clearAppRuntimeCaches();
  window.location.reload();
  return true;
}

export function installAppRecoveryListeners() {
  window.addEventListener(
    "error",
    (event) => {
      if (!isAssetElement(event.target) && !isRecoverableAppLoadError(event.error ?? event.message)) {
        return;
      }
      void recoverFromAppLoadError();
    },
    true,
  );

  window.addEventListener("unhandledrejection", (event) => {
    if (!isRecoverableAppLoadError(event.reason)) return;
    event.preventDefault();
    void recoverFromAppLoadError();
  });
}
