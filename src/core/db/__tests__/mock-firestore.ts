export interface MockFirestoreDoc {
  id: string;
  data: Record<string, any>;
}

export function createMockFirestoreDb() {
  const store = new Map<string, Record<string, any>>();
  const listeners = new Set<() => void>();
  let revCounter = 1;

  function nextRev(): string {
    return `${revCounter++}-${Date.now().toString(36)}`;
  }

  function notify() {
    for (const l of listeners) {
      try {
        l();
      } catch (err) {
        console.error('mock firestore listener error:', err);
      }
    }
  }

  const ops = {
    doc(dbOrColl: any, id: string) {
      return { id, path: `${dbOrColl.name || 'openpos_documents'}/${id}` };
    },
    collection(db: any, name: string) {
      return { name };
    },
    where(field: string, op: string, value: any) {
      return { field, op, value };
    },
    query(collRef: any, ...constraints: any[]) {
      return { collRef, constraints };
    },
    async getDoc(docRef: any) {
      const data = store.get(docRef.id);
      return {
        id: docRef.id,
        exists: () => data !== undefined,
        data: () => (data ? { ...data } : undefined),
      };
    },
    async setDoc(docRef: any, data: any) {
      store.set(docRef.id, { ...data });
      notify();
    },
    async deleteDoc(docRef: any) {
      store.delete(docRef.id);
      notify();
    },
    async getDocs(queryOrColl: any) {
      let items = Array.from(store.values());
      const constraints = queryOrColl.constraints || [];

      for (const c of constraints) {
        if (c.op === '==') {
          items = items.filter((it) => it[c.field] === c.value);
        } else if (c.op === 'in') {
          items = items.filter((it) => Array.isArray(c.value) && c.value.includes(it[c.field]));
        }
      }

      return {
        docs: items.map((data) => ({
          id: data._id || data.id,
          data: () => ({ ...data }),
        })),
      };
    },
    onSnapshot(refOrQuery: any, callback: (snap: any) => void) {
      const wrapped = () => {
        callback({});
      };
      listeners.add(wrapped);
      return () => {
        listeners.delete(wrapped);
      };
    },
  };

  return {
    _store: store,
    ops,
    nextRev,
  };
}
