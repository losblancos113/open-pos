import { CosmosClient, type Container } from '@azure/cosmos';
import type { AllDocsOptions, DbAdapter } from './adapter';
import { GLOBAL_BRANCH_ID } from './branch';
import type { DocEnvelope } from './envelope';
import { registerDatabaseProvider } from './provider';
import type { CosmosDbConfig } from './config';

function statusOf(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const anyErr = error as { code?: unknown; statusCode?: unknown; status?: unknown };
  const s = anyErr.statusCode ?? anyErr.code ?? anyErr.status;
  return typeof s === 'number' ? s : undefined;
}

function requireBranchId(doc: DocEnvelope): void {
  if (typeof doc.branchId !== 'string' || doc.branchId.trim() === '') {
    throw new Error(
      'cosmos-adapter.put(): branchId is required on every document (see design doc Risk #17)',
    );
  }
}

function itemToEnvelope(item: any): DocEnvelope {
  const doc = { ...item };
  if (!doc._id && doc.id) {
    doc._id = doc.id;
  }
  if (doc._etag) {
    doc._rev = doc._etag;
  }
  return doc as DocEnvelope;
}

export async function createCosmosAdapterFromContainer(container: Container): Promise<DbAdapter> {
  const listeners = new Set<() => void>();

  function notifyListeners() {
    for (const listener of listeners) {
      try {
        listener();
      } catch (err) {
        console.error('cosmos-adapter subscriber error:', err);
      }
    }
  }

  const adapter: DbAdapter = {
    async get(id: string): Promise<DocEnvelope | null> {
      try {
        // Query by id to find the item regardless of partition
        const querySpec = {
          query: 'SELECT * FROM c WHERE c.id = @id',
          parameters: [{ name: '@id', value: id }],
        };
        const { resources } = await container.items.query(querySpec).fetchAll();
        const raw = resources[0];
        if (!raw) return null;

        const doc = itemToEnvelope(raw);
        if (doc.deletedAt !== undefined) return null;
        return doc;
      } catch (error) {
        if (statusOf(error) === 404) return null;
        throw error;
      }
    },

    async put(doc: DocEnvelope): Promise<DocEnvelope> {
      requireBranchId(doc);

      const itemPayload: any = {
        ...doc,
        id: doc._id,
      };

      const options: { accessCondition?: { type: string; condition: string } } = {};
      if (doc._rev !== undefined) {
        options.accessCondition = {
          type: 'IfMatch',
          condition: doc._rev,
        };
      }

      let savedResource: any;
      try {
        const response = await container.items.upsert(itemPayload, options);
        savedResource = response.resource;
        notifyListeners();
      } catch (error) {
        const status = statusOf(error);
        if (status === 409 || status === 412) {
          throw new Error(
            `cosmos-adapter.put(): conflict for ${doc._id} (got _rev ${doc._rev ?? 'undefined'})`,
          );
        }
        throw error;
      }

      return itemToEnvelope(savedResource);
    },

    async allDocs(options?: AllDocsOptions): Promise<DocEnvelope[]> {
      const branchId = options?.branchId;
      const includeGlobal = options?.includeGlobal === true;

      let querySpec: { query: string; parameters?: { name: string; value: any }[] };

      if (branchId !== undefined) {
        if (includeGlobal) {
          querySpec = {
            query: 'SELECT * FROM c WHERE c.branchId = @branchId OR c.branchId = @globalId',
            parameters: [
              { name: '@branchId', value: branchId },
              { name: '@globalId', value: GLOBAL_BRANCH_ID },
            ],
          };
        } else {
          querySpec = {
            query: 'SELECT * FROM c WHERE c.branchId = @branchId',
            parameters: [{ name: '@branchId', value: branchId }],
          };
        }
      } else {
        querySpec = {
          query: 'SELECT * FROM c',
        };
      }

      const { resources } = await container.items.query(querySpec).fetchAll();
      const out: DocEnvelope[] = [];

      for (const raw of resources) {
        const doc = itemToEnvelope(raw);
        if (doc.deletedAt !== undefined) continue;

        if (branchId !== undefined && doc.branchId !== branchId) {
          if (!(includeGlobal && doc.branchId === GLOBAL_BRANCH_ID)) continue;
        }

        out.push(doc);
      }

      return out;
    },

    async remove(id: string, rev: string): Promise<void> {
      // Find the item first to determine its partition key
      let existing: DocEnvelope | null = null;
      try {
        const querySpec = {
          query: 'SELECT * FROM c WHERE c.id = @id',
          parameters: [{ name: '@id', value: id }],
        };
        const { resources } = await container.items.query(querySpec).fetchAll();
        if (resources[0]) {
          existing = itemToEnvelope(resources[0]);
        }
      } catch {
        // Query error
      }

      if (!existing) {
        // Deleting non-existent document is a no-op matching contract
        return;
      }

      const options = {
        accessCondition: {
          type: 'IfMatch',
          condition: rev,
        },
      };

      try {
        await container.item(id, existing.branchId).delete(options);
        notifyListeners();
      } catch (error) {
        const status = statusOf(error);
        if (status === 404) return;
        if (status === 409 || status === 412) {
          throw new Error(`cosmos-adapter.remove(): conflict for ${id} (got _rev ${rev})`);
        }
        throw error;
      }
    },

    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };

  return adapter;
}

export async function createCosmosAdapter(config: CosmosDbConfig): Promise<DbAdapter> {
  const client = new CosmosClient({
    endpoint: config.endpoint,
    key: config.key,
  });

  const database = client.database(config.databaseId);
  const container = database.container(config.containerId);

  return createCosmosAdapterFromContainer(container);
}

// Auto-register in provider registry
registerDatabaseProvider('cosmos', createCosmosAdapter);
