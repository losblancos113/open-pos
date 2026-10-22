import { add, money } from '../money';
import type { Money } from '../money';
import type { ProductDoc } from './product';
import type { PriceListDoc } from './price-list';
import { priceListEntry } from './price-list';
import type { ProductOverrideDoc } from './override';

/**
 * Giá bán của một sản phẩm tại một chi nhánh.
 *
 * Đây là **hàm duy nhất** mà màn hình bán hàng được hỏi giá (M3 sẽ gọi cho từng dòng
 * bill). Mọi thứ khác — override theo chi nhánh, bảng giá giờ vàng, giá gốc — chỉ là
 * đầu vào của hàm này, nên chỉ có một chỗ để sai và một chỗ để test.
 */

export type PriceSourceKind = 'override' | 'price_list' | 'base';

export interface ResolvedPrice {
  readonly price: Money;
  /** Giá đến từ đâu — UI hiện nhãn, báo cáo đối chiếu. */
  readonly source: PriceSourceKind;
}

export interface PriceContext {
  readonly product: ProductDoc;
  readonly override: ProductOverrideDoc | null;
  /** Bảng giá **đang áp** — chọn bằng `activePriceList()` trước khi gọi. */
  readonly priceList: PriceListDoc | null;
}

/**
 * Giá của một sản phẩm, kèm kích cỡ, theo thứ tự tầng của §4.7:
 *
 * 1. `override.price` của chi nhánh — coi là giá product-level, **cộng** delta variant;
 * 2. entry bảng giá theo **variant** — giá tuyệt đối, không cộng delta;
 * 3. entry bảng giá theo **product** — cộng delta variant;
 * 4. `product.basePrice` — cộng delta variant.
 *
 * Vì sao entry theo variant là tuyệt đối còn entry theo product lại cộng delta: người
 * nhập giá theo variant đã nói đúng con số của kích cỡ đó ("Tô lớn 75k"); người nhập
 * giá theo product chỉ nói giá nền, còn kích cỡ vẫn phải chênh nhau như cấu hình món.
 *
 * Ném lỗi khi: `variantId` không tồn tại trên sản phẩm (lỗi lập trình), tiền tệ lệch
 * với tiền tệ của sản phẩm, hoặc giá kết quả âm. Giá âm đã bị repository chặn từ lúc
 * lưu; chốt ở đây là để một document hỏng từ sync không bao giờ thành dòng bill.
 */
export function resolveProductPrice(
  context: PriceContext,
  variantId: string | null,
): ResolvedPrice {
  const { product, override, priceList } = context;

  const variant = variantId === null ? null : (product.variants.find((v) => v.id === variantId) ?? null);
  if (variantId !== null && variant === null) {
    throw new Error(
      `resolveProductPrice(): product ${JSON.stringify(product._id)} has no variant ${JSON.stringify(variantId)}`,
    );
  }

  const delta = variant?.priceDelta ?? money(0, product.basePrice.currency);
  const where =
    variantId === null
      ? `product ${JSON.stringify(product._id)}`
      : `product ${JSON.stringify(product._id)} variant ${JSON.stringify(variantId)}`;

  const resolved = (price: Money, source: PriceSourceKind): ResolvedPrice => {
    // Entry theo variant trả giá **tuyệt đối**, không đi qua `add()`, nên tiền tệ của nó
    // không được kiểm ở đâu khác. Một entry USD trên món VND sẽ thành dòng bill USD.
    if (price.currency !== product.basePrice.currency) {
      throw new Error(
        `resolveProductPrice(): currency mismatch for ${where}: ` +
          `product is ${product.basePrice.currency} but the ${source} price is ${price.currency}`,
      );
    }
    if (price.minor < 0) {
      throw new Error(
        `resolveProductPrice(): resolved price for ${where} is negative (${price.minor} ${price.currency})`,
      );
    }
    return { price, source };
  };

  const overridePrice = override?.price ?? null;
  if (overridePrice !== null) {
    return resolved(add(overridePrice, delta), 'override');
  }

  const entry = priceList === null ? null : priceListEntry(priceList, product._id, variantId);
  if (entry !== null) {
    return resolved(entry.variantId === null ? add(entry.price, delta) : entry.price, 'price_list');
  }

  return resolved(add(product.basePrice, delta), 'base');
}
