import type { DbAdapter } from '../db/adapter';
import { GLOBAL_BRANCH_ID } from '../db/branch';
import type { TypeDefinition, TypeDefinitionDoc } from '../types/definition';
import { SYSTEM_FIELD_KEYS } from '../types/definition';
import { assertValidTypeDefinition } from '../types/definition-validation';
import type { UpdateTypeInput, UpdateTypeOptions } from '../types/type-registry';
import { createTypeRegistry } from '../types/type-registry';
import { PRODUCT_SYSTEM_FIELDS } from './product';

/**
 * Product là một **type mở rộng được** của Type Registry (M1) — R1 nêu đúng ví dụ
 * "thêm field tuỳ chỉnh vào Product" (như *Độ cay*).
 *
 * Định nghĩa nằm ở `meta_types` với `kind: 'builtin_ext'`, `baseType: 'product'`.
 * `fields` của nó là **field tuỳ chỉnh**, không phải field hệ thống: `name`,
 * `basePrice`… là hình dạng cố định của document product (`product.ts`), admin không
 * khai báo lại được — đó là việc của `productTypeReservedKeys()`.
 */

export const PRODUCT_BASE_TYPE = 'product';

/**
 * Khoá mà field tuỳ chỉnh của product không được trùng: khoá envelope (`_id`, `_rev`…)
 * hợp với field hệ thống của product (`basePrice`, `name`…).
 */
export function productTypeReservedKeys(): readonly string[] {
  return [...SYSTEM_FIELD_KEYS, ...PRODUCT_SYSTEM_FIELDS];
}

/**
 * Chỉ nhận `builtin_ext` với `baseType: 'product'` và validate kèm khoá hệ thống.
 *
 * `validateTypeDefinition` không tự biết entity nào đang được mở rộng, nên nếu chỉ gọi
 * nó trần thì một field tên `basePrice` sẽ lọt qua — và sau đó ghi đè giá hệ thống.
 */
export function assertValidProductTypeDefinition(def: TypeDefinition): void {
  if (def.kind !== 'builtin_ext' || def.baseType !== PRODUCT_BASE_TYPE) {
    throw new Error(
      `Product type definition must be a builtin_ext with baseType "${PRODUCT_BASE_TYPE}", ` +
        `got kind ${JSON.stringify(def.kind)} and baseType ${JSON.stringify(def.baseType)}`,
    );
  }

  assertValidTypeDefinition(def, { reservedKeys: productTypeReservedKeys() });
}

/**
 * Trả về type definition của `product`, tạo mới (rỗng field) nếu chưa có.
 *
 * UI gọi hàm này để luôn có sẵn một definition mà sửa. Chạy được cả khi hai terminal
 * cùng tạo lần đầu: bên thua đọc lại bản của bên thắng thay vì nổ.
 */
export async function ensureProductTypeDefinition(
  adapter: DbAdapter,
  options?: { readonly now?: string },
): Promise<TypeDefinitionDoc> {
  const registry = createTypeRegistry(adapter);
  const existing = await registry.getType(PRODUCT_BASE_TYPE);
  if (existing !== null) return existing;

  try {
    return await registry.createType({
      key: PRODUCT_BASE_TYPE,
      kind: 'builtin_ext',
      baseType: PRODUCT_BASE_TYPE,
      name: { vi: 'Sản phẩm', en: 'Product' },
      // `meta_types` là metadata toàn hệ thống (M1, D3) — không thuộc riêng branch nào.
      branchId: GLOBAL_BRANCH_ID,
      ...(options?.now === undefined ? {} : { now: options.now }),
    });
  } catch (error) {
    const created = await registry.getType(PRODUCT_BASE_TYPE);
    if (created !== null) return created;
    throw error;
  }
}

/**
 * Đường ghi của type definition `product`: validate **trước khi** ghi, kèm khoá hệ thống.
 *
 * Gọi thẳng `typeRegistry.updateType` sẽ bỏ qua `assertValidProductTypeDefinition`, vì
 * registry không biết `baseType` nào có khoá hệ thống nào. Nên mọi đường sửa type của
 * product (kể cả từ Type Designer) phải đi qua đây.
 */
export async function saveProductTypeDefinition(
  adapter: DbAdapter,
  patch: UpdateTypeInput,
  options?: UpdateTypeOptions,
): Promise<TypeDefinitionDoc> {
  const current = await ensureProductTypeDefinition(adapter);

  // Validate hình dạng *sắp* ghi, không phải hình dạng đang có: nếu validate sau khi
  // `updateType` chạy thì document sai đã nằm trong store rồi.
  assertValidProductTypeDefinition({
    ...current,
    ...(patch.name === undefined ? {} : { name: patch.name }),
    ...(patch.fields === undefined ? {} : { fields: patch.fields }),
    ...(patch.listView === undefined ? {} : { listView: patch.listView }),
  });

  return createTypeRegistry(adapter).updateType(PRODUCT_BASE_TYPE, patch, options);
}
