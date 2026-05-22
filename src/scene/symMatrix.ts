/**
 * symMatrix.ts — Lightweight symbolic 3×3 rotation matrix arithmetic.
 *
 * Each matrix cell is a SymExpr: a sum of signed products of string labels.
 * This lets us compute T = R₁ × R₂ × … directly, producing formula strings
 * like "c₁c₂-s₁s₂" for each cell rather than a collapsed numeric value.
 *
 * Types
 * ─────
 *   SymTerm  — one product: optional minus sign × concatenated label parts
 *              e.g. { neg: true, parts: ['c₁','s₂'] } → "-c₁s₂"
 *
 *   SymExpr  — sum of SymTerms
 *              e.g. [c₁c₂, -s₁s₂]  → "c₁c₂-s₁s₂"
 *
 *   SymMatrix — 3×3 array of SymExprs (rotation block only)
 */

export type SymTerm = { neg: boolean; parts: string[] }
export type SymExpr = SymTerm[]
export type SymMatrix = SymExpr[][]   // always 3×3

// ─── Scalar constants ─────────────────────────────────────────────────────────

/** Additive identity — renders as "0". */
export const SYM_ZERO: SymExpr = []

/** Multiplicative identity — renders as "1". */
export const SYM_ONE: SymExpr = [{ neg: false, parts: [] }]

/** 3×3 identity matrix. */
export const SYM_IDENTITY: SymMatrix = [
  [SYM_ONE,  SYM_ZERO, SYM_ZERO],
  [SYM_ZERO, SYM_ONE,  SYM_ZERO],
  [SYM_ZERO, SYM_ZERO, SYM_ONE ],
]

// ─── Expression builders ──────────────────────────────────────────────────────

/** Single-label expression, e.g. scalar('c₁') → [{neg:false, parts:['c₁']}]. */
export function scalar(label: string): SymExpr {
  return [{ neg: false, parts: [label] }]
}

/** Negate every term in an expression. */
export function symNeg(e: SymExpr): SymExpr {
  return e.map(t => ({ ...t, neg: !t.neg }))
}

/** Sum of two expressions (just concatenate term lists). */
export function symAdd(a: SymExpr, b: SymExpr): SymExpr {
  return [...a, ...b]
}

/**
 * Product of two expressions.
 * Each term in a is distributed over each term in b:
 *   neg = a.neg XOR b.neg
 *   parts = [...a.parts, ...b.parts]
 */
export function symMul(a: SymExpr, b: SymExpr): SymExpr {
  const result: SymTerm[] = []
  for (const ta of a) {
    for (const tb of b) {
      result.push({ neg: ta.neg !== tb.neg, parts: [...ta.parts, ...tb.parts] })
    }
  }
  return result
}

// ─── Rendering ────────────────────────────────────────────────────────────────

function termToString(t: SymTerm): string {
  // empty parts = scalar 1
  const body = t.parts.length === 0 ? '1' : t.parts.join('')
  return t.neg ? `-${body}` : body
}

/**
 * Render a SymExpr to a human-readable formula string.
 * Leading term: rendered as-is (sign included if negative).
 * Subsequent terms: "+" prepended only when the term is positive
 *   (negative terms already start with "-").
 */
export function exprToString(e: SymExpr): string {
  if (e.length === 0) return '0'
  return e.map((t, i) => {
    const s = termToString(t)
    return i > 0 && !t.neg ? `+${s}` : s
  }).join('')
}

// ─── Rotation matrices ────────────────────────────────────────────────────────

/**
 * Build the symbolic 3×3 rotation matrix for a unit axis and angle labels.
 *
 * Uses the closed-form Rodrigues matrix for the three standard axes
 * (X, Y, Z) and falls back to the full Rodrigues expansion for arbitrary axes.
 *
 * @param axis      Unit rotation axis, e.g. [0,1,0].
 * @param cosLabel  Label for cos(θ), e.g. "cθ" or "c₁".
 * @param sinLabel  Label for sin(θ), e.g. "sθ" or "s₁".
 */
export function symRotationMatrix(
  axis: [number, number, number],
  cosLabel: string,
  sinLabel: string,
): SymMatrix {
  const C  = scalar(cosLabel)
  const S  = scalar(sinLabel)
  const nS = symNeg(S)
  const Z  = SYM_ZERO
  const I  = SYM_ONE

  // Round axis components to integers to handle floating-point unit vectors.
  const [ax, ay, az] = axis.map(v => Math.round(v)) as [number, number, number]

  // ── Standard axes ──────────────────────────────────────────────────────────
  //   Rx(θ): x unchanged, y/z plane rotates
  if (ax === 1 && ay === 0 && az === 0) {
    return [
      [I,  Z,   Z ],
      [Z,  C,   nS],
      [Z,  S,   C ],
    ]
  }
  //   Ry(θ): y unchanged, x/z plane rotates (right-hand rule about +Y)
  if (ax === 0 && ay === 1 && az === 0) {
    return [
      [C,  Z,  S ],
      [Z,  I,  Z ],
      [nS, Z,  C ],
    ]
  }
  //   Rz(θ): z unchanged, x/y plane rotates
  if (ax === 0 && ay === 0 && az === 1) {
    return [
      [C,  nS, Z],
      [S,  C,  Z],
      [Z,  Z,  I],
    ]
  }

  // ── General axis via Rodrigues: R = I·c + (1-c)·aaᵀ + s·[a]× ────────────
  //
  //   [a]× (skew-symmetric cross-product matrix):
  //       ⎡  0  -az  ay ⎤
  //       ⎢  az   0  -ax⎥
  //       ⎣ -ay  ax   0 ⎦
  //
  //   Each cell of R:
  //     R[i][j] = δᵢⱼ·c + aᵢ·aⱼ·(1-c) ± aₖ·s
  //
  //   We represent (1-c) symbolically as a two-term sum (1 + (-c)):
  const oneMinusC: SymExpr = [{ neg: false, parts: [] }, { neg: true, parts: [cosLabel] }]

  // Helper: coefficient * oneMinusC  (coefficient is a plain number ±0/±1/other)
  function coeff(v: number): SymExpr {
    if (v === 0) return SYM_ZERO
    if (v === 1) return oneMinusC
    if (v === -1) return symNeg(oneMinusC)
    // For fractional components, embed numeric coefficient as a label prefix
    return oneMinusC.map(t => ({ ...t, parts: [`${v}`, ...t.parts] }))
  }

  // Diagonal: c + aᵢ²·(1-c)
  const diag = (a: number): SymExpr =>
    a === 0 ? C : symAdd(C, coeff(a * a))

  // Off-diagonal symmetric part: aᵢ·aⱼ·(1-c)
  const offSym = (ai: number, aj: number): SymExpr =>
    ai === 0 || aj === 0 ? SYM_ZERO : coeff(ai * aj)

  // Skew part: ± aₖ·s
  const skew = (a: number): SymExpr =>
    a === 0 ? SYM_ZERO : a > 0 ? scalar(`${a === 1 ? '' : a}${sinLabel}`) : symNeg(scalar(`${-a === 1 ? '' : -a}${sinLabel}`))

  const [x, y, z] = axis as [number, number, number]

  return [
    // row 0
    [diag(x),                            symAdd(offSym(x,y), skew(-z)),   symAdd(offSym(x,z), skew(y)) ],
    // row 1
    [symAdd(offSym(y,x), skew(z)),        diag(y),                         symAdd(offSym(y,z), skew(-x))],
    // row 2
    [symAdd(offSym(z,x), skew(-y)),       symAdd(offSym(z,y), skew(x)),    diag(z)                      ],
  ]
}

// ─── 3-vector types and operations ───────────────────────────────────────────

/** A 3-vector of symbolic expressions (one per spatial axis). */
export type SymVec3 = [SymExpr, SymExpr, SymExpr]

/** Zero 3-vector. */
export const SYM_ZERO_VEC3: SymVec3 = [SYM_ZERO, SYM_ZERO, SYM_ZERO]

/**
 * Convert a plain number to a SymExpr.
 * 0 → SYM_ZERO, 1 → SYM_ONE, -1 → neg(SYM_ONE), else a single numeric label.
 */
export function numericToSymExpr(v: number): SymExpr {
  if (Math.abs(v) < 1e-9) return SYM_ZERO
  if (Math.abs(v - 1) < 1e-9) return SYM_ONE
  if (Math.abs(v + 1) < 1e-9) return [{ neg: true, parts: [] }]
  const absS = parseFloat(Math.abs(v).toFixed(4)).toString()
  return [{ neg: v < 0, parts: [absS] }]
}

/** Element-wise sum of two SymVec3s. */
export function symVecAdd(a: SymVec3, b: SymVec3): SymVec3 {
  return [symAdd(a[0], b[0]), symAdd(a[1], b[1]), symAdd(a[2], b[2])]
}

/**
 * Multiply a 3×3 symbolic rotation matrix by a 3-vector of SymExprs.
 * Result[i] = Σₖ R[i][k] · v[k]
 */
export function symMatVecMul(R: SymMatrix, v: SymVec3): SymVec3 {
  return [0, 1, 2].map(i =>
    [0, 1, 2].reduce<SymExpr>(
      (sum, k) => symAdd(sum, symMul(R[i][k], v[k])),
      SYM_ZERO,
    )
  ) as SymVec3
}

// ─── Matrix multiplication ────────────────────────────────────────────────────

/**
 * Multiply two 3×3 symbolic rotation matrices.
 * Result[i][j] = Σₖ A[i][k] · B[k][j]
 */
export function symMatMul(A: SymMatrix, B: SymMatrix): SymMatrix {
  return Array.from({ length: 3 }, (_, i) =>
    Array.from({ length: 3 }, (_, j) =>
      [0, 1, 2].reduce<SymExpr>(
        (sum, k) => symAdd(sum, symMul(A[i][k], B[k][j])),
        SYM_ZERO,
      )
    )
  )
}
