/**
 * symJacobian.ts — Symbolic Jacobian construction and singularity solving.
 *
 * Pipeline:
 *   1. buildSymJacobian(jointFrames, eeSymTrans)  → SymJacobianCol[]
 *   2. symDetJTJ(cols)                            → { raw, formula }
 *   3. solveDetEqualsZero(raw, varLabels)          → SingularCondition[]
 *
 * All symbolic arithmetic uses SymExpr / SymTerm from symMatrix.ts.
 */

import {
  type SymExpr,
  type SymVec3,
  SYM_ZERO,
  SYM_ONE,
  symAdd,
  symMul,
  symNeg,
  exprToString,
} from './symMatrix'
import type { KinematicFrame } from './transformEngine'

// ─── Public types ──────────────────────────────────────────────────────────────

export interface SymJacobianCol {
  jointId: string
  kind: 'revolute' | 'prismatic'
  label: string
  Jv: SymVec3
}

export interface SingularCondition {
  /** Human-readable equation, e.g. "sin(θ₂) = 0" */
  condition: string
  /** Exact solutions in degrees within [−180°, 180°]. */
  solutions: number[]
  /** Which joint variable(s) appear in this condition. */
  variables: string[]
}

// ─── Unicode subscript helper ─────────────────────────────────────────────────

const _SUB = '₀₁₂₃₄₅₆₇₈₉'
function _sub(n: number): string {
  return String(n).split('').map((d) => _SUB[parseInt(d)] ?? d).join('')
}

// ─── Parse a symbolic string back to SymExpr ─────────────────────────────────

/**
 * Convert a string produced by exprToString() back to a SymExpr.
 * Handles: "0", "1", "-1", multi-term sums like "c₁s₂-s₁c₂+0.5".
 */
function parseSymStr(s: string): SymExpr {
  if (s === '0') return SYM_ZERO
  if (s === '1') return SYM_ONE
  if (s === '-1') return [{ neg: true, parts: [] }]

  // Split on + / - that are NOT at position 0
  const rawTerms: string[] = []
  let cur = ''
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if ((ch === '+' || ch === '-') && i > 0) {
      if (cur.length > 0) rawTerms.push(cur)
      cur = ch
    } else {
      cur += ch
    }
  }
  if (cur.length > 0) rawTerms.push(cur)

  const result: SymExpr = []
  for (const raw of rawTerms) {
    const neg = raw.startsWith('-')
    const body = raw.startsWith('-') || raw.startsWith('+') ? raw.slice(1) : raw
    if (body === '' || body === '0') continue
    if (body === '1') { result.push({ neg, parts: [] }); continue }
    const parts = splitBodyIntoParts(body)
    result.push({ neg, parts })
  }
  return result
}

/**
 * Split a term body like "c1s2" or "0.5c1" into label parts.
 * Parts are: numeric tokens and trig tokens (c/s followed by one or more digits).
 */
function splitBodyIntoParts(body: string): string[] {
  const parts: string[] = []
  let i = 0
  while (i < body.length) {
    if (/[0-9.]/.test(body[i])) {
      // peek ahead: if preceded by c/s this numeric is the joint index, not a scalar
      // (handled below in the c/s branch — here we only reach bare numerics)
      let num = ''
      while (i < body.length && /[0-9.]/.test(body[i])) num += body[i++]
      parts.push(num)
    } else if (body[i] === 'c' || body[i] === 's') {
      let tok = body[i++]
      // consume digit suffix (joint index), e.g. "1" in "c1"
      while (i < body.length && /[0-9]/.test(body[i])) tok += body[i++]
      parts.push(tok)
    } else {
      // unknown character — pass through as its own part
      parts.push(body[i++])
    }
  }
  return parts
}

// ─── Symbolic vector operations ───────────────────────────────────────────────

function symCross(a: SymVec3, b: SymVec3): SymVec3 {
  return [
    symAdd(symMul(a[1], b[2]), symNeg(symMul(a[2], b[1]))),
    symAdd(symMul(a[2], b[0]), symNeg(symMul(a[0], b[2]))),
    symAdd(symMul(a[0], b[1]), symNeg(symMul(a[1], b[0]))),
  ]
}


// ─── Symbolic determinant ─────────────────────────────────────────────────────

function symDetNxN(m: SymExpr[][], n: number): SymExpr {
  if (n === 1) return m[0][0]
  if (n === 2) {
    return symAdd(symMul(m[0][0], m[1][1]), symNeg(symMul(m[0][1], m[1][0])))
  }
  let det: SymExpr = SYM_ZERO
  for (let c = 0; c < n; c++) {
    const minor = m.slice(1).map((row) => row.filter((_, j) => j !== c))
    const cof = symDetNxN(minor, n - 1)
    const entry = symMul(m[0][c], cof)
    det = symAdd(det, c % 2 === 0 ? entry : symNeg(entry))
  }
  return det
}

// ─── Step 1: build symbolic Jacobian ─────────────────────────────────────────

/**
 * Build the symbolic 3×n position Jacobian.
 *
 * For revolute joint i:   Jv_i = z_i × (pe − pi)
 * For prismatic joint i:  Jv_i = z_i
 *
 * z_i is taken from the PARENT frame's cumulative rotation matrix,
 * column corresponding to the joint's local axis direction.
 *
 * @param jointFrames  Ordered revolute/prismatic frames root→last.
 * @param eeSymTrans   Symbolic EE world position as SymVec3.
 */
export function buildSymJacobian(
  jointFrames: KinematicFrame[],
  eeSymTrans: SymVec3,
): SymJacobianCol[] {
  let ri = 1, pi = 1
  const cols: SymJacobianCol[] = []

  for (let idx = 0; idx < jointFrames.length; idx++) {
    const frame = jointFrames[idx]
    const { node } = frame
    if (node.kind !== 'revolute' && node.kind !== 'prismatic') continue

    const label = node.kind === 'revolute'
      ? `${ri++}`
      : `d${_sub(pi++)}`

    // Determine axis column index in the rotation matrix
    const ax = node.axis ?? [0, 0, 1]
    const colIdx = ax[0] !== 0 ? 0 : ax[1] !== 0 ? 1 : 2

    // Parent cumulative rotation (9-string row-major).
    // For the first joint (idx=0) this is identity; otherwise it's the
    // previous frame's accumulated rotation (what the parent sees).
    // Note: transformEngine stores the rotation AFTER applying this joint's
    // rotation on the frame itself, so for joint i we want frame[i-1]'s rotation.
    const parentSymRotStrs: string[] = idx > 0
      ? jointFrames[idx - 1].symbolicCumulativeRotation
      : ['1', '0', '0', '0', '1', '0', '0', '0', '1']

    // Symbolic world-frame axis z_i = column colIdx of parent rotation
    const z: SymVec3 = [
      parseSymStr(parentSymRotStrs[colIdx]),
      parseSymStr(parentSymRotStrs[3 + colIdx]),
      parseSymStr(parentSymRotStrs[6 + colIdx]),
    ]

    let Jv: SymVec3

    if (node.kind === 'prismatic') {
      Jv = z
    } else {
      // pi_sym = symbolic position of this joint's origin
      const piSym: SymVec3 = [
        parseSymStr(frame.symbolicCumulativeTranslation[0]),
        parseSymStr(frame.symbolicCumulativeTranslation[1]),
        parseSymStr(frame.symbolicCumulativeTranslation[2]),
      ]

      // dp = pe - pi
      const dp: SymVec3 = [
        symAdd(eeSymTrans[0], symNeg(piSym[0])),
        symAdd(eeSymTrans[1], symNeg(piSym[1])),
        symAdd(eeSymTrans[2], symNeg(piSym[2])),
      ]

      Jv = symCross(z, dp)
    }

    cols.push({ jointId: node.id, kind: node.kind, label, Jv })
  }

  return cols
}

// ─── Step 2: symbolic det(J_reduced) ─────────────────────────────────────────

/**
 * Compute a symbolic singularity determinant.
 *
 * Strategy: drop any row of J where every column entry is the zero expression,
 * then take the top-n rows (n = number of columns) and compute det directly.
 * This avoids the combinatorial blowup of det(JᵀJ) = det(JᵀJ) for tall J.
 *
 * For the 2-DOF planar RR arm:
 *   J is 3×2 with the third row identically 0 → reduce to 2×2 → det = s₁c₂·l₁l₂ − c₁s₂·l₁l₂
 *   → after trig simplification → l₁l₂·sin(θ₁−θ₂)
 */
export function symDetJTJ(cols: SymJacobianCol[]): { raw: SymExpr; formula: string } {
  const n = cols.length
  if (n === 0) return { raw: SYM_ZERO, formula: '0' }

  // Build 3×n matrix row-major: rows[i] = [Jv[i] for each col]
  const rows: SymExpr[][] = [0, 1, 2].map((i) => cols.map((c) => c.Jv[i]))

  // Keep only non-zero rows (rows where at least one entry is non-zero expr)
  const isZeroExpr = (e: SymExpr) => e.length === 0
  const activeRows = rows.filter((row) => row.some((e) => !isZeroExpr(e)))

  // Pre-simplify each Jacobian entry to keep term counts small before det expansion
  const simplifiedRows = activeRows.map((row) => row.map(simplifyCancelTrig))
  const selected = simplifiedRows.slice(0, n)
  if (selected.length < n) {
    // Fewer non-zero rows than columns → always singular
    return { raw: SYM_ZERO, formula: '0' }
  }

  const raw = symDetNxN(selected, n)
  const simplified = simplifyCancelTrig(raw)
  return { raw, formula: exprToString(simplified) }
}

// ─── Step 3: trig simplification ─────────────────────────────────────────────

/**
 * Cancel opposite-sign identical terms: +A and -A → removed.
 * E.g. [+2c1, -2c1] → [] 
 */
function cancelOpposites(expr: SymExpr): SymExpr {
  const used = new Uint8Array(expr.length)
  const result: SymExpr = []
  for (let i = 0; i < expr.length; i++) {
    if (used[i]) continue
    const ti = expr[i]
    for (let j = i + 1; j < expr.length; j++) {
      if (used[j]) continue
      const tj = expr[j]
      if (tj.neg !== ti.neg && partsEqual(ti.parts, tj.parts)) {
        used[i] = 1; used[j] = 1
        break
      }
    }
    if (!used[i]) result.push(ti)
  }
  return result
}

/**
 * Simplify a SymExpr by:
 *   1. Cancelling opposite-sign identical terms (+A − A = 0).
 *   2. Applying c²+s²=1 Pythagorean identities.
 * Iterates until no more reductions are possible.
 */
export function simplifyCancelTrig(expr: SymExpr): SymExpr {
  // Collect all joint angle labels appearing as c/s tokens
  const angleLabels = new Set<string>()
  for (const t of expr) {
    for (const p of t.parts) {
      const m = p.match(/^[cs]([0-9]+)$/)
      if (m) angleLabels.add(m[1])
    }
  }

  let current = expr
  let changed = true
  while (changed) {
    changed = false
    // Normalize: merge multiple numeric parts into a single leading coefficient.
    // E.g. parts=['2','s1','2','s1','s2'] → ['4','s1','s1','s2'].
    // This is required so cancelPythagorean's partsEqual check works correctly.
    const normalized = current.map((t) => {
      let coeff = 1
      const trig: string[] = []
      for (const p of t.parts) {
        if (/^[0-9]+$/.test(p)) coeff *= parseInt(p)
        else trig.push(p)
      }
      trig.sort()
      const parts = coeff === 1 ? trig : [String(coeff), ...trig]
      return { neg: t.neg, parts: parts.length ? parts : [] }
    })
    if (normalized.some((t, i) => t.parts.join(',') !== current[i].parts.join(','))) {
      current = normalized; changed = true; continue
    }
    // Cancel +A / -A pairs first
    const afterOpp = cancelOpposites(current)
    if (afterOpp.length < current.length) { current = afterOpp; changed = true }
    // Then Pythagorean c²+s²=1
    for (const idx of angleLabels) {
      const next = cancelPythagorean(current, `c${idx}`, `s${idx}`)
      if (next.length < current.length) { current = next; changed = true }
    }
  }
  return current
}

/**
 * One full pass of Pythagorean cancellation for a specific c/s label pair.
 *
 * Handles both degree-1 and degree-2 occurrences:
 *   Degree-1: (A·cN·X, A·sN·X) → (A·X)          [cN²+sN²=1 with one factor]
 *   Degree-2: (A·cN·cN·X, A·sN·sN·X) → (A·X)    [cN²+sN²=1 with two factors]
 *
 * Only pairs with the same sign are cancelled (both positive or both negative).
 */
function cancelPythagorean(expr: SymExpr, cL: string, sL: string): SymExpr {
  const used = new Uint8Array(expr.length)
  const result: SymExpr = []

  // Try to find a cancellation partner for term i, removing `count` copies of xL
  // and matching against a term with `count` copies of yL and same remaining parts.
  const tryCancel = (i: number, xL: string, yL: string, count: 1 | 2): boolean => {
    const ti = expr[i]
    // Check ti has at least `count` copies of xL
    let rest = [...ti.parts]
    for (let k = 0; k < count; k++) {
      const idx = rest.indexOf(xL)
      if (idx < 0) return false
      rest.splice(idx, 1)
    }
    for (let j = i + 1; j < expr.length; j++) {
      if (used[j]) continue
      const tj = expr[j]
      if (tj.neg !== ti.neg) continue
      let restJ = [...tj.parts]
      let ok = true
      for (let k = 0; k < count; k++) {
        const idx = restJ.indexOf(yL)
        if (idx < 0) { ok = false; break }
        restJ.splice(idx, 1)
      }
      if (!ok) continue
      if (partsEqual(rest, restJ)) {
        result.push({ neg: ti.neg, parts: rest })
        used[i] = 1; used[j] = 1
        return true
      }
    }
    return false
  }

  for (let i = 0; i < expr.length; i++) {
    if (used[i]) continue
    const ti = expr[i]

    if (ti.parts.includes(cL)) {
      // Try degree-2 first (more specific), then degree-1
      if (ti.parts.filter(p => p === cL).length >= 2 && tryCancel(i, cL, sL, 2)) continue
      if (tryCancel(i, cL, sL, 1)) continue
    }

    if (!used[i] && ti.parts.includes(sL)) {
      if (ti.parts.filter(p => p === sL).length >= 2 && tryCancel(i, sL, cL, 2)) continue
      if (tryCancel(i, sL, cL, 1)) continue
    }

    if (!used[i]) result.push(ti)
  }

  return result
}

// ─── Step 4: solve det = 0 ────────────────────────────────────────────────────

/**
 * Derive analytic singular conditions from a SymExpr for det(JᵀJ).
 *
 * Strategy:
 *   1. Simplify with c²+s²=1.
 *   2. Factor out common parts shared by every term.
 *   3. Each extracted factor Fₖ = 0 is solved analytically.
 */
export function solveDetEqualsZero(
  expr: SymExpr,
  varLabels: string[],
): SingularCondition[] {
  const simplified = simplifyCancelTrig(expr)

  if (simplified.length === 0) {
    return [{ condition: 'det(JᵀJ) ≡ 0 (arm is always singular)', solutions: [], variables: varLabels }]
  }

  const factors = extractFactors(simplified)
  const conditions: SingularCondition[] = []
  const seen = new Set<string>()

  for (const fac of factors) {
    const cond = solveFactorEqualsZero(fac, varLabels)
    if (!cond) continue
    if (seen.has(cond.condition)) continue
    seen.add(cond.condition)
    conditions.push(cond)
  }

  return conditions
}

// ─── Factor extraction ────────────────────────────────────────────────────────

/**
 * Extract multiplicative factors by finding parts common to ALL terms.
 * E.g. if every term contains "s₂", factor that out and recurse.
 * Returns [commonFactor, ...remainderFactors] or [whole] if no common part.
 */
function extractFactors(expr: SymExpr): SymExpr[] {
  if (expr.length === 0) return []

  // Parts that appear in every term
  const commonParts = expr[0].parts.filter((p) =>
    expr.every((t) => t.parts.includes(p))
  )

  if (commonParts.length === 0) return [expr]

  // Factor out one common part at a time
  const factoredExpr: SymExpr = expr.map((t) => {
    const parts = [...t.parts]
    for (const p of commonParts) {
      const idx = parts.indexOf(p)
      if (idx >= 0) parts.splice(idx, 1)
    }
    return { neg: t.neg, parts }
  })

  const commonFactor: SymExpr = [{ neg: false, parts: commonParts }]
  return [commonFactor, ...extractFactors(factoredExpr)]
}

// ─── Individual factor solver ─────────────────────────────────────────────────

function solveFactorEqualsZero(factor: SymExpr, _vars: string[]): SingularCondition | null {
  // Collect trig labels
  const angleLabels = new Set<string>()
  for (const t of factor) {
    for (const p of t.parts) {
      const m = p.match(/^[cs]([0-9]+)$/)
      if (m) angleLabels.add(m[1])
    }
  }

  if (angleLabels.size === 0) {
    // Pure numeric constant
    const val = evalNumericExpr(factor)
    if (Math.abs(val) < 1e-9) {
      return { condition: '0 = 0 (identically singular)', solutions: [], variables: [] }
    }
    return null  // non-zero constant — this factor is never zero
  }

  const vars = Array.from(angleLabels)
  // Human-readable angle name: variable "2" → "θ2"
  const vName = (v: string) => `θ${v}`

  // ── 1 variable ──────────────────────────────────────────────────────────────
  if (vars.length === 1) {
    const v = vars[0]
    const cL = `c${v}`, sL = `s${v}`

    const hasCterms = factor.some((t) => t.parts.includes(cL))
    const hasSterms = factor.some((t) => t.parts.includes(sL))

    if (hasSterms && !hasCterms) {
      return { condition: `sin(${vName(v)}) = 0`, solutions: [0, 180, -180], variables: [v] }
    }
    if (hasCterms && !hasSterms) {
      return { condition: `cos(${vName(v)}) = 0`, solutions: [90, -90], variables: [v] }
    }
    // Mixed: A·sin + B·cos = 0  →  tan = -B/A
    const A = coeffOf(factor, [sL])
    const B = coeffOf(factor, [cL])
    if (Math.abs(A) > 1e-9 || Math.abs(B) > 1e-9) {
      const angDeg = normDeg((Math.atan2(-B, A) * 180) / Math.PI)
      const sols = [angDeg, normDeg(angDeg + 180)].filter((x, i, a) =>
        a.findIndex((y) => Math.abs(y - x) < 0.01) === i
      )
      return {
        condition: `${fmtCoeff(A)}sin(${vName(v)}) + ${fmtCoeff(B)}cos(${vName(v)}) = 0`,
        solutions: sols,
        variables: [v],
      }
    }
  }

  // ── 2 variables ─────────────────────────────────────────────────────────────
  if (vars.length === 2) {
    const [v1, v2] = vars
    const c1 = `c${v1}`, s1 = `s${v1}`, c2 = `c${v2}`, s2 = `s${v2}`

    const Asc = coeffOf(factor, [s1, c2])
    const Acs = coeffOf(factor, [c1, s2])
    const Acc = coeffOf(factor, [c1, c2])
    const Ass = coeffOf(factor, [s1, s2])

    const near = (a: number, b: number) => Math.abs(a - b) < 1e-6

    // sin(v1+v2): s1c2 + c1s2
    if (near(Asc, Acs) && near(Acc, 0) && near(Ass, 0) && Math.abs(Asc) > 1e-9) {
      return { condition: `sin(${vName(v1)}+${vName(v2)}) = 0`, solutions: [0, 180, -180], variables: [v1, v2] }
    }
    // sin(v1−v2): s1c2 − c1s2
    if (near(Asc, -Acs) && near(Acc, 0) && near(Ass, 0) && Math.abs(Asc) > 1e-9) {
      return { condition: `sin(${vName(v1)}−${vName(v2)}) = 0`, solutions: [0, 180, -180], variables: [v1, v2] }
    }
    // cos(v1+v2): c1c2 − s1s2
    if (near(Acc, -Ass) && near(Asc, 0) && near(Acs, 0) && Math.abs(Acc) > 1e-9) {
      return { condition: `cos(${vName(v1)}+${vName(v2)}) = 0`, solutions: [90, -90], variables: [v1, v2] }
    }
    // cos(v1−v2): c1c2 + s1s2
    if (near(Acc, Ass) && near(Asc, 0) && near(Acs, 0) && Math.abs(Acc) > 1e-9) {
      return { condition: `cos(${vName(v1)}−${vName(v2)}) = 0`, solutions: [90, -90], variables: [v1, v2] }
    }

    return {
      condition: `${exprToString(factor)} = 0`,
      solutions: [],
      variables: [v1, v2],
    }
  }

  // ── 3+ variables or unrecognized ─────────────────────────────────────────────
  return {
    condition: `${exprToString(factor)} = 0`,
    solutions: [],
    variables: vars,
  }
}

// ─── Utility functions ────────────────────────────────────────────────────────


function partsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const sa = [...a].sort(), sb = [...b].sort()
  return sa.every((v, i) => v === sb[i])
}

function evalNumericExpr(expr: SymExpr): number {
  let sum = 0
  for (const t of expr) {
    let prod = t.neg ? -1 : 1
    for (const p of t.parts) {
      const v = parseFloat(p)
      if (!isNaN(v)) prod *= v
      else return NaN
    }
    sum += prod
  }
  return sum
}

/**
 * Sum of scalar coefficients of terms whose trig parts exactly match `labels`.
 * E.g. coeffOf(expr, ['s₁','c₂']) sums terms that contain exactly s₁ and c₂
 * (with any additional numeric scalar factors).
 */
function coeffOf(expr: SymExpr, labels: string[]): number {
  let sum = 0
  for (const t of expr) {
    let rest = [...t.parts]
    let ok = true
    for (const lbl of labels) {
      const i = rest.indexOf(lbl)
      if (i < 0) { ok = false; break }
      rest.splice(i, 1)
    }
    if (!ok) continue
    // rest should be only numeric scalars
    let scalar = t.neg ? -1 : 1
    for (const p of rest) {
      const v = parseFloat(p)
      if (!isNaN(v)) scalar *= v
      else { scalar = NaN; break }
    }
    if (!isNaN(scalar)) sum += scalar
  }
  return sum
}

function normDeg(a: number): number {
  let x = ((a % 360) + 360) % 360
  if (x > 180) x -= 360
  return Math.round(x * 100) / 100
}

function fmtCoeff(v: number): string {
  if (Math.abs(v - 1) < 1e-9) return ''
  if (Math.abs(v + 1) < 1e-9) return '-'
  return parseFloat(v.toFixed(4)).toString()
}

// ─── EE symbolic translation helper ──────────────────────────────────────────

/**
 * Parse the symbolic cumulative translation of the EE frame into a SymVec3.
 * Used to pass to buildSymJacobian.
 */
export function eeSymTransFromStrings(symTrans: string[]): SymVec3 {
  return [
    parseSymStr(symTrans[0] ?? '0'),
    parseSymStr(symTrans[1] ?? '0'),
    parseSymStr(symTrans[2] ?? '0'),
  ]
}

// ─── Numeric evaluation (for verification) ───────────────────────────────────

/**
 * Evaluate the symbolic det(JᵀJ) formula at a given set of joint angle values.
 * Used to verify the symbolic result matches the numeric computation.
 *
 * @param expr       SymExpr for det(JᵀJ)
 * @param anglesDeg  Map from angle label (e.g. "1") to angle in degrees
 */
export function evalDetAtAngles(expr: SymExpr, anglesDeg: Map<string, number>): number {
  let sum = 0
  for (const term of expr) {
    let prod = term.neg ? -1 : 1
    for (const part of term.parts) {
      const cm = part.match(/^c([0-9]+)$/)
      const sm = part.match(/^s([0-9]+)$/)
      if (cm) {
        const deg = anglesDeg.get(cm[1]) ?? 0
        prod *= Math.cos((deg * Math.PI) / 180)
      } else if (sm) {
        const deg = anglesDeg.get(sm[1]) ?? 0
        prod *= Math.sin((deg * Math.PI) / 180)
      } else {
        const v = parseFloat(part)
        if (!isNaN(v)) prod *= v
        // unknown part → treat as 1
      }
    }
    sum += prod
  }
  return sum
}
