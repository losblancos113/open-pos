export const MIN_PORT = 1024;
export const MAX_PORT = 65535;
export const DEFAULT_BACKEND_PORT = 8080;

export interface PortServiceOptions {
  /** Optional custom port checker function (for tests or custom network strategies). */
  checkFn?: (port: number) => Promise<boolean> | boolean;
  /** Optional custom port finder function. */
  findFn?: (startPort: number) => Promise<number> | number;
}

/**
 * Validates if the given port is an integer in the safe non-privileged range [1024, 65535].
 */
export function isValidPort(port: unknown): port is number {
  return typeof port === 'number' && Number.isInteger(port) && port >= MIN_PORT && port <= MAX_PORT;
}

/**
 * Checks if a port is available on localhost.
 * In desktop Tauri, invokes the native TCP listener check.
 * In browser/tests, uses the configured checkFn or falls back to a network ping check.
 */
export async function checkPortAvailable(
  port: number,
  options: PortServiceOptions = {},
): Promise<boolean> {
  if (!isValidPort(port)) {
    return false;
  }

  if (options.checkFn) {
    return await options.checkFn(port);
  }

  // Check if running inside Tauri desktop shell
  if (typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__?.invoke) {
    try {
      return await (window as any).__TAURI_INTERNALS__.invoke('check_port_available', { port });
    } catch {
      // Fallback if invoke fails
    }
  }

  // In standard browser / fallback without Tauri:
  // We can probe via fetch with an AbortSignal timeout.
  if (typeof fetch !== 'undefined') {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 200);
      const res = await fetch(`http://127.0.0.1:${port}/api/health`, {
        signal: controller.signal,
        mode: 'no-cors',
      }).catch(() => null);
      clearTimeout(timeoutId);
      // If res is null or undefined (e.g. ECONNREFUSED/aborted), port is not responding -> available
      if (!res) {
        return true;
      }
      // If fetch succeeded with response, something is listening on this port
      return false;
    } catch {
      // Connection refused or timed out -> likely port is available
      return true;
    }
  }

  return true;
}

/**
 * Finds the first available port starting from `startPort` (default: 8080).
 */
export async function findAvailablePort(
  startPort = DEFAULT_BACKEND_PORT,
  options: PortServiceOptions = {},
): Promise<number> {
  const normalizedStart = isValidPort(startPort) ? startPort : DEFAULT_BACKEND_PORT;

  if (options.findFn) {
    return await options.findFn(normalizedStart);
  }

  // Check if running inside Tauri desktop shell
  if (typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__?.invoke) {
    try {
      return await (window as any).__TAURI_INTERNALS__.invoke('find_available_port', {
        startPort: normalizedStart,
      });
    } catch {
      // Fallback if invoke fails
    }
  }

  // Scan sequentially from normalizedStart up to MAX_PORT
  for (let p = normalizedStart; p <= MAX_PORT; p++) {
    const free = await checkPortAvailable(p, options);
    if (free) {
      return p;
    }
  }

  // If upper range is exhausted, scan from MIN_PORT up to normalizedStart - 1
  for (let p = MIN_PORT; p < normalizedStart; p++) {
    const free = await checkPortAvailable(p, options);
    if (free) {
      return p;
    }
  }

  return normalizedStart;
}
