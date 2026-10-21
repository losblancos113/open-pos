import { type Money, money } from './money';

/**
 * Chia `total` thành `weights.length` phần tỉ lệ với `weights`.
 * Phần dư được phân bổ theo phương pháp largest-remainder, phá vỡ thế bằng
 * chỉ số (index) tăng dần — nên kết quả luôn tất định (deterministic).
 * Bất biến: tổng các phần luôn bằng đúng `total`.
 */
export function allocate(total: Money, weights: number[]): Money[] {
  if (weights.length === 0) return [];

  for (const w of weights) {
    if (!Number.isFinite(w) || w < 0) {
      throw new Error(`allocate(): weight must be finite and non-negative, got ${w}`);
    }
  }

  const totalWeight = weights.reduce((acc, w) => acc + w, 0);
  if (totalWeight === 0) {
    return allocate(total, weights.map(() => 1));
  }

  const sign = total.minor < 0 ? -1 : 1;
  const absTotal = Math.abs(total.minor);

  const base = weights.map((w) => Math.floor((absTotal * w) / totalWeight));
  const remainders = weights.map((w, i) => ({ i, frac: (absTotal * w) % totalWeight }));

  let leftover = absTotal - base.reduce((acc, b) => acc + b, 0);

  const order = [...remainders].sort((a, b) => b.frac - a.frac || a.i - b.i);

  let k = 0;
  while (leftover > 0) {
    const target = order[k % order.length];
    if (target === undefined) break;
    base[target.i] = (base[target.i] ?? 0) + 1;
    leftover -= 1;
    k += 1;
  }

  return base.map((b) => money(sign * b, total.currency));
}

/** Chia đều `total` cho `parts` người. Phần dư dồn về các phần đầu. */
export function allocateEqual(total: Money, parts: number): Money[] {
  if (!Number.isInteger(parts) || parts < 0) {
    throw new Error(`allocateEqual(): parts must be a non-negative integer, got ${parts}`);
  }
  return allocate(total, Array.from({ length: parts }, () => 1));
}
