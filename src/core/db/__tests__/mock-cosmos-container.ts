export interface MockCosmosItem {
  id: string;
  branchId: string;
  _etag: string;
  [key: string]: unknown;
}

export function createMemoryContainerMock() {
  const store = new Map<string, MockCosmosItem>();
  let etagCounter = 1;

  function makeKey(id: string, partitionKey: string): string {
    return `${partitionKey}::${id}`;
  }

  function nextEtag(): string {
    return `"${(etagCounter++).toString().padStart(8, '0')}"`;
  }

  return {
    _store: store,
    item(id: string, partitionKeyValue?: string) {
      return {
        async read() {
          // If partition key provided, search directly
          if (partitionKeyValue !== undefined) {
            const key = makeKey(id, partitionKeyValue);
            const found = store.get(key);
            if (!found) {
              const err = new Error('Resource Not Found');
              (err as any).code = 404;
              (err as any).statusCode = 404;
              throw err;
            }
            return { resource: { ...found } };
          }
          // Search across partitions
          for (const item of store.values()) {
            if (item.id === id) {
              return { resource: { ...item } };
            }
          }
          const err = new Error('Resource Not Found');
          (err as any).code = 404;
          (err as any).statusCode = 404;
          throw err;
        },
        async delete(options?: { accessCondition?: { type: string; condition: string } }) {
          let targetKey: string | undefined;
          let targetItem: MockCosmosItem | undefined;

          if (partitionKeyValue !== undefined) {
            targetKey = makeKey(id, partitionKeyValue);
            targetItem = store.get(targetKey);
          } else {
            for (const [k, v] of store.entries()) {
              if (v.id === id) {
                targetKey = k;
                targetItem = v;
                break;
              }
            }
          }

          if (!targetItem || !targetKey) {
            const err = new Error('Resource Not Found');
            (err as any).code = 404;
            (err as any).statusCode = 404;
            throw err;
          }

          if (options?.accessCondition?.condition) {
            if (targetItem._etag !== options.accessCondition.condition) {
              const err = new Error('Precondition Failed / Conflict');
              (err as any).code = 409;
              (err as any).statusCode = 409;
              throw err;
            }
          }

          store.delete(targetKey);
          return { resource: undefined };
        },
      };
    },
    items: {
      async upsert(body: any, options?: { accessCondition?: { type: string; condition: string } }) {
        const id = body.id || body._id;
        const branchId = body.branchId;
        const key = makeKey(id, branchId);
        const existing = store.get(key);

        if (options?.accessCondition?.condition) {
          if (!existing || existing._etag !== options.accessCondition.condition) {
            const err = new Error('Precondition Failed / Conflict');
            (err as any).code = 409;
            (err as any).statusCode = 409;
            throw err;
          }
        }

        const newEtag = nextEtag();
        const savedItem: MockCosmosItem = {
          ...body,
          id,
          _etag: newEtag,
        };
        store.set(key, savedItem);
        return { resource: { ...savedItem } };
      },
      query(querySpec: any) {
        return {
          async fetchAll() {
            let items = Array.from(store.values());
            if (typeof querySpec === 'object' && querySpec.parameters) {
              const params = querySpec.parameters as { name: string; value: any }[];
              const branchParam = params.find((p) => p.name === '@branchId');
              const idParam = params.find((p) => p.name === '@id');
              const globalParam = params.find((p) => p.name === '@globalId');
              const includeGlobal = globalParam !== undefined || querySpec.query?.includes("'*'");

              if (idParam) {
                items = items.filter((it) => it.id === idParam.value);
              }
              if (branchParam) {
                items = items.filter((it) => {
                  if (it.branchId === branchParam.value) return true;
                  if (includeGlobal && (it.branchId === '*' || it.branchId === globalParam?.value)) return true;
                  return false;
                });
              }
            }
            return { resources: items.map((it) => ({ ...it })) };
          },
        };
      },
    },
  };
}
