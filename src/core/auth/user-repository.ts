import type { DbAdapter } from '../db/adapter';
import { createEnvelope } from '../db/envelope';
import { GLOBAL_BRANCH_ID } from '../db/branch';
import { userDocId } from '../db/ids';
import {
  USER_DOC_TYPE,
  type UserDoc,
  type CreateUserInput,
  type UpdateUserInput,
  type UserRole,
} from './types';
import {
  hashPassword,
  verifyPassword,
  hashPin,
  verifyPin,
  checkAuthRateLimit,
  recordFailedAuthAttempt,
  resetAuthAttempts,
} from './token';

export interface UpsertLogtoUserInput {
  sub: string;
  username?: string;
  displayName?: string;
  email?: string;
  role?: UserRole;
  branchIds?: string[];
}

export interface UserRepository {
  createUser(input: CreateUserInput): Promise<UserDoc>;
  updateUser(userIdOrDocId: string, input: UpdateUserInput): Promise<UserDoc>;
  getUser(userIdOrDocId: string): Promise<UserDoc | null>;
  getUserByUsername(username: string): Promise<UserDoc | null>;
  listUsers(options?: { includeInactive?: boolean }): Promise<UserDoc[]>;
  countOwners(): Promise<number>;
  authenticateLocal(
    username: string,
    passwordOrPin: string,
  ): Promise<{ success: boolean; user?: UserDoc; error?: string }>;
  upsertLogtoUser(input: UpsertLogtoUserInput): Promise<UserDoc>;
}

export function createUserRepository(
  adapter: DbAdapter,
  clock: () => string = () => new Date().toISOString(),
): UserRepository {
  function normalizeUsername(username: string): string {
    const trimmed = username.trim().toLowerCase();
    if (!trimmed) {
      throw new Error('createUser(): username is required');
    }
    return trimmed;
  }

  function resolveDocId(userIdOrDocId: string): string {
    if (userIdOrDocId.startsWith('user:')) {
      return userIdOrDocId;
    }
    return userDocId(userIdOrDocId);
  }

  return {
    async createUser(input: CreateUserInput): Promise<UserDoc> {
      const normalizedUsername = normalizeUsername(input.username);
      const docId = userDocId(normalizedUsername);

      const existing = await this.getUserByUsername(normalizedUsername);
      if (existing) {
        throw new Error(`User with username "${input.username}" already exists`);
      }

      const passwordHash = input.password ? hashPassword(input.password) : undefined;
      const pinHash = input.pin ? hashPin(input.pin) : undefined;

      const envelope = createEnvelope({
        id: docId,
        docType: USER_DOC_TYPE,
        branchId: GLOBAL_BRANCH_ID,
        now: clock(),
      });

      const userDoc: UserDoc = {
        ...envelope,
        branchId: GLOBAL_BRANCH_ID,
        username: input.username.trim(),
        displayName: input.displayName.trim() || input.username.trim(),
        role: input.role,
        branchIds: input.branchIds ? [...input.branchIds] : [],
        isActive: input.isActive ?? true,
        ...(passwordHash ? { passwordHash } : {}),
        ...(pinHash ? { pinHash } : {}),
        ...(input.authProvider ? { authProvider: input.authProvider } : { authProvider: 'local' }),
        ...(input.logtoSub ? { logtoSub: input.logtoSub } : {}),
        ...(input.email ? { email: input.email.trim() } : {}),
      };

      await adapter.put(userDoc);
      return userDoc;
    },

    async updateUser(userIdOrDocId: string, input: UpdateUserInput): Promise<UserDoc> {
      const docId = resolveDocId(userIdOrDocId);
      const existing = (await adapter.get(docId)) as UserDoc | null;

      if (!existing || existing.docType !== USER_DOC_TYPE) {
        throw new Error(`User "${userIdOrDocId}" not found`);
      }

      const updated: UserDoc = {
        ...existing,
        updatedAt: clock(),
        displayName: input.displayName !== undefined ? input.displayName.trim() : existing.displayName,
        role: input.role !== undefined ? input.role : existing.role,
        branchIds: input.branchIds !== undefined ? [...input.branchIds] : existing.branchIds,
        isActive: input.isActive !== undefined ? input.isActive : existing.isActive,
      };

      if (input.password !== undefined) {
        updated.passwordHash = input.password ? hashPassword(input.password) : undefined;
      }
      if (input.pin !== undefined) {
        updated.pinHash = input.pin ? hashPin(input.pin) : undefined;
      }
      if (input.email !== undefined) {
        updated.email = input.email.trim();
      }

      await adapter.put(updated);
      return updated;
    },

    async getUser(userIdOrDocId: string): Promise<UserDoc | null> {
      const docId = resolveDocId(userIdOrDocId);
      const doc = (await adapter.get(docId)) as UserDoc | null;
      if (!doc || doc.docType !== USER_DOC_TYPE) {
        return null;
      }
      return doc;
    },

    async getUserByUsername(username: string): Promise<UserDoc | null> {
      const normalized = username.trim().toLowerCase();
      const all = await this.listUsers({ includeInactive: true });
      return all.find((u) => u.username.toLowerCase() === normalized) ?? null;
    },

    async listUsers(options?: { includeInactive?: boolean }): Promise<UserDoc[]> {
      const docs = await adapter.allDocs({ branchId: GLOBAL_BRANCH_ID });
      const users = docs.filter(
        (d): d is UserDoc => d.docType === USER_DOC_TYPE && d.deletedAt === undefined,
      );

      if (options?.includeInactive) {
        return users;
      }
      return users.filter((u) => u.isActive);
    },

    async countOwners(): Promise<number> {
      const users = await this.listUsers({ includeInactive: false });
      return users.filter((u) => u.role === 'owner').length;
    },

    async authenticateLocal(
      username: string,
      passwordOrPin: string,
    ): Promise<{ success: boolean; user?: UserDoc; error?: string }> {
      const user = await this.getUserByUsername(username);
      if (!user || !user.isActive) {
        return { success: false, error: 'invalid_credentials' };
      }

      const rateLimit = checkAuthRateLimit(user._id);
      if (!rateLimit.allowed) {
        return {
          success: false,
          error: `locked_out:${rateLimit.remainingLockoutSeconds}`,
        };
      }

      let valid = false;
      if (user.passwordHash && verifyPassword(passwordOrPin, user.passwordHash)) {
        valid = true;
      } else if (user.pinHash && verifyPin(passwordOrPin, user.pinHash)) {
        valid = true;
      }

      if (!valid) {
        recordFailedAuthAttempt(user._id);
        return { success: false, error: 'invalid_credentials' };
      }

      resetAuthAttempts(user._id);
      return { success: true, user };
    },

    async upsertLogtoUser(input: UpsertLogtoUserInput): Promise<UserDoc> {
      const all = await this.listUsers({ includeInactive: true });
      let existing = all.find((u) => u.logtoSub === input.sub);

      const username = input.username?.trim() || input.sub;
      if (!existing) {
        existing = all.find((u) => u.username.toLowerCase() === username.toLowerCase());
      }

      if (existing) {
        const updated: UserDoc = {
          ...existing,
          branchId: GLOBAL_BRANCH_ID,
          authProvider: 'logto',
          logtoSub: input.sub,
          displayName: input.displayName?.trim() || existing.displayName,
          email: input.email ? input.email.trim() : existing.email,
          role: input.role || existing.role,
          updatedAt: clock(),
        };
        await adapter.put(updated);
        return updated;
      }

      const docId = userDocId(username.toLowerCase());
      const envelope = createEnvelope({
        id: docId,
        docType: USER_DOC_TYPE,
        branchId: GLOBAL_BRANCH_ID,
        now: clock(),
      });

      const userDoc: UserDoc = {
        ...envelope,
        branchId: GLOBAL_BRANCH_ID,
        username,
        displayName: input.displayName?.trim() || username,
        role: input.role || 'cashier',
        branchIds: input.branchIds ? [...input.branchIds] : [],
        isActive: true,
        authProvider: 'logto',
        logtoSub: input.sub,
        ...(input.email ? { email: input.email.trim() } : {}),
      };

      await adapter.put(userDoc);
      return userDoc;
    },
  };
}
