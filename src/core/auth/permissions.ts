import type { UserDoc, UserRole } from './types';

export type GlobalPermission =
  | 'manage_branches'
  | 'manage_type_registry'
  | 'view_cross_branch_reports'
  | 'manage_system_settings'
  | 'manage_users';

export type BranchPermission =
  | 'manage_catalog'
  | 'override_price'
  | 'manage_inventory'
  | 'view_store_reports'
  | 'manage_tables'
  | 'void_refund'
  | 'configure_bank_account'
  | 'manage_shifts'
  | 'apply_discount'
  | 'create_order'
  | 'process_payment'
  | 'view_kds';

export type Permission = GlobalPermission | BranchPermission;

const GLOBAL_PERMISSIONS: Set<GlobalPermission> = new Set([
  'manage_branches',
  'manage_type_registry',
  'view_cross_branch_reports',
  'manage_system_settings',
  'manage_users',
]);

export function isGlobalPermission(permission: Permission): permission is GlobalPermission {
  return GLOBAL_PERMISSIONS.has(permission as GlobalPermission);
}

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  owner: [
    'manage_branches',
    'manage_type_registry',
    'view_cross_branch_reports',
    'manage_system_settings',
    'manage_users',
    'manage_catalog',
    'override_price',
    'manage_inventory',
    'view_store_reports',
    'manage_tables',
    'void_refund',
    'configure_bank_account',
    'manage_shifts',
    'apply_discount',
    'create_order',
    'process_payment',
    'view_kds',
  ],
  manager: [
    'manage_catalog',
    'override_price',
    'manage_inventory',
    'view_store_reports',
    'manage_tables',
    'void_refund',
    'configure_bank_account',
    'manage_shifts',
    'apply_discount',
    'create_order',
    'process_payment',
    'view_kds',
  ],
  cashier: [
    'manage_shifts',
    'apply_discount',
    'create_order',
    'process_payment',
  ],
  waiter: [
    'create_order',
  ],
  kitchen: [
    'view_kds',
  ],
  staff: [
    'create_order',
  ],
};

export function canRole(role: UserRole, permission: Permission): boolean {
  const perms = ROLE_PERMISSIONS[role];
  if (!perms) return false;
  return perms.includes(permission);
}

export function getRolePermissions(role: UserRole): Permission[] {
  return ROLE_PERMISSIONS[role] ? [...ROLE_PERMISSIONS[role]] : [];
}

export interface PermissionContext {
  branchId?: string;
}

export function hasPermission(
  user: UserDoc | null,
  permission: Permission,
  context?: PermissionContext,
): boolean {
  if (!user || !user.isActive) {
    return false;
  }

  // Owner has absolute permission for everything, anywhere
  if (user.role === 'owner') {
    return true;
  }

  // Global permissions are strictly restricted to owner
  if (isGlobalPermission(permission)) {
    return false;
  }

  // Check if user's role has the requested permission
  if (!canRole(user.role, permission)) {
    return false;
  }

  // If a branchId is specified in context, user must have access to that branch
  if (context?.branchId) {
    if (!user.branchIds.includes(context.branchId)) {
      return false;
    }
  }

  return true;
}
