import type { DocEnvelope } from '../db/envelope';
import type { GLOBAL_BRANCH_ID } from '../db/branch';

export const SYSTEM_CONFIG_DOC_TYPE = 'system_config';

export type AuthProviderMode = 'local' | 'logto' | 'both';

export interface LogtoConfig {
  endpoint: string;
  appId: string;
  redirectUri?: string;
  scopes?: string[];
  superAdminEmail?: string;
  superAdminSub?: string;
}

export interface SystemConfigDoc extends DocEnvelope<typeof SYSTEM_CONFIG_DOC_TYPE> {
  branchId: typeof GLOBAL_BRANCH_ID;
  isInitialized: boolean;
  storeName: string;
  defaultCurrency: string;
  primaryBranchId: string;
  authProviderMode: AuthProviderMode;
  logtoConfig?: LogtoConfig | undefined;
  initializedAt?: string | undefined;
}

export interface InitializeSystemInput {
  storeName: string;
  primaryBranchId: string;
  defaultCurrency?: string | undefined;
  authProviderMode: AuthProviderMode;
  logtoConfig?: LogtoConfig | undefined;
}

export interface UpdateSystemConfigInput {
  storeName?: string | undefined;
  defaultCurrency?: string | undefined;
  authProviderMode?: AuthProviderMode | undefined;
  logtoConfig?: LogtoConfig | undefined;
}
