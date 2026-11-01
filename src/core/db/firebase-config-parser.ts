import type { FirestoreDbConfig } from './config';

export function parseFirebaseConfigSnippet(
  snippet: string,
): Partial<FirestoreDbConfig> | null {
  if (!snippet || typeof snippet !== 'string') {
    return null;
  }

  const trimmed = snippet.trim();
  if (!trimmed) {
    return null;
  }

  // 1. Try standard JSON.parse first
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object') {
      const res: Partial<FirestoreDbConfig> = { provider: 'firestore' };
      if (typeof parsed.apiKey === 'string') res.apiKey = parsed.apiKey;
      if (typeof parsed.authDomain === 'string') res.authDomain = parsed.authDomain;
      if (typeof parsed.projectId === 'string') res.projectId = parsed.projectId;
      if (typeof parsed.storageBucket === 'string') res.storageBucket = parsed.storageBucket;
      if (typeof parsed.messagingSenderId === 'string') res.messagingSenderId = parsed.messagingSenderId;
      if (typeof parsed.appId === 'string') res.appId = parsed.appId;
      if (typeof parsed.collectionName === 'string') res.collectionName = parsed.collectionName;

      if (res.apiKey || res.projectId) {
        return res;
      }
    }
  } catch {
    // Not valid JSON, try JS snippet parsing below
  }

  // 2. Extract key-value pairs from JS object syntax
  // Matches keys: apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId, collectionName
  const knownKeys = [
    'apiKey',
    'authDomain',
    'projectId',
    'storageBucket',
    'messagingSenderId',
    'appId',
    'collectionName',
  ];

  const result: Partial<FirestoreDbConfig> = { provider: 'firestore' };
  let matchesCount = 0;

  for (const key of knownKeys) {
    // Regex matches e.g. apiKey: "...", 'apiKey': '...', apiKey: `...`
    const regex = new RegExp(`['"]?${key}['"]?\\s*:\\s*['"\`]([^'"\`]+)['"\`]`);
    const match = trimmed.match(regex);
    if (match && match[1]) {
      (result as any)[key] = match[1].trim();
      matchesCount++;
    }
  }

  if (matchesCount > 0 && (result.apiKey || result.projectId)) {
    return result;
  }

  return null;
}
