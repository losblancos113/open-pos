import { sha256, base64urlEncode } from './token';

export interface LogtoClientConfig {
  endpoint: string;
  appId: string;
  redirectUri?: string;
  scopes?: string[];
}

export interface PkcePair {
  codeVerifier: string;
  codeChallenge: string;
}

export interface LogtoTokens {
  accessToken: string;
  idToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  tokenType?: string;
  scope?: string;
}

export interface LogtoUserInfo {
  sub: string;
  name?: string;
  username?: string;
  email?: string;
  roles?: string[];
  picture?: string;
  [key: string]: unknown;
}

export function generateCodeVerifier(length: number = 64): string {
  const bytes = new Uint8Array(length);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return base64urlEncode(bytes);
}

export function generateCodeChallenge(verifier: string): string {
  const encoded = new TextEncoder().encode(verifier);
  const hashed = sha256(encoded);
  return base64urlEncode(hashed);
}

export function generatePkcePair(length: number = 64): PkcePair {
  const codeVerifier = generateCodeVerifier(length);
  const codeChallenge = generateCodeChallenge(codeVerifier);
  return { codeVerifier, codeChallenge };
}

export function generateRandomState(byteLen: number = 16): string {
  return generateCodeVerifier(byteLen);
}

export interface LogtoClient {
  getSignInUrl(options: {
    state: string;
    codeChallenge: string;
    redirectUri?: string;
    scopes?: string[];
  }): string;

  exchangeCodeForTokens(
    code: string,
    codeVerifier: string,
    redirectUri?: string,
  ): Promise<LogtoTokens>;

  fetchUserInfo(accessToken: string): Promise<LogtoUserInfo>;
}

export function createLogtoClient(
  config: LogtoClientConfig,
  customFetch: typeof fetch = typeof fetch !== 'undefined' ? fetch : (async () => ({} as Response)),
): LogtoClient {
  const normalizedEndpoint = config.endpoint.replace(/\/+$/, '');

  return {
    getSignInUrl({ state, codeChallenge, redirectUri, scopes }) {
      const redirect = redirectUri || config.redirectUri || '';
      const scopeList = scopes || config.scopes || ['openid', 'profile', 'email', 'roles'];

      const url = new URL(`${normalizedEndpoint}/oidc/auth`);
      url.searchParams.set('client_id', config.appId);
      url.searchParams.set('redirect_uri', redirect);
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('scope', scopeList.join(' '));
      url.searchParams.set('state', state);
      url.searchParams.set('code_challenge', codeChallenge);
      url.searchParams.set('code_challenge_method', 'S256');

      return url.toString();
    },

    async exchangeCodeForTokens(code, codeVerifier, redirectUri) {
      const redirect = redirectUri || config.redirectUri || '';
      const tokenUrl = `${normalizedEndpoint}/oidc/token`;

      const body = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: config.appId,
        code,
        code_verifier: codeVerifier,
        redirect_uri: redirect,
      });

      const response = await customFetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      });

      const data = await response.json();
      if (!response.ok) {
        const errorMsg = data.error_description || data.error || 'Failed to exchange token';
        throw new Error(`Logto token exchange error: ${errorMsg}`);
      }

      return {
        accessToken: data.access_token,
        idToken: data.id_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in,
        tokenType: data.token_type,
        scope: data.scope,
      };
    },

    async fetchUserInfo(accessToken) {
      const userinfoUrl = `${normalizedEndpoint}/oidc/me`;

      const response = await customFetch(userinfoUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const data = await response.json();
      if (!response.ok) {
        const errorMsg = data.error_description || data.error || 'Failed to fetch user info';
        throw new Error(`Logto fetch user info error: ${errorMsg}`);
      }

      return data as LogtoUserInfo;
    },
  };
}
