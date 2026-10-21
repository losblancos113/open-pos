import type { Money } from '../money';
import {
  add as moneyAdd,
  minorUnitsPerMajor,
  money,
  mulRational,
  sub as moneySub,
} from '../money';
import type { FieldDefinition } from './definition';
import type { FormulaNode, ParsedFormula } from './formula';
import type { Rational } from './rational';
import { rat, ratAdd, ratCmp, ratDiv, ratMul, ratRound, ratSub } from './rational';

/**
 * Giá trị mà formula hiểu được. Chỉ ba loại này tham gia được vào formula (quyết định D4):
 * `text`, `date`, `reference`… không có mặt ở đây, và `formulaValueOf` trả `null` cho chúng.
 */
export type FormulaValue =
  | { readonly kind: 'number'; readonly value: Rational }
  | { readonly kind: 'money'; readonly money: Money }
  | { readonly kind: 'boolean'; readonly value: boolean };

type CompareOperator = '<' | '<=' | '>' | '>=' | '==' | '!=';

function typeError(detail: string): Error {
  return new Error(`Formula type error: ${detail}`);
}

function describeValue(value: FormulaValue): string {
  switch (value.kind) {
    case 'number':
      return 'number';
    case 'money':
      return 'money';
    case 'boolean':
      return 'boolean';
  }
}

/** Giá trị đơn vị lớn của money dưới dạng hữu tỉ — dùng cho so sánh và `round()`. */
function moneyToRational(m: Money): Rational {
  return rat(m.minor, minorUnitsPerMajor(m.currency));
}

/** Chia lấy phần nguyên chính xác: `n - (n % d)` luôn chia hết cho `d`. */
function integerQuotient(n: number, d: number): number {
  return (n - (n % d)) / d;
}

/** Phần dư hữu tỉ. Chỉ dùng cho `number` — money lấy dư không có nghĩa nghiệp vụ ở v1. */
function ratRemainder(a: Rational, b: Rational): Rational {
  if (b.n === 0) {
    throw new Error('Formula error: division by zero in remainder');
  }
  const quotient = ratDiv(a, b);
  return ratSub(a, ratMul(b, rat(integerQuotient(quotient.n, quotient.d))));
}

/** Làm tròn về `digits` chữ số thập phân, half away from zero. */
function roundRational(value: Rational, digits: number): Rational {
  const scale = rat(10 ** digits);
  return ratDiv(rat(ratRound(ratMul(value, scale))), scale);
}

function applyComparison(op: CompareOperator, order: -1 | 0 | 1): boolean {
  switch (op) {
    case '<':
      return order < 0;
    case '<=':
      return order <= 0;
    case '>':
      return order > 0;
    case '>=':
      return order >= 0;
    case '==':
      return order === 0;
    case '!=':
      return order !== 0;
  }
}

/**
 * Interpreter viết tay: `switch` trên `node.kind`, không đệ quy qua `eval`.
 *
 * Quy tắc kiểu (quyết định D4):
 * - `number` ↔ `number`: số học hữu tỉ chính xác.
 * - `money` ± `money`: giữ currency; lệch currency → lỗi.
 * - `money` * `number` / `money` / `number`: `mulRational()` — nơi duy nhất money gặp hữu tỉ.
 * - `money` / `money` → `number` (cùng currency).
 * - `%` chỉ cho `number`.
 * - So sánh: number↔number, money↔money (cùng currency), money↔number (đơn vị lớn).
 * - `&& || !` chỉ cho `boolean`.
 */
export function evaluateFormula(
  parsed: ParsedFormula,
  values: Readonly<Record<string, FormulaValue>>,
): FormulaValue {
  return evaluateNode(parsed.ast);

  function evaluateNode(node: FormulaNode): FormulaValue {
    switch (node.kind) {
      case 'number':
        return { kind: 'number', value: node.value };

      case 'field': {
        const value = values[node.key];
        if (value === undefined) {
          throw new Error(`Formula error: unknown field ${JSON.stringify(node.key)}`);
        }
        return value;
      }

      case 'unary':
        return evaluateUnary(node.op, evaluateNode(node.operand));

      case 'binary':
        return evaluateBinary(node.op, evaluateNode(node.left), evaluateNode(node.right));

      case 'compare':
        return {
          kind: 'boolean',
          value: evaluateCompare(node.op, evaluateNode(node.left), evaluateNode(node.right)),
        };

      case 'logical':
        return {
          kind: 'boolean',
          value: evaluateLogical(node.op, evaluateNode(node.left), evaluateNode(node.right)),
        };

      case 'call':
        return evaluateCall(node.name, node.args);
    }
  }

  function evaluateUnary(op: '-' | '!', operand: FormulaValue): FormulaValue {
    if (op === '!') {
      if (operand.kind !== 'boolean') {
        throw typeError(`! expects a boolean operand, got ${describeValue(operand)}`);
      }
      return { kind: 'boolean', value: !operand.value };
    }

    if (operand.kind === 'number') {
      return { kind: 'number', value: rat(-operand.value.n, operand.value.d) };
    }
    if (operand.kind === 'money') {
      return { kind: 'money', money: money(-operand.money.minor, operand.money.currency) };
    }
    throw typeError(`unary - expects a number or money operand, got ${describeValue(operand)}`);
  }

  function evaluateBinary(
    op: '+' | '-' | '*' | '/' | '%',
    left: FormulaValue,
    right: FormulaValue,
  ): FormulaValue {
    if (left.kind === 'number' && right.kind === 'number') {
      return { kind: 'number', value: applyNumberOperation(op, left.value, right.value) };
    }

    if (left.kind === 'money' && right.kind === 'money') {
      return applyMoneyOperation(op, left.money, right.money);
    }

    if (left.kind === 'money' && right.kind === 'number') {
      if (op === '*' || op === '/') return scaleMoney(op, left.money, right.value);
      throw typeError(`${op} is not defined for money and number`);
    }

    if (left.kind === 'number' && right.kind === 'money') {
      // Giao hoán cho phép nhân; chia và lấy dư thì không.
      if (op === '*') return scaleMoney('*', right.money, left.value);
      throw typeError(`${op} is not defined for number and money`);
    }

    throw typeError(`${op} is not defined for ${describeValue(left)} and ${describeValue(right)}`);
  }

  function applyNumberOperation(
    op: '+' | '-' | '*' | '/' | '%',
    a: Rational,
    b: Rational,
  ): Rational {
    switch (op) {
      case '+':
        return ratAdd(a, b);
      case '-':
        return ratSub(a, b);
      case '*':
        return ratMul(a, b);
      case '/':
        return ratDiv(a, b);
      case '%':
        return ratRemainder(a, b);
    }
  }

  function applyMoneyOperation(
    op: '+' | '-' | '*' | '/' | '%',
    a: Money,
    b: Money,
  ): FormulaValue {
    switch (op) {
      case '+':
        return { kind: 'money', money: moneyAdd(a, b) };
      case '-':
        return { kind: 'money', money: moneySub(a, b) };
      case '/': {
        if (a.currency !== b.currency) {
          throw new Error(
            `Formula currency error: cannot divide ${a.currency} by ${b.currency}`,
          );
        }
        if (b.minor === 0) {
          throw new Error('Formula error: division by zero');
        }
        // Cùng currency → tỉ lệ đơn vị nhỏ bằng tỉ lệ đơn vị lớn.
        return { kind: 'number', value: rat(a.minor, b.minor) };
      }
      case '*':
      case '%':
        throw typeError(`${op} is not defined for two money values`);
    }
  }

  /** `money * number` / `money / number` → `mulRational()`, rồi bọc lại thành money. */
  function scaleMoney(op: '*' | '/', value: Money, factor: Rational): FormulaValue {
    if (op === '*') {
      return { kind: 'money', money: mulRational(value, factor.n, factor.d) };
    }
    if (factor.n === 0) {
      throw new Error('Formula error: division by zero');
    }
    return { kind: 'money', money: mulRational(value, factor.d, factor.n) };
  }

  function evaluateCompare(op: CompareOperator, left: FormulaValue, right: FormulaValue): boolean {
    if (left.kind === 'number' && right.kind === 'number') {
      return applyComparison(op, ratCmp(left.value, right.value));
    }

    if (left.kind === 'money' && right.kind === 'money') {
      if (left.money.currency !== right.money.currency) {
        throw new Error(
          `Formula currency error: cannot compare ${left.money.currency} and ${right.money.currency}`,
        );
      }
      return applyComparison(op, ratCmp(rat(left.money.minor), rat(right.money.minor)));
    }

    if (left.kind === 'money' && right.kind === 'number') {
      return applyComparison(op, ratCmp(moneyToRational(left.money), right.value));
    }

    if (left.kind === 'number' && right.kind === 'money') {
      return applyComparison(op, ratCmp(left.value, moneyToRational(right.money)));
    }

    throw typeError(`${op} cannot compare ${describeValue(left)} and ${describeValue(right)}`);
  }

  function evaluateLogical(op: '&&' | '||', left: FormulaValue, right: FormulaValue): boolean {
    if (left.kind !== 'boolean' || right.kind !== 'boolean') {
      throw typeError(
        `${op} expects boolean operands, got ${describeValue(left)} and ${describeValue(right)}`,
      );
    }
    return op === '&&' ? left.value && right.value : left.value || right.value;
  }

  function evaluateCall(name: 'sum' | 'avg' | 'round' | 'if', args: readonly FormulaNode[]): FormulaValue {
    switch (name) {
      case 'sum':
        return evaluateSum(args);
      case 'avg':
        return evaluateAvg(args);
      case 'round':
        return evaluateRound(args);
      case 'if':
        return evaluateIf(args);
    }
  }

  function evaluateSum(args: readonly FormulaNode[]): FormulaValue {
    const first = args[0] === undefined ? undefined : evaluateNode(args[0]);
    if (first === undefined) {
      throw typeError('sum() expects at least one argument');
    }

    if (first.kind === 'money') {
      let total = first.money;
      for (const arg of args.slice(1)) {
        const value = evaluateNode(arg);
        if (value.kind !== 'money') {
          throw typeError(`sum() cannot mix money and ${describeValue(value)}`);
        }
        total = moneyAdd(total, value.money);
      }
      return { kind: 'money', money: total };
    }

    if (first.kind === 'number') {
      let total = first.value;
      for (const arg of args.slice(1)) {
        const value = evaluateNode(arg);
        if (value.kind !== 'number') {
          throw typeError(`sum() cannot mix number and ${describeValue(value)}`);
        }
        total = ratAdd(total, value.value);
      }
      return { kind: 'number', value: total };
    }

    throw typeError('sum() expects numbers or money, got boolean');
  }

  function evaluateAvg(args: readonly FormulaNode[]): FormulaValue {
    const total = evaluateSum(args);
    const count = rat(args.length);

    if (total.kind === 'money') {
      return {
        kind: 'money',
        money: mulRational(total.money, count.d, count.n),
      };
    }
    if (total.kind === 'number') {
      return { kind: 'number', value: ratDiv(total.value, count) };
    }
    throw typeError('avg() expects numbers or money, got boolean');
  }

  function evaluateRound(args: readonly FormulaNode[]): FormulaValue {
    const targetNode = args[0];
    const digitsNode = args[1];
    if (targetNode === undefined) {
      throw typeError('round() expects at least one argument');
    }

    let digits = 0;
    if (digitsNode !== undefined) {
      const digitsValue = evaluateNode(digitsNode);
      if (digitsValue.kind !== 'number' || digitsValue.value.d !== 1 || digitsValue.value.n < 0) {
        throw typeError(
          `round() digits must be a non-negative integer, got ${describeValue(digitsValue)}`,
        );
      }
      digits = digitsValue.value.n;
    }

    const target = evaluateNode(targetNode);

    if (target.kind === 'number') {
      return { kind: 'number', value: roundRational(target.value, digits) };
    }
    if (target.kind === 'money') {
      const rounded = roundRational(moneyToRational(target.money), digits);
      const minorUnits = ratMul(rounded, rat(minorUnitsPerMajor(target.money.currency)));
      return { kind: 'money', money: money(ratRound(minorUnits), target.money.currency) };
    }
    throw typeError(`round() expects a number or money, got ${describeValue(target)}`);
  }

  /** `if()` phải lười: chỉ nhánh được chọn mới thật sự được tính. */
  function evaluateIf(args: readonly FormulaNode[]): FormulaValue {
    const conditionNode = args[0];
    const thenNode = args[1];
    const elseNode = args[2];
    if (conditionNode === undefined || thenNode === undefined || elseNode === undefined) {
      throw typeError('if() expects three arguments');
    }

    const condition = evaluateNode(conditionNode);
    if (condition.kind !== 'boolean') {
      throw typeError(`if() condition must be boolean, got ${describeValue(condition)}`);
    }

    return evaluateNode(condition.value ? thenNode : elseNode);
  }
}

function isMoneyLike(value: unknown): value is Money {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { minor?: unknown; currency?: unknown };
  return (
    typeof candidate.minor === 'number' &&
    Number.isSafeInteger(candidate.minor) &&
    (candidate.currency === 'VND' || candidate.currency === 'USD')
  );
}

/**
 * Chuyển giá trị thô của một field thành `FormulaValue`.
 *
 * Trả `null` khi field không tham gia được vào formula (quyết định D4) hoặc giá trị
 * không đúng dạng của type đó — nơi gọi tự quyết định báo lỗi hay bỏ qua.
 */
export function formulaValueOf(field: FieldDefinition, raw: unknown): FormulaValue | null {
  if (raw === null || raw === undefined) return null;

  switch (field.dataType) {
    case 'money':
      return isMoneyLike(raw) ? { kind: 'money', money: raw } : null;

    case 'boolean':
      return typeof raw === 'boolean' ? { kind: 'boolean', value: raw } : null;

    case 'number':
      return typeof raw === 'number' && Number.isInteger(raw)
        ? { kind: 'number', value: rat(raw) }
        : null;

    case 'decimal': {
      if (typeof raw !== 'number' || !Number.isInteger(raw)) return null;
      const scale = field.scale ?? 2;
      if (!Number.isInteger(scale) || scale < 0) return null;
      return { kind: 'number', value: rat(raw, 10 ** scale) };
    }

    default:
      // text, textarea, date, datetime, select… không tham gia formula.
      return null;
  }
}
