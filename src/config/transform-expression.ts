/**
 * Restricted transform expression parser and evaluator.
 *
 * Implements a strict whitelist grammar — NO eval, NO Function constructor.
 * @see docs/specs/tenant-field-mappings.md §Restricted Transform Expression Grammar
 *
 * Allowed:
 *   - Numeric literals (e.g. 100, 3.14)
 *   - Variable: `value` (bound to the source field's numeric value)
 *   - Operators: + - * / (binary), - (unary)
 *   - Parentheses
 *   - Functions: Math.min(a, b), Math.max(a, b), Math.round(a)
 *
 * Forbidden: eval, new, identifiers other than `value` and `Math.*` listed above,
 *   bracket access, string literals, ternary (deferred to v1.1.1).
 */

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

enum TT {
  NUMBER,
  VALUE,
  MATH_MIN,
  MATH_MAX,
  MATH_ROUND,
  PLUS,
  MINUS,
  STAR,
  SLASH,
  LPAREN,
  RPAREN,
  COMMA,
  EOF,
}

interface Token {
  type: TT;
  /** Raw text slice (for error messages) */
  raw: string;
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    // Skip whitespace
    if (/\s/.test(input[i]!)) { i++; continue; }

    // Number
    const numMatch = /^[0-9]+(?:\.[0-9]+)?/.exec(input.slice(i));
    if (numMatch) {
      tokens.push({ type: TT.NUMBER, raw: numMatch[0] });
      i += numMatch[0].length;
      continue;
    }

    // Math.min / Math.max / Math.round
    if (input.startsWith('Math.min', i)) {
      tokens.push({ type: TT.MATH_MIN, raw: 'Math.min' });
      i += 8;
      continue;
    }
    if (input.startsWith('Math.max', i)) {
      tokens.push({ type: TT.MATH_MAX, raw: 'Math.max' });
      i += 8;
      continue;
    }
    if (input.startsWith('Math.round', i)) {
      tokens.push({ type: TT.MATH_ROUND, raw: 'Math.round' });
      i += 10;
      continue;
    }

    // `value` variable (must not be prefix of another identifier)
    if (input.startsWith('value', i) && !/[A-Za-z0-9_$]/.test(input[i + 5] ?? '')) {
      tokens.push({ type: TT.VALUE, raw: 'value' });
      i += 5;
      continue;
    }

    // Single-char tokens
    const ch = input[i]!;
    if (ch === '+') { tokens.push({ type: TT.PLUS,   raw: '+' }); i++; continue; }
    if (ch === '-') { tokens.push({ type: TT.MINUS,  raw: '-' }); i++; continue; }
    if (ch === '*') { tokens.push({ type: TT.STAR,   raw: '*' }); i++; continue; }
    if (ch === '/') { tokens.push({ type: TT.SLASH,  raw: '/' }); i++; continue; }
    if (ch === '(') { tokens.push({ type: TT.LPAREN, raw: '(' }); i++; continue; }
    if (ch === ')') { tokens.push({ type: TT.RPAREN, raw: ')' }); i++; continue; }
    if (ch === ',') { tokens.push({ type: TT.COMMA,  raw: ',' }); i++; continue; }

    // Anything else is forbidden
    throw new Error(`Forbidden character or token at position ${i}: "${ch}" — only value, numeric literals, +−*/, parentheses, and Math.min/max/round are allowed`);
  }

  tokens.push({ type: TT.EOF, raw: '' });
  return tokens;
}

// ---------------------------------------------------------------------------
// Recursive-descent parser / evaluator
// ---------------------------------------------------------------------------

class Parser {
  private pos = 0;
  constructor(
    private readonly tokens: Token[],
    private readonly value: number,
  ) {}

  private peek(): Token {
    return this.tokens[this.pos]!;
  }

  private consume(expected?: TT): Token {
    const t = this.tokens[this.pos]!;
    if (expected !== undefined && t.type !== expected) {
      throw new Error(`Expected ${TT[expected]} but got ${TT[t.type]} ("${t.raw}")`);
    }
    this.pos++;
    return t;
  }

  evaluate(): number {
    const result = this.parseAdd();
    if (this.peek().type !== TT.EOF) {
      throw new Error(`Unexpected token "${this.peek().raw}" after expression`);
    }
    return result;
  }

  private parseAdd(): number {
    let left = this.parseMul();
    while (this.peek().type === TT.PLUS || this.peek().type === TT.MINUS) {
      const op = this.consume();
      const right = this.parseMul();
      left = op.type === TT.PLUS ? left + right : left - right;
    }
    return left;
  }

  private parseMul(): number {
    let left = this.parseUnary();
    while (this.peek().type === TT.STAR || this.peek().type === TT.SLASH) {
      const op = this.consume();
      const right = this.parseUnary();
      if (op.type === TT.SLASH && right === 0) {
        throw new Error('Division by zero in transform expression');
      }
      left = op.type === TT.STAR ? left * right : left / right;
    }
    return left;
  }

  private parseUnary(): number {
    if (this.peek().type === TT.MINUS) {
      this.consume();
      return -this.parsePrimary();
    }
    return this.parsePrimary();
  }

  private parsePrimary(): number {
    const t = this.peek();

    if (t.type === TT.NUMBER) {
      this.consume();
      return parseFloat(t.raw);
    }

    if (t.type === TT.VALUE) {
      this.consume();
      return this.value;
    }

    if (t.type === TT.MATH_MIN) {
      this.consume();
      this.consume(TT.LPAREN);
      const a = this.parseAdd();
      this.consume(TT.COMMA);
      const b = this.parseAdd();
      this.consume(TT.RPAREN);
      return Math.min(a, b);
    }

    if (t.type === TT.MATH_MAX) {
      this.consume();
      this.consume(TT.LPAREN);
      const a = this.parseAdd();
      this.consume(TT.COMMA);
      const b = this.parseAdd();
      this.consume(TT.RPAREN);
      return Math.max(a, b);
    }

    if (t.type === TT.MATH_ROUND) {
      this.consume();
      this.consume(TT.LPAREN);
      const a = this.parseAdd();
      this.consume(TT.RPAREN);
      return Math.round(a);
    }

    if (t.type === TT.LPAREN) {
      this.consume();
      const inner = this.parseAdd();
      this.consume(TT.RPAREN);
      return inner;
    }

    throw new Error(`Unexpected token "${t.raw}" (type ${TT[t.type]}) — forbidden or unexpected in expression`);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type ValidateResult = { ok: true } | { ok: false; message: string };

/**
 * Validate a transform expression string at upload time.
 * Returns `{ ok: true }` when the expression parses cleanly (evaluated with `value=0`).
 * Returns `{ ok: false, message }` for any grammar violation.
 */
export function validateTransformExpression(expression: string): ValidateResult {
  try {
    const tokens = tokenize(expression);
    new Parser(tokens, 0).evaluate();
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Evaluate a (pre-validated) transform expression with the given numeric value.
 * Throws if the expression is invalid or produces NaN / Infinity.
 */
export function evaluateTransform(expression: string, value: number): number {
  const tokens = tokenize(expression);
  const result = new Parser(tokens, value).evaluate();
  if (!isFinite(result)) {
    throw new Error(`Transform expression produced non-finite result: ${result}`);
  }
  return result;
}
