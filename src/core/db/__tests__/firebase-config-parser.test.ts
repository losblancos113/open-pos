import { describe, it, expect } from 'vitest';
import { parseFirebaseConfigSnippet } from '../firebase-config-parser';

describe('parseFirebaseConfigSnippet', () => {
  it('parses valid JSON object', () => {
    const json = JSON.stringify({
      apiKey: 'AIzaSy123',
      authDomain: 'test.firebaseapp.com',
      projectId: 'test-project',
      appId: '1:123:web:456',
    });
    const parsed = parseFirebaseConfigSnippet(json);
    expect(parsed?.apiKey).toBe('AIzaSy123');
    expect(parsed?.projectId).toBe('test-project');
  });

  it('parses JavaScript snippet copied from Firebase Console', () => {
    const jsSnippet = `
      // Your web app's Firebase configuration
      const firebaseConfig = {
        apiKey: "AIzaSy456",
        authDomain: "mypos.firebaseapp.com",
        projectId: "mypos-shop",
        storageBucket: "mypos-shop.appspot.com",
        messagingSenderId: "987654321",
        appId: "1:987654321:web:fedcba",
      };
    `;
    const parsed = parseFirebaseConfigSnippet(jsSnippet);
    expect(parsed?.apiKey).toBe('AIzaSy456');
    expect(parsed?.projectId).toBe('mypos-shop');
    expect(parsed?.storageBucket).toBe('mypos-shop.appspot.com');
    expect(parsed?.messagingSenderId).toBe('987654321');
    expect(parsed?.appId).toBe('1:987654321:web:fedcba');
  });

  it('parses snippet with single quotes and unquoted keys', () => {
    const snippet = `
      {
        apiKey: 'AIzaSingleQuote',
        projectId: 'single-proj',
        authDomain: 'single.firebaseapp.com',
        appId: '1:single:web'
      }
    `;
    const parsed = parseFirebaseConfigSnippet(snippet);
    expect(parsed?.apiKey).toBe('AIzaSingleQuote');
    expect(parsed?.projectId).toBe('single-proj');
  });

  it('returns null for unparseable input', () => {
    expect(parseFirebaseConfigSnippet('hello world')).toBeNull();
    expect(parseFirebaseConfigSnippet('')).toBeNull();
  });
});
