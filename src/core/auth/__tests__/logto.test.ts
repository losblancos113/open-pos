import { describe, it, expect, vi } from 'vitest';
import {
  generateCodeVerifier,
  generateCodeChallenge,
  generatePkcePair,
  createLogtoClient,
  type LogtoClientConfig,
} from '../logto';

describe('Logto OIDC & PKCE Flow', () => {
  it('generates high entropy code verifier and code challenge', () => {
    const { codeVerifier, codeChallenge } = generatePkcePair();
    expect(codeVerifier.length).toBeGreaterThanOrEqual(43);
    expect(codeChallenge).toBeTruthy();
    expect(codeVerifier).not.toBe(codeChallenge);

    // Verify deterministic challenge generation from the same verifier
    const regenerated = generateCodeChallenge(codeVerifier);
    expect(regenerated).toBe(codeChallenge);
  });

  it('builds a valid Logto authorization URL with PKCE params', () => {
    const config: LogtoClientConfig = {
      endpoint: 'https://demo.logto.app',
      appId: 'open_pos_client_id',
      redirectUri: 'http://localhost:5173/callback',
      scopes: ['openid', 'profile', 'email'],
    };

    const client = createLogtoClient(config);
    const authUrl = client.getSignInUrl({
      state: 'random_state_123',
      codeChallenge: 'challenge_abc_xyz',
    });

    const parsed = new URL(authUrl);
    expect(parsed.origin).toBe('https://demo.logto.app');
    expect(parsed.pathname).toBe('/oidc/auth');
    expect(parsed.searchParams.get('client_id')).toBe('open_pos_client_id');
    expect(parsed.searchParams.get('redirect_uri')).toBe('http://localhost:5173/callback');
    expect(parsed.searchParams.get('response_type')).toBe('code');
    expect(parsed.searchParams.get('scope')).toBe('openid profile email');
    expect(parsed.searchParams.get('state')).toBe('random_state_123');
    expect(parsed.searchParams.get('code_challenge')).toBe('challenge_abc_xyz');
    expect(parsed.searchParams.get('code_challenge_method')).toBe('S256');
  });

  it('exchanges code for tokens using custom or mock fetch', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: 'mock_jwt_access_token',
        id_token: 'mock_id_token',
        expires_in: 3600,
        token_type: 'Bearer',
      }),
    });

    const client = createLogtoClient(
      {
        endpoint: 'https://demo.logto.app',
        appId: 'open_pos_client_id',
        redirectUri: 'http://localhost:5173/callback',
      },
      mockFetch as unknown as typeof fetch,
    );

    const tokens = await client.exchangeCodeForTokens('auth_code_789', 'verifier_xyz');
    expect(tokens.accessToken).toBe('mock_jwt_access_token');
    expect(tokens.idToken).toBe('mock_id_token');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://demo.logto.app/oidc/token',
      expect.objectContaining({
        method: 'POST',
      }),
    );
  });

  it('fetches user info using access token', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        sub: 'logto_user_001',
        name: 'Nguyễn Văn Chủ Quán',
        username: 'nguyen_owner',
        email: 'owner@openpos.vn',
        roles: ['admin', 'owner'],
      }),
    });

    const client = createLogtoClient(
      {
        endpoint: 'https://demo.logto.app',
        appId: 'open_pos_client_id',
      },
      mockFetch as unknown as typeof fetch,
    );

    const userInfo = await client.fetchUserInfo('mock_jwt_access_token');
    expect(userInfo.sub).toBe('logto_user_001');
    expect(userInfo.name).toBe('Nguyễn Văn Chủ Quán');
    expect(userInfo.username).toBe('nguyen_owner');
    expect(userInfo.email).toBe('owner@openpos.vn');
    expect(userInfo.roles).toEqual(['admin', 'owner']);
  });

  it('handles token exchange failure gracefully', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        error: 'invalid_grant',
        error_description: 'Code is expired or invalid',
      }),
    });

    const client = createLogtoClient(
      {
        endpoint: 'https://demo.logto.app',
        appId: 'open_pos_client_id',
      },
      mockFetch as unknown as typeof fetch,
    );

    await expect(client.exchangeCodeForTokens('bad_code', 'verifier')).rejects.toThrow(
      /Code is expired or invalid/,
    );
  });
});
