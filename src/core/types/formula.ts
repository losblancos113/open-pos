import type { Rational } from './rational';
import { ratFromDecimal } from './rational';

/**
 * AST của một formula. Đây là toàn bộ ngôn ngữ formula ở v1 — không có biến gán,
 * không có truy cập thuộc tính, không có gọi hàm ngoài whitelist.
 */
export type FormulaNode =
  | { readonly kind: 'number'; readonly value: Rational }
  | { readonly kind: 'field'; readonly key: string }
  | { readonly kind: 'unary'; readonly op: '-' | '!'; readonly operand: FormulaNode }
  | {
      readonly kind: 'binary';
      readonly op: '+' | '-' | '*' | '/' | '%';
      readonly left: FormulaNode;
      readonly right: FormulaNode;
    }
  | {
      readonly kind: 'compare';
      readonly op: '<' | '<=' | '>' | '>=' | '==' | '!=';
      readonly left: FormulaNode;
      readonly right: FormulaNode;
    }
  | {
      readonly kind: 'logical';
      readonly op: '&&' | '||';
      readonly left: FormulaNode;
      readonly right: FormulaNode;
    }
  | { readonly kind: 'call'; readonly name: FormulaFunctionName; readonly args: readonly FormulaNode[] };

export type FormulaFunctionName = 'sum' | 'avg' | 'round' | 'if';

export type FormulaErrorCode = 'syntax' | 'unknown_function' | 'arity';

export class FormulaError extends Error {
  readonly code: FormulaErrorCode;

  constructor(code: FormulaErrorCode, message: string) {
    super(message);
    this.name = 'FormulaError';
    this.code = code;
  }
}

export interface ParsedFormula {
  readonly source: string;
  readonly ast: FormulaNode;
  readonly dependencies: readonly string[];
}

const FUNCTION_NAMES = ['sum', 'avg', 'round', 'if'] as const satisfies readonly FormulaFunctionName[];

const ARITY: Record<FormulaFunctionName, { readonly min: number; readonly max: number | null }> = {
  sum: { min: 1, max: null },
  avg: { min: 1, max: null },
  round: { min: 1, max: 2 },
  if: { min: 3, max: 3 },
};

/** Toán tử hai ký tự phải đứng trước toán tử một ký tự khi so khớp. */
const OPERATORS = ['<=', '>=', '==', '!=', '&&', '||', '+', '-', '*', '/', '%', '<', '>', '!'] as const;

const COMPARE_OPERATORS = ['<', '<=', '>', '>=', '==', '!='] as const;
type CompareOperator = (typeof COMPARE_OPERATORS)[number];

type TokenKind = 'number' | 'ident' | 'string' | 'operator' | 'lparen' | 'rparen' | 'comma' | 'eof';

interface Token {
  readonly kind: TokenKind;
  readonly value: string;
  readonly position: number;
}

function syntaxError(detail: string, position: number): FormulaError {
  return new FormulaError('syntax', `Formula syntax error at position ${position}: ${detail}`);
}

function isIdentifierStart(ch: string): boolean {
  return /[A-Za-z_]/.test(ch);
}

function isIdentifierPart(ch: string): boolean {
  return /[A-Za-z0-9_]/.test(ch);
}

function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9';
}

function isWhitespace(ch: string): boolean {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r';
}

/**
 * Tokenizer viết tay. Không dùng `eval`/`new Function` — nguồn formula là dữ liệu
 * do admin nhập, nên nó phải đi qua một ngữ pháp hữu hạn thay vì engine JS.
 */
function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let position = 0;

  while (position < source.length) {
    const ch = source.charAt(position);

    if (isWhitespace(ch)) {
      position += 1;
      continue;
    }

    if (ch === '(') {
      tokens.push({ kind: 'lparen', value: ch, position });
      position += 1;
      continue;
    }

    if (ch === ')') {
      tokens.push({ kind: 'rparen', value: ch, position });
      position += 1;
      continue;
    }

    if (ch === ',') {
      tokens.push({ kind: 'comma', value: ch, position });
      position += 1;
      continue;
    }

    if (ch === '"' || ch === "'") {
      const quote = ch;
      let end = position + 1;
      while (end < source.length && source.charAt(end) !== quote) end += 1;
      if (end >= source.length) {
        throw syntaxError('unterminated string literal', position);
      }
      tokens.push({ kind: 'string', value: source.slice(position + 1, end), position });
      position = end + 1;
      continue;
    }

    if (isDigit(ch)) {
      let end = position;
      while (end < source.length && isDigit(source.charAt(end))) end += 1;
      if (source.charAt(end) === '.') {
        end += 1;
        const fractionStart = end;
        while (end < source.length && isDigit(source.charAt(end))) end += 1;
        if (end === fractionStart) {
          throw syntaxError('expected digits after the decimal point', end);
        }
      }
      tokens.push({ kind: 'number', value: source.slice(position, end), position });
      position = end;
      continue;
    }

    if (isIdentifierStart(ch)) {
      let end = position;
      while (end < source.length && isIdentifierPart(source.charAt(end))) end += 1;
      tokens.push({ kind: 'ident', value: source.slice(position, end), position });
      position = end;
      continue;
    }

    const operator = OPERATORS.find((candidate) => source.startsWith(candidate, position));
    if (operator) {
      tokens.push({ kind: 'operator', value: operator, position });
      position += operator.length;
      continue;
    }

    throw syntaxError(`unexpected character ${JSON.stringify(ch)}`, position);
  }

  tokens.push({ kind: 'eof', value: '', position: source.length });
  return tokens;
}

function isCompareOperator(value: string): value is CompareOperator {
  return (COMPARE_OPERATORS as readonly string[]).includes(value);
}

function isFunctionName(value: string): value is FormulaFunctionName {
  return (FUNCTION_NAMES as readonly string[]).includes(value);
}

function describeArity(name: FormulaFunctionName): string {
  const { min, max } = ARITY[name];
  if (max === null) return `at least ${min} argument${min === 1 ? '' : 's'}`;
  if (max === min) return `${min} argument${min === 1 ? '' : 's'}`;
  return `${min} or ${max} arguments`;
}

class Parser {
  private position = 0;

  constructor(
    private readonly tokens: readonly Token[],
    private readonly source: string,
  ) {}

  private current(): Token {
    const token = this.tokens[this.position];
    if (!token) {
      return { kind: 'eof', value: '', position: this.source.length };
    }
    return token;
  }

  private advance(): Token {
    const token = this.current();
    if (token.kind !== 'eof') this.position += 1;
    return token;
  }

  private expect(kind: TokenKind): Token {
    const token = this.current();
    if (token.kind !== kind) {
      throw syntaxError(`expected ${describeTokenKind(kind)}, got ${describeToken(token)}`, token.position);
    }
    return this.advance();
  }

  parse(): FormulaNode {
    if (this.current().kind === 'eof') {
      throw syntaxError('the expression is empty', 0);
    }
    const node = this.parseExpression();
    const token = this.current();
    if (token.kind !== 'eof') {
      throw syntaxError(`unexpected ${describeToken(token)}`, token.position);
    }
    return node;
  }

  private parseExpression(): FormulaNode {
    return this.parseLogicalOr();
  }

  private parseLogicalOr(): FormulaNode {
    let left = this.parseLogicalAnd();
    while (this.current().kind === 'operator' && this.current().value === '||') {
      this.advance();
      left = { kind: 'logical', op: '||', left, right: this.parseLogicalAnd() };
    }
    return left;
  }

  private parseLogicalAnd(): FormulaNode {
    let left = this.parseComparison();
    while (this.current().kind === 'operator' && this.current().value === '&&') {
      this.advance();
      left = { kind: 'logical', op: '&&', left, right: this.parseComparison() };
    }
    return left;
  }

  private parseComparison(): FormulaNode {
    const left = this.parseAdditive();
    const token = this.current();
    if (token.kind === 'operator' && isCompareOperator(token.value)) {
      this.advance();
      const right = this.parseAdditive();
      const next = this.current();
      if (next.kind === 'operator' && isCompareOperator(next.value)) {
        throw syntaxError('comparisons cannot be chained; use && or ||', next.position);
      }
      return { kind: 'compare', op: token.value, left, right };
    }
    return left;
  }

  private parseAdditive(): FormulaNode {
    let left = this.parseMultiplicative();
    while (this.current().kind === 'operator' && (this.current().value === '+' || this.current().value === '-')) {
      const op = this.advance().value as '+' | '-';
      left = { kind: 'binary', op, left, right: this.parseMultiplicative() };
    }
    return left;
  }

  private parseMultiplicative(): FormulaNode {
    let left = this.parseUnary();
    while (
      this.current().kind === 'operator' &&
      (this.current().value === '*' || this.current().value === '/' || this.current().value === '%')
    ) {
      const op = this.advance().value as '*' | '/' | '%';
      left = { kind: 'binary', op, left, right: this.parseUnary() };
    }
    return left;
  }

  private parseUnary(): FormulaNode {
    const token = this.current();
    if (token.kind === 'operator' && (token.value === '-' || token.value === '!')) {
      this.advance();
      return { kind: 'unary', op: token.value, operand: this.parseUnary() };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): FormulaNode {
    const token = this.current();

    if (token.kind === 'number') {
      this.advance();
      return { kind: 'number', value: ratFromDecimal(token.value) };
    }

    if (token.kind === 'ident') {
      this.advance();
      if (this.current().kind === 'lparen') {
        return this.parseCall(token);
      }
      return { kind: 'field', key: token.value };
    }

    if (token.kind === 'lparen') {
      this.advance();
      const node = this.parseExpression();
      this.expect('rparen');
      return node;
    }

    if (token.kind === 'string') {
      throw syntaxError('string literals are not allowed in formulas', token.position);
    }

    throw syntaxError(`unexpected ${describeToken(token)}`, token.position);
  }

  private parseCall(nameToken: Token): FormulaNode {
    const name = nameToken.value;
    if (!isFunctionName(name)) {
      throw new FormulaError(
        'unknown_function',
        `Formula unknown function: ${JSON.stringify(name)} is not allowed; ` +
          `expected one of ${FUNCTION_NAMES.join(', ')}`,
      );
    }

    this.expect('lparen');
    const args: FormulaNode[] = [];
    if (this.current().kind !== 'rparen') {
      args.push(this.parseExpression());
      while (this.current().kind === 'comma') {
        this.advance();
        args.push(this.parseExpression());
      }
    }
    this.expect('rparen');

    const { min, max } = ARITY[name];
    if (args.length < min || (max !== null && args.length > max)) {
      throw new FormulaError(
        'arity',
        `Formula arity error: ${name}() expects ${describeArity(name)}, got ${args.length}`,
      );
    }

    return { kind: 'call', name, args };
  }
}

function describeTokenKind(kind: TokenKind): string {
  switch (kind) {
    case 'number':
      return 'a number';
    case 'ident':
      return 'a field name';
    case 'string':
      return 'a string';
    case 'operator':
      return 'an operator';
    case 'lparen':
      return '"("';
    case 'rparen':
      return '")"';
    case 'comma':
      return '","';
    case 'eof':
      return 'end of formula';
  }
}

function describeToken(token: Token): string {
  if (token.kind === 'eof') return 'end of formula';
  return JSON.stringify(token.value);
}

function collectFields(node: FormulaNode, out: Set<string>): void {
  switch (node.kind) {
    case 'number':
      return;
    case 'field':
      out.add(node.key);
      return;
    case 'unary':
      collectFields(node.operand, out);
      return;
    case 'binary':
    case 'compare':
    case 'logical':
      collectFields(node.left, out);
      collectFields(node.right, out);
      return;
    case 'call':
      for (const arg of node.args) collectFields(arg, out);
      return;
  }
}

/**
 * Parse một formula thành AST + danh sách field mà nó phụ thuộc.
 *
 * Chỉ dùng ngữ pháp hữu hạn ở trên; **không** `eval`, **không** `new Function`,
 * **không** truy cập global scope (spec §4.1).
 */
export function parseFormula(source: string): ParsedFormula {
  if (typeof source !== 'string') {
    throw syntaxError('the formula must be a string', 0);
  }

  const tokens = tokenize(source);
  const ast = new Parser(tokens, source).parse();

  const fields = new Set<string>();
  collectFields(ast, fields);

  return { source, ast, dependencies: [...fields] };
}
