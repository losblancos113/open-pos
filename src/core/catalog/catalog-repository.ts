import type { DbAdapter } from '../db/adapter';
import type { DocEnvelope } from '../db/envelope';
import { GLOBAL_BRANCH_ID } from '../db/branch';
import type { Money } from '../money';
import type { LocalizedText } from '../types/definition';
import type { CategoryDoc, CreateCategoryInput } from './category';
import { CATEGORY_DOC_TYPE, createCategoryDoc, validateCategory } from './category';
import type { CreateProductInput, ProductDoc, ProductRecord, ProductVariant } from './product';
import { PRODUCT_DOC_TYPE, createProductDoc, normalizeBarcode, validateProduct } from './product';
import type { CreateModifierGroupInput, ModifierGroupDoc } from './modifier-group';
import {
  MODIFIER_GROUP_DOC_TYPE,
  createModifierGroupDoc,
  validateModifierGroup,
} from './modifier-group';
import type { ComboDoc, CreateComboInput } from './combo';
import { COMBO_DOC_TYPE, createComboDoc, validateCombo } from './combo';
import type { CreatePriceListInput, PriceListDoc } from './price-list';
import { PRICE_LIST_DOC_TYPE, createPriceListDoc, validatePriceList } from './price-list';
import type { ProductOverrideDoc, SetOverrideInput } from './override';
import {
  PRODUCT_OVERRIDE_DOC_TYPE,
  createOverrideDoc,
  overrideDocId,
  validateOverride,
} from './override';
import { assertNoIssues } from './validation';

/**
 * Cửa duy nhất để đọc/ghi catalog.
 *
 * Không có engine phức tạp nào ở tầng này — repository làm ba việc: (1) giữ bất biến
 * **giữa các document** (category/modifier/product được tham chiếu có thật không,
 * barcode có trùng không, variant có tồn tại không), (2) giữ `createdAt` và bump
 * `updatedAt`, (3) phát hiện ghi đè nhau qua `expectedRev`.
 *
 * Bất biến *trong* một document do các factory/validator của từng model lo (Task 4–6).
 * Chia như vậy để một mình `product.ts` vẫn kiểm chứng được mà không cần DB.
 *
 * Đọc/ghi ở **tầng global** dùng `branchId: GLOBAL_BRANCH_ID` và lọc
 * `allDocs({ includeGlobal: true })`; ở **tầng branch** lọc theo đúng branch đó —
 * nên chi nhánh này không bao giờ thấy giá riêng của chi nhánh khác.
 */

/** `now` do repository tự bơm — input từ ngoài không được đặt thời gian ghi. */
type CreateInput<T> = Omit<T, 'now'>;

export interface CategoryPatch {
  readonly name?: LocalizedText;
  readonly sortOrder?: number;
}

export interface ProductPatch {
  readonly name?: LocalizedText;
  readonly categoryId?: string | null;
  readonly basePrice?: Money;
  readonly unit?: string | null;
  readonly variants?: readonly ProductVariant[];
  readonly modifierGroupIds?: readonly string[];
  readonly barcode?: string | null;
  readonly imageRef?: string | null;
  readonly sku?: string | null;
  readonly sortOrder?: number;
  readonly isActive?: boolean;
}

export interface ModifierGroupPatch {
  readonly name?: LocalizedText;
  readonly options?: readonly CreateModifierGroupInput['options'][number][];
  readonly minSelect?: number;
  readonly maxSelect?: number;
  readonly sortOrder?: number;
}

export interface ComboPatch {
  readonly name?: LocalizedText;
  readonly basePrice?: Money;
  readonly comboGroups?: CreateComboInput['comboGroups'];
  readonly categoryId?: string | null;
  readonly imageRef?: string | null;
  readonly sortOrder?: number;
  readonly isActive?: boolean;
}

export interface PriceListPatch {
  readonly name?: LocalizedText;
  readonly effectiveFrom?: string;
  readonly effectiveTo?: string | null;
  readonly priority?: number;
  readonly entries?: CreatePriceListInput['entries'];
}

export interface CatalogRepository {
  // Category (global)
  createCategory(input: CreateInput<CreateCategoryInput>): Promise<CategoryDoc>;
  updateCategory(id: string, patch: CategoryPatch, expectedRev?: string): Promise<CategoryDoc>;
  listCategories(): Promise<readonly CategoryDoc[]>;
  removeCategory(id: string, expectedRev: string): Promise<void>;

  // Product (global)
  createProduct(input: CreateInput<CreateProductInput>): Promise<ProductRecord>;
  updateProduct(id: string, patch: ProductPatch, expectedRev?: string): Promise<ProductRecord>;
  getProduct(id: string): Promise<ProductRecord | null>;
  listProducts(): Promise<readonly ProductRecord[]>;
  removeProduct(id: string, expectedRev: string): Promise<void>;
  findByBarcode(barcode: string): Promise<ProductRecord | null>;

  // Modifier group (global)
  createModifierGroup(input: CreateInput<CreateModifierGroupInput>): Promise<ModifierGroupDoc>;
  updateModifierGroup(
    id: string,
    patch: ModifierGroupPatch,
    expectedRev?: string,
  ): Promise<ModifierGroupDoc>;
  listModifierGroups(): Promise<readonly ModifierGroupDoc[]>;
  removeModifierGroup(id: string, expectedRev: string): Promise<void>;

  // Combo (global)
  createCombo(input: CreateInput<CreateComboInput>): Promise<ComboDoc>;
  updateCombo(id: string, patch: ComboPatch, expectedRev?: string): Promise<ComboDoc>;
  listCombos(): Promise<readonly ComboDoc[]>;
  removeCombo(id: string, expectedRev: string): Promise<void>;

  // Price list (branch)
  createPriceList(input: CreateInput<CreatePriceListInput>): Promise<PriceListDoc>;
  updatePriceList(id: string, patch: PriceListPatch, expectedRev?: string): Promise<PriceListDoc>;
  listPriceLists(branchId: string): Promise<readonly PriceListDoc[]>;
  removePriceList(id: string, expectedRev: string): Promise<void>;

  // Product override (branch) — một document cho mỗi (product, branch)
  setOverride(input: SetOverrideInput): Promise<ProductOverrideDoc>;
  getOverride(productId: string, branchId: string): Promise<ProductOverrideDoc | null>;
  listOverrides(branchId: string): Promise<readonly ProductOverrideDoc[]>;
  clearOverride(productId: string, branchId: string): Promise<void>;
}

export function createCatalogRepository(
  adapter: DbAdapter,
  clock: () => string = () => new Date().toISOString(),
): CatalogRepository {
  async function readDoc<T extends DocEnvelope>(id: string, docType: string): Promise<T | null> {
    const doc = await adapter.get(id);
    if (doc === null || doc.docType !== docType) return null;
    return doc as T;
  }

  /** Ghi document mới, từ chối nếu `_id` đã có (kể cả document đã soft-delete). */
  async function insert<T extends DocEnvelope>(doc: T, label: string): Promise<T> {
    const existing = await adapter.get(doc._id);
    if (existing !== null) {
      throw new Error(
        `${label} ${JSON.stringify(doc._id)} already exists (created ${existing.createdAt})`,
      );
    }
    return (await adapter.put(doc)) as T;
  }

  async function update<T extends DocEnvelope>(
    id: string,
    docType: string,
    label: string,
    /**
     * `object` chứ không phải `Record<string, unknown>`: các interface patch
     * (`ProductPatch`…) không khai index signature nên không gán được vào `Record`,
     * dù chúng thật sự là các túi khoá–giá trị.
     */
    patch: object,
    expectedRev: string | undefined,
    validate: (next: T) => void,
  ): Promise<T> {
    const current = await readDoc<T>(id, docType);
    if (current === null) throw new Error(`${label} ${JSON.stringify(id)} not found`);

    if (expectedRev !== undefined && current._rev !== expectedRev) {
      throw new Error(
        `conflict: ${label} ${JSON.stringify(id)} has _rev ${current._rev ?? 'undefined'}, expected ${expectedRev}`,
      );
    }

    // `undefined` = giữ nguyên field; `null` = xoá field nullable (ý định rõ ràng).
    const merged: Record<string, unknown> = { ...(current as unknown as Record<string, unknown>) };
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined) merged[key] = value;
    }

    const next = { ...merged, _rev: current._rev, updatedAt: clock() } as unknown as T;
    validate(next);
    return (await adapter.put(next)) as T;
  }

  async function softDelete(id: string, docType: string, expectedRev: string): Promise<void> {
    const current = await readDoc(id, docType);
    if (current === null) return;
    if (current._rev !== expectedRev) {
      throw new Error(
        `conflict: ${docType} ${JSON.stringify(id)} has _rev ${current._rev ?? 'undefined'}, expected ${expectedRev}`,
      );
    }
    await adapter.put({ ...current, deletedAt: clock(), updatedAt: clock() });
  }

  async function globalDocs(docType: string): Promise<DocEnvelope[]> {
    const docs = await adapter.allDocs({ branchId: GLOBAL_BRANCH_ID });
    return docs.filter((doc) => doc.docType === docType);
  }

  async function branchDocs(docType: string, branchId: string): Promise<DocEnvelope[]> {
    const docs = await adapter.allDocs({ branchId });
    return docs.filter((doc) => doc.docType === docType);
  }

  // ---- Bất biến giữa các document -------------------------------------------

  async function assertCategoryExists(categoryId: string | null): Promise<void> {
    if (categoryId === null) return;
    const category = await readDoc(categoryId, CATEGORY_DOC_TYPE);
    if (category === null) throw new Error(`category ${JSON.stringify(categoryId)} not found`);
  }

  async function assertModifierGroupsExist(ids: readonly string[]): Promise<void> {
    for (const id of ids) {
      const group = await readDoc(id, MODIFIER_GROUP_DOC_TYPE);
      if (group === null) throw new Error(`modifier group ${JSON.stringify(id)} not found`);
    }
  }

  async function assertProductExists(productId: string): Promise<ProductDoc> {
    const product = await readDoc<ProductDoc>(productId, PRODUCT_DOC_TYPE);
    if (product === null) throw new Error(`product ${JSON.stringify(productId)} not found`);
    return product;
  }

  /**
   * Barcode phải không trùng với product nào **đang bán**. Sản phẩm ngừng bán hoặc đã
   * xoá không giữ chỗ: quán nhập lại mã vạch cho món mới cùng mã là chuyện bình thường.
   * `exceptId` để việc sửa giá một product có sẵn barcode không tự chặn chính nó.
   */
  async function assertBarcodeFree(barcode: string | null, exceptId?: string): Promise<void> {
    if (barcode === null) return;

    for (const doc of await globalDocs(PRODUCT_DOC_TYPE)) {
      if (doc._id === exceptId) continue;
      const product = doc as ProductDoc;
      if (product.isActive !== true) continue;
      if (normalizeBarcode(product.barcode) === barcode) {
        throw new Error(
          `barcode ${JSON.stringify(barcode)} is already used by product ${JSON.stringify(product._id)}`,
        );
      }
    }
  }

  /** Entry bảng giá trỏ tới một variant phải nằm trên chính product đó. */
  async function assertVariantExists(
    productId: string,
    variantId: string | null,
  ): Promise<ProductDoc> {
    const product = await assertProductExists(productId);
    if (variantId === null) return product;

    if (!product.variants.some((variant) => variant.id === variantId)) {
      throw new Error(
        `product ${JSON.stringify(productId)} has no variant ${JSON.stringify(variantId)}`,
      );
    }
    return product;
  }

  async function assertPriceListEntries(entries: PriceListDoc['entries']): Promise<void> {
    for (const entry of entries) {
      await assertVariantExists(entry.productId, entry.variantId);
    }
  }

  async function assertComboOptions(options: readonly { productId: string }[]): Promise<void> {
    for (const option of options) {
      // `assertProductExists` từ chối cả `combo:other`: nó đọc theo `_id` với docType product.
      await assertProductExists(option.productId);
    }
  }

  return {
    // ---- Category ----------------------------------------------------------

    async createCategory(input) {
      return insert(
        createCategoryDoc({ ...input, now: clock() }),
        'catalog_category',
      );
    },

    async updateCategory(id, patch, expectedRev) {
      const docId = `category:${id}`;
      return update<CategoryDoc>(docId, CATEGORY_DOC_TYPE, 'catalog_category', patch, expectedRev, (next) =>
        assertNoIssues(`catalog_category ${JSON.stringify(docId)}`, validateCategory(next)),
      );
    },

    async listCategories() {
      const docs = (await globalDocs(CATEGORY_DOC_TYPE)) as CategoryDoc[];
      return sortByOrderThenName(docs);
    },

    async removeCategory(id, expectedRev) {
      await softDelete(`category:${id}`, CATEGORY_DOC_TYPE, expectedRev);
    },

    // ---- Product -----------------------------------------------------------

    async createProduct(input) {
      await assertCategoryExists(input.categoryId ?? null);
      await assertModifierGroupsExist(input.modifierGroupIds ?? []);
      await assertBarcodeFree(normalizeBarcode(input.barcode));

      const doc = await insert(createProductDoc({ ...input, now: clock() }), 'catalog_product');
      // `ProductDoc` không có index signature nên không tự nhận là `ProductRecord`;
      // ép kiểu ở đúng ranh giới này (giống cách `record-repository.ts` của M1 làm).
      return doc as ProductRecord;
    },

    async updateProduct(id, patch, expectedRev) {
      const docId = `product:${id}`;

      if (patch.categoryId !== undefined) await assertCategoryExists(patch.categoryId);
      if (patch.modifierGroupIds !== undefined) await assertModifierGroupsExist(patch.modifierGroupIds);
      if (patch.barcode !== undefined) {
        await assertBarcodeFree(normalizeBarcode(patch.barcode), docId);
      }

      const next = await update<ProductDoc>(
        docId,
        PRODUCT_DOC_TYPE,
        'catalog_product',
        {
          ...patch,
          ...(patch.barcode === undefined ? {} : { barcode: normalizeBarcode(patch.barcode) }),
        },
        expectedRev,
        (doc) => assertNoIssues(`catalog_product ${JSON.stringify(docId)}`, validateProduct(doc)),
      );

      return next as ProductRecord;
    },

    async getProduct(id) {
      const doc = await readDoc<ProductDoc>(`product:${id}`, PRODUCT_DOC_TYPE);
      return doc === null ? null : (doc as ProductRecord);
    },

    async listProducts() {
      const docs = (await globalDocs(PRODUCT_DOC_TYPE)) as ProductDoc[];
      return sortByOrderThenName(docs) as ProductRecord[];
    },

    async removeProduct(id, expectedRev) {
      await softDelete(`product:${id}`, PRODUCT_DOC_TYPE, expectedRev);
    },

    async findByBarcode(barcode) {
      const wanted = normalizeBarcode(barcode);
      if (wanted === null) return null;

      for (const doc of await globalDocs(PRODUCT_DOC_TYPE)) {
        const product = doc as ProductDoc;
        if (product.isActive !== true) continue;
        if (normalizeBarcode(product.barcode) === wanted) return product as ProductRecord;
      }
      return null;
    },

    // ---- Modifier group ----------------------------------------------------

    async createModifierGroup(input) {
      return insert(createModifierGroupDoc({ ...input, now: clock() }), 'catalog_modifier_group');
    },

    async updateModifierGroup(id, patch, expectedRev) {
      const docId = `modifier_group:${id}`;
      return update<ModifierGroupDoc>(
        docId,
        MODIFIER_GROUP_DOC_TYPE,
        'catalog_modifier_group',
        patch,
        expectedRev,
        (next) =>
          assertNoIssues(`catalog_modifier_group ${JSON.stringify(docId)}`, validateModifierGroup(next)),
      );
    },

    async listModifierGroups() {
      const docs = (await globalDocs(MODIFIER_GROUP_DOC_TYPE)) as ModifierGroupDoc[];
      return sortByOrderThenName(docs);
    },

    async removeModifierGroup(id, expectedRev) {
      await softDelete(`modifier_group:${id}`, MODIFIER_GROUP_DOC_TYPE, expectedRev);
    },

    // ---- Combo -------------------------------------------------------------

    async createCombo(input) {
      if (input.categoryId !== undefined && input.categoryId !== null) {
        await assertCategoryExists(input.categoryId);
      }
      for (const group of input.comboGroups) {
        await assertComboOptions(group.options);
      }

      return insert(createComboDoc({ ...input, now: clock() }), 'catalog_combo');
    },

    async updateCombo(id, patch, expectedRev) {
      const docId = `combo:${id}`;

      if (patch.categoryId !== undefined) await assertCategoryExists(patch.categoryId);
      if (patch.comboGroups !== undefined) {
        for (const group of patch.comboGroups) {
          await assertComboOptions(group.options);
        }
      }

      return update<ComboDoc>(docId, COMBO_DOC_TYPE, 'catalog_combo', patch, expectedRev, (next) =>
        assertNoIssues(`catalog_combo ${JSON.stringify(docId)}`, validateCombo(next)),
      );
    },

    async listCombos() {
      const docs = (await globalDocs(COMBO_DOC_TYPE)) as ComboDoc[];
      return sortByOrderThenName(docs);
    },

    async removeCombo(id, expectedRev) {
      await softDelete(`combo:${id}`, COMBO_DOC_TYPE, expectedRev);
    },

    // ---- Price list --------------------------------------------------------

    async createPriceList(input) {
      await assertPriceListEntries(input.entries ?? []);
      return insert(createPriceListDoc({ ...input, now: clock() }), 'price_list');
    },

    async updatePriceList(id, patch, expectedRev) {
      const docId = `price_list:${id}`;
      if (patch.entries !== undefined) await assertPriceListEntries(patch.entries);

      return update<PriceListDoc>(
        docId,
        PRICE_LIST_DOC_TYPE,
        'price_list',
        patch,
        expectedRev,
        (next) => assertNoIssues(`price_list ${JSON.stringify(docId)}`, validatePriceList(next)),
      );
    },

    async listPriceLists(branchId) {
      const docs = (await branchDocs(PRICE_LIST_DOC_TYPE, branchId)) as PriceListDoc[];
      return [...docs].sort(
        (a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom) || a._id.localeCompare(b._id),
      );
    },

    async removePriceList(id, expectedRev) {
      await softDelete(`price_list:${id}`, PRICE_LIST_DOC_TYPE, expectedRev);
    },

    // ---- Product override --------------------------------------------------

    async setOverride(input) {
      if (input.branchId === GLOBAL_BRANCH_ID) {
        throw new Error(
          'setOverride(): an override must target a real branch, not the global tier',
        );
      }

      const docId = overrideDocId(input.productId, input.branchId);
      await assertProductExists(input.productId);

      const current = await readDoc<ProductOverrideDoc>(docId, PRODUCT_OVERRIDE_DOC_TYPE);

      if (current === null) {
        return insert(createOverrideDoc({ ...input, now: clock() }), 'product_override');
      }

      // `undefined` = giữ nguyên; `null` = xoá giá riêng (quay về giá global).
      const next: ProductOverrideDoc = {
        ...current,
        price: input.price === undefined ? current.price : input.price,
        available: input.available === undefined ? current.available : input.available,
        sortOrder: input.sortOrder === undefined ? current.sortOrder : input.sortOrder,
        updatedAt: clock(),
      };

      assertNoIssues(`product_override ${JSON.stringify(docId)}`, validateOverride(next));
      return (await adapter.put(next)) as ProductOverrideDoc;
    },

    async getOverride(productId, branchId) {
      return readDoc<ProductOverrideDoc>(overrideDocId(productId, branchId), PRODUCT_OVERRIDE_DOC_TYPE);
    },

    async listOverrides(branchId) {
      const docs = (await branchDocs(PRODUCT_OVERRIDE_DOC_TYPE, branchId)) as ProductOverrideDoc[];
      return [...docs].sort((a, b) => a._id.localeCompare(b._id));
    },

    /**
     * Xoá hẳn override (không soft-delete).
     *
     * Override là *cấu hình*, không phải chứng từ: xoá nghĩa là "món này ở chi nhánh này
     * quay về dùng giá chung", không có gì cần truy vết. Khác với product/category —
     * xoá món mà xoá cứng thì bill cũ mất tham chiếu.
     */
    async clearOverride(productId, branchId) {
      const docId = overrideDocId(productId, branchId);
      const current = await readDoc<ProductOverrideDoc>(docId, PRODUCT_OVERRIDE_DOC_TYPE);
      if (current === null || current._rev === undefined) return;
      await adapter.remove(docId, current._rev);
    },
  };
}

/** Thứ tự hiển thị ổn định: `sortOrder`, rồi tên tiếng Việt, rồi `_id`. */
function sortByOrderThenName<T extends { _id: string; sortOrder: number; name: LocalizedText }>(
  docs: readonly T[],
): T[] {
  return [...docs].sort(
    (a, b) =>
      a.sortOrder - b.sortOrder ||
      a.name.vi.localeCompare(b.name.vi) ||
      a._id.localeCompare(b._id),
  );
}
