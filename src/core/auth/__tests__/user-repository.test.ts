import { describe, it, expect, beforeEach } from 'vitest';
import { createMemoryAdapter } from '../../db/memory-adapter';
import type { DbAdapter } from '../../db/adapter';
import { createUserRepository, type UserRepository } from '../user-repository';
import { resetAuthAttempts } from '../token';

describe('UserRepository', () => {
  let adapter: DbAdapter;
  let repo: UserRepository;

  beforeEach(async () => {
    adapter = await createMemoryAdapter();
    repo = createUserRepository(adapter);
    resetAuthAttempts('user:admin');
    resetAuthAttempts('user:cashier1');
  });

  it('creates a user with hashed password and global branch scope', async () => {
    const user = await repo.createUser({
      username: 'admin',
      displayName: 'Super Admin',
      password: 'SuperPassword123!',
      pin: '1234',
      role: 'owner',
      branchIds: ['hq'],
    });

    expect(user._id).toBe('user:admin');
    expect(user.docType).toBe('user');
    expect(user.branchId).toBe('*');
    expect(user.username).toBe('admin');
    expect(user.displayName).toBe('Super Admin');
    expect(user.role).toBe('owner');
    expect(user.passwordHash).toMatch(/^pwd_v1\$/);
    expect(user.pinHash).toMatch(/^pin_v1\$/);
    expect(user.isActive).toBe(true);
  });

  it('rejects duplicate username', async () => {
    await repo.createUser({
      username: 'cashier1',
      displayName: 'Thu ngân 1',
      password: 'password123',
      role: 'cashier',
    });

    await expect(
      repo.createUser({
        username: 'CASHIER1', // case-insensitive check
        displayName: 'Thu ngân trùng',
        password: 'password456',
        role: 'cashier',
      }),
    ).rejects.toThrow(/already exists/i);
  });

  it('authenticates local user with correct password', async () => {
    await repo.createUser({
      username: 'manager1',
      displayName: 'Quản lý',
      password: 'ManagerSecretPassword!',
      role: 'manager',
      branchIds: ['hq'],
    });

    const res = await repo.authenticateLocal('manager1', 'ManagerSecretPassword!');
    expect(res.success).toBe(true);
    expect(res.user?.username).toBe('manager1');

    const wrongRes = await repo.authenticateLocal('manager1', 'WrongPassword');
    expect(wrongRes.success).toBe(false);
    expect(wrongRes.error).toBe('invalid_credentials');
  });

  it('authenticates local user with quick PIN', async () => {
    await repo.createUser({
      username: 'cashier_pin',
      displayName: 'Thu ngân PIN',
      password: 'PassWord123!',
      pin: '5678',
      role: 'cashier',
      branchIds: ['hq'],
    });

    // Login with PIN
    const pinRes = await repo.authenticateLocal('cashier_pin', '5678');
    expect(pinRes.success).toBe(true);
    expect(pinRes.user?.username).toBe('cashier_pin');
  });

  it('counts owners correctly', async () => {
    expect(await repo.countOwners()).toBe(0);

    await repo.createUser({
      username: 'admin',
      displayName: 'Super Admin',
      password: 'pass',
      role: 'owner',
    });
    expect(await repo.countOwners()).toBe(1);

    await repo.createUser({
      username: 'cashier',
      displayName: 'Cashier',
      password: 'pass',
      role: 'cashier',
    });
    expect(await repo.countOwners()).toBe(1);
  });

  it('upserts Logto user smoothly', async () => {
    const logtoUser = await repo.upsertLogtoUser({
      sub: 'logto_sub_12345',
      username: 'john_doe',
      displayName: 'John Doe',
      email: 'john@example.com',
      role: 'manager',
    });

    expect(logtoUser._id).toBe('user:john_doe');
    expect(logtoUser.authProvider).toBe('logto');
    expect(logtoUser.logtoSub).toBe('logto_sub_12345');
    expect(logtoUser.email).toBe('john@example.com');
    expect(logtoUser.role).toBe('manager');

    // Updating existing logto user
    const updated = await repo.upsertLogtoUser({
      sub: 'logto_sub_12345',
      username: 'john_doe',
      displayName: 'John Doe Updated',
      email: 'john_new@example.com',
    });

    expect(updated.displayName).toBe('John Doe Updated');
    expect(updated.email).toBe('john_new@example.com');
  });

  it('updates an existing user', async () => {
    const user = await repo.createUser({
      username: 'staff1',
      displayName: 'Nhân viên',
      password: 'oldpassword',
      pin: '1111',
      role: 'staff',
    });

    const updated = await repo.updateUser(user._id, {
      displayName: 'Nhân viên chính thức',
      password: 'newpassword',
      pin: '2222',
      role: 'waiter',
    });

    expect(updated.displayName).toBe('Nhân viên chính thức');
    expect(updated.role).toBe('waiter');

    const authOld = await repo.authenticateLocal('staff1', 'oldpassword');
    expect(authOld.success).toBe(false);

    const authNew = await repo.authenticateLocal('staff1', 'newpassword');
    expect(authNew.success).toBe(true);

    const authNewPin = await repo.authenticateLocal('staff1', '2222');
    expect(authNewPin.success).toBe(true);
  });
});
