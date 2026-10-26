import type { DbAdapter } from '../db/adapter';

export async function purgeExpiredGuestTokens(
  adapter: DbAdapter,
  now?: string,
): Promise<number> {
  const currentTime = now || new Date().toISOString();
  const allDocs = await adapter.allDocs({ includeGlobal: true });

  let purgedCount = 0;

  for (const doc of allDocs) {
    if (doc.deletedAt) continue;

    const raw = doc as unknown as { docType?: string; expiresAt?: string; _rev?: string };
    const isGuestOrAuthSession =
      raw.docType === 'guest_session' ||
      raw.docType === 'auth_session' ||
      doc._id.startsWith('guest_session:') ||
      doc._id.startsWith('auth_session:');

    if (isGuestOrAuthSession && raw.expiresAt && raw.expiresAt <= currentTime) {
      let rev = raw._rev;
      if (!rev) {
        const liveDoc = await adapter.get(doc._id);
        if (liveDoc?._rev) {
          rev = liveDoc._rev;
        }
      }
      if (rev) {
        await adapter.remove(doc._id, rev);
        purgedCount++;
      }
    }
  }

  return purgedCount;
}
