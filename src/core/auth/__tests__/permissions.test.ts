import { describe, it, expect } from 'vitest';
import {
  type Permission,
  hasPermission,
  canRole,
  getRolePermissions,
  isGlobalPermission,
} from '../permissions';
import type { UserDoc } from '../types';
import { GLOBAL_BRANCH_ID } from '../../db/branch';

describe('Permissions Matrix & Authorization', () => {
  const ownerUser: UserDoc = {
    _id: 'user:admin',
    docType: 'user',
    branchId: GLOBAL_BRANCH_ID,
    username: 'admin',
    displayName: 'Super Admin',
    role: 'owner',
    branchIds: [],
    isActive: true,
    schemaVersion: 1,
    createdAt: '',
    updatedAt: '',
  };

  const managerUser: UserDoc = {
    _id: 'user:mgr1',
    docType: 'user',
    branchId: GLOBAL_BRANCH_ID,
    username: 'mgr_d1',
    displayName: 'Quản lý Q1',
    role: 'manager',
    branchIds: ['dist1'],
    isActive: true,
    schemaVersion: 1,
    createdAt: '',
    updatedAt: '',
  };

  const cashierUser: UserDoc = {
    _id: 'user:cashier1',
    docType: 'user',
    branchId: GLOBAL_BRANCH_ID,
    username: 'cashier_hq',
    displayName: 'Thu ngân HQ',
    role: 'cashier',
    branchIds: ['hq'],
    isActive: true,
    schemaVersion: 1,
    createdAt: '',
    updatedAt: '',
  };

  const kitchenUser: UserDoc = {
    _id: 'user:kitchen1',
    docType: 'user',
    branchId: GLOBAL_BRANCH_ID,
    username: 'kitchen_hq',
    displayName: 'Bếp HQ',
    role: 'kitchen',
    branchIds: ['hq'],
    isActive: true,
    schemaVersion: 1,
    createdAt: '',
    updatedAt: '',
  };

  it('identifies global permissions correctly', () => {
    expect(isGlobalPermission('manage_branches')).toBe(true);
    expect(isGlobalPermission('manage_type_registry')).toBe(true);
    expect(isGlobalPermission('view_cross_branch_reports')).toBe(true);
    expect(isGlobalPermission('manage_users')).toBe(true);
    expect(isGlobalPermission('create_order')).toBe(false);
    expect(isGlobalPermission('manage_shifts')).toBe(false);
  });

  it('grants owner all global and branch-level permissions across any branch', () => {
    expect(hasPermission(ownerUser, 'manage_branches')).toBe(true);
    expect(hasPermission(ownerUser, 'manage_type_registry')).toBe(true);
    expect(hasPermission(ownerUser, 'view_cross_branch_reports')).toBe(true);
    expect(hasPermission(ownerUser, 'manage_users')).toBe(true);
    expect(hasPermission(ownerUser, 'manage_inventory', { branchId: 'dist1' })).toBe(true);
    expect(hasPermission(ownerUser, 'create_order', { branchId: 'hq' })).toBe(true);
  });

  it('denies non-owner users from executing global permissions', () => {
    expect(hasPermission(managerUser, 'manage_branches')).toBe(false);
    expect(hasPermission(managerUser, 'manage_type_registry')).toBe(false);
    expect(hasPermission(managerUser, 'view_cross_branch_reports')).toBe(false);
    expect(hasPermission(managerUser, 'manage_users')).toBe(false);

    expect(hasPermission(cashierUser, 'manage_branches')).toBe(false);
    expect(hasPermission(kitchenUser, 'manage_branches')).toBe(false);
  });

  it('checks branch scoping for branch-level permissions', () => {
    // Manager has permission in dist1, but not in hq
    expect(hasPermission(managerUser, 'manage_inventory', { branchId: 'dist1' })).toBe(true);
    expect(hasPermission(managerUser, 'manage_inventory', { branchId: 'hq' })).toBe(false);

    // Cashier has create_order and manage_shifts in hq, but not in dist1
    expect(hasPermission(cashierUser, 'create_order', { branchId: 'hq' })).toBe(true);
    expect(hasPermission(cashierUser, 'create_order', { branchId: 'dist1' })).toBe(false);
    expect(hasPermission(cashierUser, 'manage_shifts', { branchId: 'hq' })).toBe(true);
    expect(hasPermission(cashierUser, 'manage_inventory', { branchId: 'hq' })).toBe(false);
  });

  it('checks role capabilities with canRole', () => {
    expect(canRole('owner', 'manage_branches')).toBe(true);
    expect(canRole('manager', 'manage_tables')).toBe(true);
    expect(canRole('manager', 'manage_branches')).toBe(false);
    expect(canRole('cashier', 'process_payment')).toBe(true);
    expect(canRole('cashier', 'void_refund')).toBe(false);
    expect(canRole('kitchen', 'view_kds')).toBe(true);
    expect(canRole('kitchen', 'process_payment')).toBe(false);
  });

  it('denies permissions if user is null or inactive', () => {
    expect(hasPermission(null, 'create_order')).toBe(false);

    const inactiveUser: UserDoc = {
      ...cashierUser,
      isActive: false,
    };
    expect(hasPermission(inactiveUser, 'create_order', { branchId: 'hq' })).toBe(false);
  });

  it('returns all assigned permissions for a role with getRolePermissions', () => {
    const cashierPerms = getRolePermissions('cashier');
    expect(cashierPerms).toContain('create_order');
    expect(cashierPerms).toContain('process_payment');
    expect(cashierPerms).toContain('manage_shifts');
    expect(cashierPerms).toContain('apply_discount');
    expect(cashierPerms).not.toContain('manage_branches');
  });
});
