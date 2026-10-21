export const SCHEMA_VERSION = 1;

export interface DocEnvelope<T extends string = string> {
  _id: string;
  _rev?: string;
  docType: T;
  branchId: string;
  schemaVersion: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface CreateEnvelopeParams<T extends string> {
  id: string;
  docType: T;
  branchId: string;
  now?: string;
}

/**
 * Tạo envelope cho mọi document. `branchId` là BẮT BUỘC — đây là điểm
 * enforce Risk #17 ngay tại tầng tạo doc, không phải ở tầng UI.
 */
export function createEnvelope<T extends string>(params: CreateEnvelopeParams<T>): DocEnvelope<T> {
  const { id, docType, branchId, now } = params;

  if (typeof id !== 'string' || id.trim() === '') {
    throw new Error('createEnvelope(): id must be a non-empty string');
  }
  if (typeof docType !== 'string' || docType.trim() === '') {
    throw new Error('createEnvelope(): docType must be a non-empty string');
  }
  if (typeof branchId !== 'string' || branchId.trim() === '') {
    throw new Error(
      'createEnvelope(): branchId is required on every document (see design doc Risk #17)',
    );
  }

  const timestamp = now ?? new Date().toISOString();

  return {
    _id: id,
    docType,
    branchId,
    schemaVersion: SCHEMA_VERSION,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
