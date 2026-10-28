import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isValidPort,
  checkPortAvailable,
  findAvailablePort,
  DEFAULT_BACKEND_PORT,
  MIN_PORT,
  MAX_PORT,
} from '../port-service';

describe('port-service', () => {
  describe('isValidPort', () => {
    it('returns true for ports in the safe range [1024, 65535]', () => {
      expect(isValidPort(1024)).toBe(true);
      expect(isValidPort(8080)).toBe(true);
      expect(isValidPort(3000)).toBe(true);
      expect(isValidPort(65535)).toBe(true);
    });

    it('returns false for privileged system ports (< 1024)', () => {
      expect(isValidPort(0)).toBe(false);
      expect(isValidPort(80)).toBe(false);
      expect(isValidPort(443)).toBe(false);
      expect(isValidPort(1023)).toBe(false);
      expect(isValidPort(-1)).toBe(false);
    });

    it('returns false for ports > 65535', () => {
      expect(isValidPort(65536)).toBe(false);
      expect(isValidPort(70000)).toBe(false);
    });

    it('returns false for non-integer or non-numeric values', () => {
      expect(isValidPort(8080.5)).toBe(false);
      expect(isValidPort(NaN)).toBe(false);
      expect(isValidPort('8080')).toBe(false);
      expect(isValidPort(null)).toBe(false);
      expect(isValidPort(undefined)).toBe(false);
    });
  });

  describe('checkPortAvailable', () => {
    it('returns false for invalid ports immediately', async () => {
      const checkFn = vi.fn();
      expect(await checkPortAvailable(80, { checkFn })).toBe(false);
      expect(await checkPortAvailable(70000, { checkFn })).toBe(false);
      expect(checkFn).not.toHaveBeenCalled();
    });

    it('uses custom checkFn when provided', async () => {
      const checkFn = vi.fn().mockImplementation((p: number) => p !== 8080);
      expect(await checkPortAvailable(8080, { checkFn })).toBe(false);
      expect(await checkPortAvailable(8081, { checkFn })).toBe(true);
      expect(checkFn).toHaveBeenCalledWith(8080);
      expect(checkFn).toHaveBeenCalledWith(8081);
    });

    it('calls Tauri invoke if running in Tauri desktop environment', async () => {
      const mockInvoke = vi.fn().mockResolvedValue(true);
      (globalThis as any).window = {
        __TAURI_INTERNALS__: { invoke: mockInvoke },
      };

      const result = await checkPortAvailable(8080);
      expect(result).toBe(true);
      expect(mockInvoke).toHaveBeenCalledWith('check_port_available', { port: 8080 });

      delete (globalThis as any).window;
    });
  });

  describe('findAvailablePort', () => {
    it('returns startPort when startPort is free', async () => {
      const checkFn = vi.fn().mockResolvedValue(true);
      const port = await findAvailablePort(8080, { checkFn });
      expect(port).toBe(8080);
    });

    it('skips occupied ports and returns first free port', async () => {
      // 8080 and 8081 are busy, 8082 is free
      const busy = new Set([8080, 8081]);
      const checkFn = vi.fn().mockImplementation((p: number) => !busy.has(p));

      const port = await findAvailablePort(8080, { checkFn });
      expect(port).toBe(8082);
    });

    it('resets invalid startPort to DEFAULT_BACKEND_PORT', async () => {
      const checkFn = vi.fn().mockResolvedValue(true);
      const port = await findAvailablePort(50, { checkFn });
      expect(port).toBe(DEFAULT_BACKEND_PORT);
    });

    it('uses custom findFn when provided', async () => {
      const findFn = vi.fn().mockResolvedValue(9999);
      const port = await findAvailablePort(8080, { findFn });
      expect(port).toBe(9999);
      expect(findFn).toHaveBeenCalledWith(8080);
    });

    it('calls Tauri invoke for find_available_port if running in Tauri', async () => {
      const mockInvoke = vi.fn().mockResolvedValue(8085);
      (globalThis as any).window = {
        __TAURI_INTERNALS__: { invoke: mockInvoke },
      };

      const port = await findAvailablePort(8080);
      expect(port).toBe(8085);
      expect(mockInvoke).toHaveBeenCalledWith('find_available_port', { startPort: 8080 });

      delete (globalThis as any).window;
    });
  });
});
