const RECOVERY_KEY = "syspatrimonio:module-load-recovery";
const RETRY_INTERVAL_MS = 60_000;

export function isModuleLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Loading chunk [\w-]+ failed/i.test(message);
}

/** Retry once per minute, preserving the route and preventing reload loops. */
export function recoverModuleLoad(error: unknown): boolean {
  if (!isModuleLoadError(error) || typeof window === "undefined") return false;
  if (window.navigator.onLine === false) return false;

  try {
    const now = Date.now();
    const previous = Number(window.sessionStorage.getItem(RECOVERY_KEY));
    if (previous > 0 && now - previous < RETRY_INTERVAL_MS) return false;
    // If storage is unavailable, do not reload: we cannot prevent a loop safely.
    window.sessionStorage.setItem(RECOVERY_KEY, String(now));
  } catch {
    return false;
  }

  window.location.reload();
  return true;
}
