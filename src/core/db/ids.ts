function requireSegment(value: string, name: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${name} must be a non-empty string`);
  }
  if (value.includes(':')) {
    throw new Error(`${name} must not contain ":", got "${value}"`);
  }
  return value;
}

export function branchDocId(branchId: string): string {
  return `branch:${requireSegment(branchId, 'branchId')}`;
}

export function productDocId(productId: string): string {
  return `product:${requireSegment(productId, 'productId')}`;
}

export function productBranchOverrideId(productId: string, branchId: string): string {
  return `product_override:${requireSegment(branchId, 'branchId')}:${requireSegment(productId, 'productId')}`;
}
