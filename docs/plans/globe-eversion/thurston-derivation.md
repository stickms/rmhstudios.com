# Globe Eversion — Thurston eversion derivation note (T03)

**Task:** T03 of [`../2026-10-17-globe-eversion-tasks.md`](../2026-10-17-globe-eversion-tasks.md)
(spec [`§4`](../2026-10-17-globe-eversion.md), §14 item 4).
**Consumers:** T08 (`lib/eversion/thurston.ts`, the TS oracle), T13 (orientation), T23 (the GLSL ES 3.00 port).
**Verification:** [`thurston-check.ts`](./thurston-check.ts) — run
`pnpm exec tsx docs/plans/globe-eversion/thurston-check.ts` (≈ 30 s); output pasted in §11.
**Fallback:** the Bednorz–Bednorz analytic eversion of the first T03 attempt is kept, verified, in
Appendix A and in [`bednorz-check.ts`](./bednorz-check.ts) (`thurston-check.ts --bednorz` runs it).

## 0. Route taken, provenance, licence

**Route: evert-referenced.** The product owner chose Thurston's corrugation eversion and explicitly
authorised referencing the Geometry Center `evert` code ("if necessary; otherwise re-derive").
It was necessary: neither Levy's _Making Waves_ nor any other text I could reach states the strip
cross-sections, the stage surfaces or the blending functions, and the first T03 attempt (Appendix A)
had to fall back on a different eversion because of that. This note is therefore the _mathematics_
of `evert`'s geometry generator, read from source, restated in this repo's conventions and
re-implemented from scratch in `thurston-check.ts`. **No source text is copied** into the repo;
only formulas, constants and the structure of the construction.

**What was read.**

- `evert` itself (Nathaniel Thurston, The Geometry Center, University of Minnesota;
  `http://www.geom.umn.edu/docs/outreach/oi/software.html`) was **not obtainable**: the Internet
  Archive is blocked by this environment's egress policy (`web.archive.org` answers "Blocked by
  egress policy") and `geom.umn.edu` is gone.
- Michael McGuffin's `sphereEversion` (`https://profs.etsmtl.ca/mmcguffin/eversion/`, page fetched
  2026-10-17), file `sphereEversion-0.4-src.zip` (Feb 2005, 54 982 bytes, sha-256
  `9af3c4c57412f30474c472aba53bfe1d86b56b00d252f5e940156b2cd219d652`), member
  `sphereEversion-0.4-src/generateGeometry.cpp` (945 lines) and `generateGeometry.h`. McGuffin
  states that this file's geometry code was "almost entirely taken (with slight adaptations) from
  the source code of `evert`". The archive was extracted into a scratch directory, read as text
  only; nothing from it was compiled or executed.

**Licence / copyright text found.** There is no `LICENSE` file, no SPDX tag and no copyright line
in the archive. The only statements are these, quoted verbatim.

`generateGeometry.cpp`, lines 1–13:

```
/*
    This file is part of "sphereEversion",
    a program by Michael McGuffin.
    The code in this file was almost entirely taken
    (with slight adaptations) from the source code of
    "evert", a program written by Nathaniel Thurston.
    evert's source code can be down loaded from
        http://www.geom.umn.edu/docs/outreach/oi/software.html
        http://www.geom.uiuc.edu/docs/outreach/oi/software.html

    Grateful acknowledgements go out to Nathaniel Thurston,
    Silvio Levy, and the Geometry Center (University of Minnesota)
    for making evert's source code freely available to the public.
*/
```

McGuffin's web page: "\*Based on a software program by Nathaniel Thurston developed at The Geometry
Center, University of Minnesota. Used with permission." and "Disclaimer: Use at your own risk. The
software on this webpage is provided "as is" and without warranty of any kind, either express or
implied."

**How to judge it.** The code is "freely available to the public" with attribution and permission
statements, but carries **no explicit licence grant**. This repo therefore copies no code: it uses
the construction (a mathematical object) and cites the authors. Please keep this attribution in the
`thurston.ts` docblock: _"Construction after N. Thurston's `evert` (The Geometry Center, University
of Minnesota) as presented by S. Levy, Making Waves (1995), via M. McGuffin's sphereEversion 0.4;
formulas re-derived and re-implemented for this repository."_ If the owner wants a clean-room
guarantee instead, the alternative is Appendix A (published paper, no strips).

**Departures from `evert` (deliberate, each verified in §11):** the stage times are smoothed,
overlapping quintic windows instead of five sequential linear segments (§7); the corrugation
amplitude is 0.7× `evert`'s, so `max‖F‖ ≤ 1.35` holds without a global scale (§9); the latitude ramp
`FF` is a quintic rather than a cubic (C² clamps, so the normal is continuous, §5). Everything else,
including every constant (0.9, 0.5, 1.1, 0.6, 1/64, 1.06, 0.05), is `evert`'s.

## 1. Summary

A _profile_ curve `Σ(u)` (a meridian of a surface of revolution) is swept around the polar axis by
`2πv/n`; to it is added, at each of the `n = 8` strips, a small **figure-eight cross-section** in the
plane spanned by the surface normal and the longitude direction. The figure-eights are the
corrugations. Five stages drive two things: the **profile** `Σ` (sphere → poles pushed through each
other → counter-rotation → un-pushed to the antipodal sphere) and the **amplitude/shape** of the
corrugations (zero → full → zero).

| quantity                        | value                                                                                      |
| ------------------------------- | ------------------------------------------------------------------------------------------ |
| strips `n` (`EVERSION_STRIPS`)  | 8 (must be ≥ ~6: McGuffin's page warns that too few strips pinch)                          |
| stages                          | corrugate, push, twist, unpush, uncorrugate (spec `EVERT_STAGES`)                          |
| windows (fraction of `e`)       | `[0,.16] [.10,.36] [.30,.70] [.64,.90] [.84,1]` (the spec §4.3 starting values, kept)      |
| `stageParams` slots             | 8: five windows, `κ = c(1−r)`, `sin πw`, `cos πw` (§7)                                     |
| corrugation amplitude `SIZE0`   | 0.14 (`evert`: 0.2); `max‖F‖ = 1.3357`, no global scale                                    |
| `R`                             | `−I` (antipodal map), `det −1`                                                             |
| min immersion `‖F_θ×F_φ‖/cos φ` | 0.0887 (polished global minimum); 0.152 on the dense grids; round sphere = 1               |
| proposed constants              | `IMMERSION_MIN` 0.05 (kept) · `POLE_EPS` 0.07 (was 0.02, §8.3) · `STAGE_OVERLAP` unchanged |
| halfway symmetry                | dihedral `D₈`, not "`π/n` rotation ∘ reflection" (§8.2)                                    |

## 2. Frames and the parameter map

`evert` works in a frame I call the **T-frame**: polar axis `+Z` (north), the profile at rest in the
plane `X = 0`, `u ∈ [0, 2]` latitude from the north pole (`u = 0`) through the equator (`u = 1`) to
the south pole (`u = 2`), `v ∈ [0, n]` longitude with one unit per strip. The sphere at rest is

```
a = πu/2,   ψ = 2πv/n,   (X, Y, Z) = (sin a sin ψ, sin a cos ψ, cos a)
```

**Map to our chart** (`lib/eversion/domain.ts`: body `x` right, `y` down, `z` toward the viewer,
`p(θ,φ) = (cos φ sin θ, −sin φ, cos φ cos θ)`):

```
u = 1 − 2φ/π          v = nθ/(2π)  (so ψ = θ)          θ ∈ [−π, π]  →  v ∈ [−n/2, n/2]
body (x, y, z) = (X, −Z, Y)                              (a proper rotation, det = +1)
```

At `e = 0` this gives `F = p` exactly. The seam `θ = ±π` is `v = ±n/2`, an integer, where every
periodic term is continuous. Strip coordinate: `v' = v − ⌊v⌋ ∈ [0, 1)`. The meridian `θ = 0`
(facing the viewer) is the `ψ = 0` profile, which is why the profile formulas below live in the
plane `X = 0`.

> Handedness. The body frame is left-handed (screen-handed). With arithmetic cross products, the
> outward normal at `e = 0` is **`∂φF × ∂θF`** (at `θ = φ = 0`: `(0,−1,0)×(1,0,0) = (0,0,1)`).
> That is the "winding normal" of spec §4.5: outward at `e = 0`, inward at `e = 1`.

## 3. The scalar ingredients (functions of `u` only)

Fold: `south = (u > 1)`, `uf = south ? 2 − u : u`, `σ = south ? −1 : +1`, so `d uf/du = σ`.

| name    | north (`u ≤ 1`)                                    | south (`u > 1`) | derivative (north / south)                  |
| ------- | -------------------------------------------------- | --------------- | ------------------------------------------- |
| `P₁(u)` | `2u − u²`                                          | `u² − 2u + 2`   | `2 − 2u` / `2u − 2`                         |
| `P₂(u)` | `u²`                                               | `−u² + 4u − 2`  | `2u` / `4 − 2u`                             |
| `W(u)`  | `3uf² − 2uf³`                                      | same in `uf`    | `σ · 6uf(1 − uf)`                           |
| `S(u)`  | `3uf² − 2uf³`                                      | same in `uf`    | `σ · 6uf(1 − uf)`                           |
| `FF(u)` | `Q5(x)`, `x = 1.06 uf − 0.05`, clamped to `[0, 1]` | same in `uf`    | `σ · 1.06 · 30x²(1−x)²` for `0<x<1`, else 0 |

`Q5(x) = 6x⁵ − 15x⁴ + 10x³`. `P₁` and `P₂` re-parametrise latitude (`P₁` lingers at the equator, `P₂`
at the poles; both map `[0,2]` onto `[0,2]` and are C¹). `W` blends polar (`W = 0`) and equatorial
(`W = 1`) behaviour. `FF` is 0 for `uf ≤ 0.0472` and 1 for `uf ≥ 0.9906`: **the corrugations do not
exist within 4.2° of a pole** and are at full strength in a band of ±0.9° about the equator. `S` is
the size envelope (zero at the poles). Angles: `a = πu/2`, `a₁ = πP₁/2`, `a₂ = πP₂/2`, with
`a₁' = (π/2)P₁'`, `a₂' = (π/2)P₂'`.

## 4. The profile `Σ(u)`: the five stage surfaces

Each stage surface has the form `Arc(α; xs, ys, zs)(u, ψ) = (xs sin(πα/2) sin ψ, ys sin(πα/2) cos ψ,
zs cos(πα/2))`. The construction needs only its profile (`ψ = 0`) and its longitude derivative
`g = ∂/∂ψ` at `ψ = 0`:

```
Arc(α; xs, ys, zs) at ψ = 0:   (0, ys sin(πα/2), zs cos(πα/2))        g = (xs sin(πα/2), 0, 0)
```

With `RotZ_θ(x,y,z) = (x cos θ + y sin θ, −x sin θ + y cos θ, z)` and
`RotY_θ(x,y,z) = (x cos θ − z sin θ, y, x sin θ + z cos θ)` (these sign conventions are `evert`'s;
with them the construction closes):

```
S1   = Arc(u;  1,  1,  1)         the unit sphere (e = 0)
S4   = Arc(u; −1, −1, −1) = −S1   the antipodal sphere (e = 1)
A    = Arc(P₁; 0.9, 0.9, −1)      polar caps: a slightly smaller sphere, flipped through the equator plane
B    = Arc(P₂; 1,   1,   0.5)     the equatorial belt: a sphere squashed to half height
S2   = (1−W) A + W B              "pushed": the poles have swapped places (z = ∓1)
T(w) = (1−W) RotZ_{σπw}(A) + W RotY_{πw}(B)          T(0) = S2;  T(1) = S3
```

`S3 = T(1) = (1−W) Arc(P₁; −0.9, −0.9, −1) + W Arc(P₂; −1, 1, −0.5)`, `evert`'s Stage 3. The twist
counter-rotates the two caps about the polar axis (`+πw` north, `−πw` south) and turns the belt by
`πw` about the T-frame `Y` axis (**body `z`, the viewer axis**). It is _not_ a "belt turned by `π/n`"
as the spec's stage table says: by the end the caps have turned a full relative turn, which the
`n`-fold symmetry hides.

**Unified profile.** `evert` runs the stages one after another. To let windows overlap (§7) I write
the same surfaces as one blend in the stage parameters `p` (push), `w` (twist), `q` (unpush), each in
`[0, 1]` (the corrugation uses `c` and `r`, §5):

```
Σ(u) = (1−q) [ (1−p) S1 + p T(w) ] + q S4
```

with the same blend applied to `Σ_u = ∂Σ/∂u` and to `g`. At non-overlapping times this is exactly
`evert`: only `c` running gives `Σ = S1`; `p` running (`w = q = 0`) gives `lerp(S1, S2)`; `w` running
(`p = 1`, `q = 0`) gives `T(w)`; `q` running (`p = w = 1`) gives `lerp(S3, S4)`.

Derivatives (closed form; needed for the tangent `du`):

```
S1_u = (π/2)(0, cos a, −sin a)                S4_u = −S1_u
A_u  = (0, 0.9 cos a₁ · a₁', sin a₁ · a₁')    B_u  = (0, cos a₂ · a₂', −0.5 sin a₂ · a₂')
T_u  = −W' RotZ(A) + (1−W) RotZ(A_u) + W' RotY(B) + W RotY(B_u)
```

with `RotZ = RotZ_{σπw}`, `RotY = RotY_{πw}`. Written out: `RotZ(A) = (0.9 s₁ sin σπw, 0.9 s₁ cos σπw,
−c₁)` and `RotY(B) = (−0.5 c₂ sin πw, s₂, 0.5 c₂ cos πw)`, with `s₁ = sin a₁`, `c₁ = cos a₁`,
`s₂ = sin a₂`, `c₂ = cos a₂`. The longitude derivatives are
`g_A = (0.9 s₁ cos πw, −0.9 s₁ σ sin πw, 0)` and `g_B = (s₂ cos πw, 0, s₂ sin πw)`, blended with the
same weights.

**Poles.** `u = 0`: `Σ = (0, 0, Z_N)` with `Z_N(p,q) = (1−q)(1−2p) − q`; `u = 2`: `Z_S = −Z_N`. They
are fixed points of the corrugation (§5) and move only under push/unpush; both are on the axis for
every `e`.

## 5. The corrugation: one figure-eight per strip

Let `du = Σ_u/‖Σ_u‖`, `n = (g × du)/‖g × du‖` (the outward surface normal of the profile surface; it
flips with the surface) and `t = du × n` (the longitude direction). Amplitude and "form":

```
m(u) = SIZE0 · κ · FF(u) · S(u)  ≥ 0           m_u = SIZE0 · κ · (FF' S + FF S')
f(u) = κ · FF(u),    f' = 2f − f²,             κ = c (1 − r),    SIZE0 = 0.14   (evert: 0.2)
```

In `evert` `size = −m` and `ĥ = (du × g)/‖·‖ = −n`; the two minus signs cancel, which gives the
vectors below. The cross-section is a function of the strip coordinate `v' ∈ [0, 1)`:

```
raw(v') = 1 − cos 4πv'                for v' ≤ 1/4 or v' ≥ 3/4
        = 3 + cos 4πv'                for 1/4 < v' < 3/4
H(v')   = 0.6 · raw(v')               ∈ [0, 2.4]   (C¹; its 2nd derivative jumps at 1/4 and 3/4)
G(v')   = (1 − f')·2(1 − cos 2πv') + f'·H(v')
offset  = 1.1 m · t · sin 4πv'  +  ( m n − m_u du · H²/64 ) · G(v')
```

Interpretation. With `f = 0` (near the poles) `G = 2(1 − cos 2πv')` and the section is a true
**figure-eight** (lobes of half-width 1.1m, height 4m along the normal, crossing at 2m). With `f = 1`
(the equator band) `G = H` and the two lobes become **two ellipses touching at one point**; `f'`
eases between them. The `−m_u du H²/64` term bends each fin along the meridian so that it follows
the changing amplitude.

**Assembly.**

```
o(u, v) = Σ(u) + offset(u, v')
F_T     = ( o_x cos ψ + o_y sin ψ,  −o_x sin ψ + o_y cos ψ,  o_z ),      ψ = 2πv/n = θ
F       = ( F_T,X ,  −F_T,Z ,  F_T,Y )                                    (body frame)
```

Because `m = 0` for `uf ≤ 0.0472` (that is `π/2 − |φ| < 0.0741`) and at `e = 0` and `e = 1`
(`κ = 0`), the surface there is **exactly the surface of revolution of the profile**: `F = Rψ Σ(u)`.
At `e = 0` that is the unit sphere; at `e = 1` the antipodal sphere. Continuity across strips: at
`v' = 0⁺` and `v' = 1⁻` the offset and its `v`-derivative agree (`sin 4πv'` has slope 4π on both
sides; `G` and `H` have zero slope at the ends).

**Smoothness.** The ramp `FF` is a quintic where `evert`'s is a cubic, so `m` is C² and `F` is C¹ in
`u` (continuous normal), apart from the sign flip of `RotZ_{σπw}` at the equator, whose
discontinuity is second order (`1 − W` has a double zero there). Measured normal jump across the
equator and the `FF` clamps: ≤ 0.3° (finite-difference noise included).

## 6. Why it is an immersion (what is proven vs checked)

`evert` is the construction behind the film _Outside In_; its regularity rests on Thurston's
argument (corrugate so each strip's cross-section is a figure-eight; each later stage then changes
the profile, not the immersion class). I do **not** reproduce a proof. What is established here is
numerical: the overlapped, rescaled, quintic-`FF` variant of this note passes the immersion test on
dense grids and under pattern-search minimisation (§11). Necessary conditions are visible: `‖Σ_u‖ ≥
0.75` everywhere (the profile never stalls), the figure-eight frame is defined wherever `m > 0`, and
the amplitude has to be big enough:

| `SIZE0` | true minimum of `‖F_θ×F_φ‖/cos φ` (cubic `FF`, same windows) | `max‖F‖` |
| ------- | ------------------------------------------------------------ | -------- |
| 0.10    | **0.000** (pinch)                                            | 1.240    |
| 0.12    | 0.0235                                                       | 1.288    |
| 0.13    | 0.0523                                                       | 1.312    |
| 0.14    | 0.0796 (quintic `FF`: 0.0887)                                | 1.336    |
| 0.16    | 0.124                                                        | 1.384    |
| 0.20    | 0.150 (`evert`'s own amplitude)                              | 1.480    |

So corrugations below ≈ 0.13 pinch: this is the "not enough strips or amplitude and the eversion
will not be smooth" warning on McGuffin's page. 0.14 is the smallest value with a decent margin that
also respects the viewport bound. As a cross-check of the unified blend, `evert`'s own sequential
schedule (breakpoints `0, .10, .23, .60, .93, 1`, linear in each stage, amplitude 0.2, cubic `FF`) was
run during development: minimum immersion 0.29, `max‖F‖` 1.476.

## 7. Stage parameters, windows, and the `stageParams` slots (spec §4.3)

Window `k` with `[a_k, b_k]`: `s_k(e) = Q5((e − a_k)/(b_k − a_k))`, clamped to `[0, 1]` (the quintic
smoothstep: C² at both ends).

| slot | name        | symbol   | window         | drives                                           |
| ---- | ----------- | -------- | -------------- | ------------------------------------------------ |
| 0    | corrugate   | `c`      | `[0.00, 0.16]` | corrugation amplitude/form grows                 |
| 1    | push        | `p`      | `[0.10, 0.36]` | `S1 → T`: the caps pass through the belt         |
| 2    | twist       | `w`      | `[0.30, 0.70]` | `T(w)`; **halfway model at `e = 0.5`** (`w = ½`) |
| 3    | unpush      | `q`      | `[0.64, 0.90]` | `→ S4`                                           |
| 4    | uncorrugate | `r`      | `[0.84, 1.00]` | corrugation amplitude/form shrinks               |
| 5    | derived     | `κ`      | —              | `c · (1 − r)`                                    |
| 6    | derived     | `sin πw` | —              | saves a trig call per vertex                     |
| 7    | derived     | `cos πw` | —              | "                                                |

The windows are the **spec's starting windows, unchanged**: they passed the immersion test on the
first attempt, so the "tune against test 8" loop of spec §4.3 closed immediately. Adjacent windows
overlap by 0.06 of `e`, i.e. 38 %, 23 %, 23 % and 38 % of the shorter window of each pair
(`STAGE_OVERLAP = 0.3` is the starting figure; no change was needed). The
schedule is mirror-symmetric (`e ↔ 1−e` swaps push/unpush and corrugate/uncorrugate), which puts the
halfway model at `e = ½`. The table below is printed by the check script.

```
   e       c(corr)  p(push)  w(twist)  q(unpush)  r(uncorr)  kappa
  0.00      0.000     0.000     0.000     0.000     0.000     0.000
  0.10      0.725     0.000     0.000     0.000     0.000     0.725
  0.16      1.000     0.084     0.000     0.000     0.000     1.000
  0.30      1.000     0.916     0.000     0.000     0.000     1.000
  0.36      1.000     1.000     0.027     0.000     0.000     1.000
  0.50      1.000     1.000     0.500     0.000     0.000     1.000
  0.64      1.000     1.000     0.973     0.000     0.000     1.000
  0.70      1.000     1.000     1.000     0.084     0.000     1.000
  0.84      1.000     1.000     1.000     0.916     0.000     1.000
  0.90      1.000     1.000     1.000     1.000     0.275     0.725
  1.00      1.000     1.000     1.000     1.000     1.000     0.000
```

`stageParams` is pure CPU; the shader does no window math. Every window is a quintic, so `F` is C¹ in
`e` everywhere and the second difference is bounded (§11).

## 8. End map, halfway model, poles

### 8.1 `R`

At `e = 0` all of `c,p,w,q,r` are 0: `Σ = S1`, `m = 0`, so `F = p`. At `e = 1`: `p = w = q = r = 1`,
`Σ = S4 = −S1`, `κ = 0`, so `F = −p`. **`R = −I`**, the antipodal map: central, `det −1`; Kabsch
returns it to 6e−18. Consequences for T13: `M_after = R⁻¹∘Rot_align = −Rot_align`; the spec's
example of a mirror-plane `R` does not apply. A page read through `−I` differs from one read through a
mirror by a half turn, so T13 must define "page-up" for `after` accordingly (S#13 is about the
Jacobian sign and the up vector).

### 8.2 The halfway model and its symmetry (S#11)

At `e = ½` the parameters are `(c,p,w,q,r) = (1,1,½,0,0)`. `F(·, ½)` has **dihedral symmetry `D₈`**
(order 16), verified to 1e−15:

- (a) `F(θ + 2π/8, φ) = Ry(2π/8) F(θ, φ)`: rotation about the polar axis (body `y`). This holds at
  every `e` (the construction is an `n`-fold sweep) and says nothing special about `½`.
- (b) `F(−θ, −φ) = diag(−1, −1, +1) F(θ, φ)`: a half turn about the viewer axis (body `z`) composed
  with the latitude flip (the caps are exchanged). This is the one that is special to `e = ½`.
- (c) Composing, `F(−θ + 2πk/8, −φ) = Ry(2πk/8) diag(−1,−1,1) F(θ, φ)` for every `k`.

All the group elements have `det +1`: the spec's "rotation by `π/n` composed with a reflection"
(S#11) does not hold and should be replaced by (a)–(c). There is **no** exact time-reversal symmetry
`F(·, 1−e) ≅ g F(·, e)` (searched over `D₈` ∘ latitude flips: no match), so T08 must not test one.

### 8.3 Poles and normals

- The pole is `F = (0, −Z_N, 0)` (north) and `(0, +Z_N, 0)` (south) in body coordinates, with
  `Z_N = (1−q)(1−2p) − q` (§4): `+1` at rest, `−1` once `p = 1`, then constant. It is independent of
  `θ`.
- The winding normal (`∂φF × ∂θF`, §2) at a pole is **constant**: north `(0,−1,0)`, south `(0,+1,0)`
  for every `e` (77 184 of 77 184 samples). The surface does not stay flat though: the true normal
  tilts 2.4° at polar radius 0.01 rad, 7.3° at 0.03 and 12° at 0.05.
- So the **spec's constant analytic pole normal is only good to ≈ 0.003 rad.** An exact alternative
  exists: in the surface-of-revolution zone `π/2 − |φ| < 0.0741` the outward-by-winding normal is,
  in the T-frame before the `ψ` rotation and the frame map,

  ```
  N_T(u) ∝ ẑ (Σ_u · Σ) − Σ (Σ_u · ẑ),    then  RotZ_ψ N_T,   then  (X, Y, Z) → (X, −Z, Y)
  ```

  (checked against finite differences to 2e−6°). At the pole itself (`φ = ±π/2`, where this is 0/0)
  use the constant above. **Proposed `POLE_EPS = 0.07`** (below 0.0741, so the zone is exact);
  outside it, finite differences of `F` (central, `h ≈ 1e−4` in the oracle, `1e−3` in float32, in `θ`
  and `φ`), `n = normalize(∂φF × ∂θF)`.

- The corrugation does not touch the poles: the polar-chart immersion (tangent-plane coordinates
  `(x, z)` about each pole, radii 1e−3…0.25, 201 `e`) has minimum 1.0000, so the mesh's polar fans
  need no special treatment beyond the normal.

## 9. Scale and boundedness (S#10)

`max‖F‖ = 1.3357` (at `e = 0.16`, `φ ≈ 0`, the corrugation crests at full amplitude). It is the
plateau value for `e ∈ [0.15, 0.65]` and falls to exactly 1.000 for `e ≥ 0.75` (once the surface has
inverted the corrugations point inward). **No global scale is applied (scale = 1).** The amplitude
`SIZE0 = 0.14` is the knob: `evert`'s 0.2 reaches 1.48 and would need a global scale of ≤ 0.91,
which would also shrink `F(·, 0)` unless made `e`-dependent. Margin 0.014; the 512 × 256 sampling per
`e` agrees with the dense grids to 1e−3 (the crest is a smooth maximum). In time:
`max‖∂F/∂e‖ ≈ 14.4` and `max‖∂²F/∂e²‖ ≈ 170`, both flat as `δ` halves, so F is C¹ in time with no
kink at any window boundary.

## 10. Notes for implementers

**T08 (oracle).** Implement §3–§5 and §7 literally. The check script's split into `frame` (everything
depending on `u` and the stage) and `point` (everything depending on `v`) is the right factoring:
the mesh's rows share frames. Guard the normalisations: `‖Σ_u‖ ≥ 0.75` always, but `g = 0` at the
poles and `m = 0` in the revolution zone make `g × du` vanish, so return zero vectors there (the
offset is then 0 anyway). `v = nθ/2π`, `v' = v − ⌊v⌋`, and the rotation angle is `θ` itself. `SIZE0` is
internal to `thurston.ts` (not a shared constant). `κ = c(1 − r)` is the only way the corrugation
amplitude depends on `e`.

**T09 (mesh).** Latitude rings near the equator should resolve `FF`'s clamp at `uf = 0.9906`
(`|φ| < 0.9°`), and at least 12 longitude samples per strip (the section has features at
`v' = ¼, ½, ¾`); 8 strips × 16 = 128 is the stated floor (`TIERS.low`).

**T13.** `R = −I` (§8.1), halfway symmetry §8.2, winding normal §2 and §8.3.

**T23 (GLSL ES 3.00).** The whole of `F` is branch-light and loop-free.

- _Per vertex, uniform-independent:_ `u`, `uf`, `σ`, `P₁`, `P₂` and derivatives, `W, W', S, S', FF, FF'`,
  `sin/cos` of `a, a₁, a₂`. They depend only on `φ`: compute them in the shader (cheap) or bake as
  a per-ring attribute.
- _Uniform-driven:_ the stage slots only. `p, w, q` mix the profile; `κ` scales `m, m_u, f`;
  `sin πw, cos πw` rotate the two arcs. `c` and `r` enter only through `κ`, so slots 0 and 4 are
  not read by the shader.
- _Branches:_ `south` (use `uf = min(u, 2−u)` and `σ = u > 1 ? −1 : 1`), the `FF` clamp
  (`clamp(x,0,1)`, derivative zero outside: use `step`), and the `v' ∈ (¼, ¾)` switch in `raw`
  (`step`/`mix`). All are continuous in their inputs, so `mix` forms introduce no parity gap.
- _Precision._ All `highp`. Take `v' = fract(v)` first (the argument of `4πv'` stays below 12.6) and
  use `ψ = θ` for the final rotation (do not rebuild it from `v'`). The cancellation hazards are
  `‖Σ_u‖` (≥ 0.75, benign), `normalize(g × du)` near the poles (guard with `length > 1e−6`; the
  offset is multiplied by `m = 0` there) and the finite-difference normal. Parity target S#27
  (1e−4) is comfortable in float32 away from the `H` kinks.
- _Normals._ Central differences of `F` (step 1e−3 rad in `θ` and `φ`: four more evaluations) and,
  for `|φ| > π/2 − POLE_EPS`, the analytic revolution-zone normal of §8.3 (this also removes the FD
  noise where `cos φ → 0`). Orientation `n = normalize(∂φF × ∂θF)` with `gl_FrontFacing` as in
  spec §4.5. `H` has a jump in its second derivative at `v' = ¼, ¾` (and nothing else is
  discontinuous in the first derivative), so FD steps ≥ 1e−3 are safe.
- _Cost._ About 150 flops and 6 trig calls for the profile frame, 30 flops and 4 trig calls for the
  point; five times that with FD normals. Comfortable at 256 × 128 vertices.

**T10 (events).** The five stage names map one-to-one onto the five windows (`EVERT_STAGES`).

## 11. Verification output

`pnpm exec tsx docs/plans/globe-eversion/thurston-check.ts` (shared 4-core box): all checks pass, exit
code 0.

```
PASS  S6  F(.,0) = identity  max |F-p| = 3.85e-16 over 8192 points
PASS  S7  F(.,1) = R p  (Kabsch, reflection allowed)  residual = 3.85e-16, det R = -1.000000000, |R^T R - I| = 1.40e-36
PASS      R equals -I (the antipodal map)  max |R + I| = 5.99e-18
PASS      profile speed |P_u| never degenerates (u in (0,2), 401 e)  min |P_u| = 0.7523 at e=0.233 u=1.440  (unit sphere: pi/2 = 1.5708)
PASS  S8  immersion |F_th x F_ph|/cos(phi), 128x64 grid x 201 e  min = 0.1651 at e=0.785 theta=-2.921 phi=0.810  (round sphere = 1; proposed IMMERSION_MIN 0.05)
PASS  S8  immersion, 2001 values of e (64 x 32 grid)  min = 0.2209 at e=0.7780 theta=-1.325 phi=-0.834
PASS      immersion on 360 latitude rings x 96 longitudes x 201 e  min = 0.1522 at e=0.780 theta=-2.141 phi=-0.826 (-47.34 deg)
PASS      immersion, pattern-search polish of the worst samples (multistart)  true min ~ 0.0887 at e=0.4532 theta=-1.3744 phi=0.8767
PASS      polar-chart immersion |dF/dx x dF/dz| (both poles, r = 1e-3 .. 0.25)  min = 1.0000 at pole=S e=0.000 r=0.001 az=5
PASS      winding normal at the poles is constant: N = -y, S = +y, for every e  77184/77184
      worst tilt of the true normal away from the pole axis (deg), by polar radius r (rad): 0.001: 0.24  0.003: 0.73  0.01: 2.43  0.02: 4.85  0.03: 7.25  0.05: 12.01  0.1: 23.49  0.25: 56.42
PASS      analytic revolution-zone normal vs finite differences (|phi| > pi/2 - 0.0742)  max angle error = 2.09e-6 deg at e=0.150 u=1.9860 theta=-0.853
PASS  S9  Lipschitz in e (delta = 1/2000)  max |dF/de| ~ 14.35  (1/1000: 14.35, 1/4000: 14.35); within 2.5 delta of a window boundary: 7.45
PASS      bounded 2nd difference (C1 in time): max |d2F|/delta^2 does not grow under delta -> 0  1/1000 -> 170.0, 1/2000 -> 170.0, 1/4000 -> 170.0; at boundaries (1/4000): 169.1
      max |F| by e: 0.00:1.000  0.05:1.088  0.10:1.256  0.15:1.335  0.20:1.336  0.25:1.336  0.30:1.336  0.35:1.336  0.40:1.336  0.45:1.336  0.50:1.335  0.55:1.335  0.60:1.335  0.65:1.334  0.70:1.167  0.75:1.000  0.80:1.000  0.85:1.000  0.90:1.000  0.95:1.000  1.00:1.000
PASS  S10 max |F| <= 1.35 (no global scale)  max |F| = 1.3357 at e=0.160 phi=-0.006; margin 0.014
PASS  S11 halfway symmetry: D_8 (2 pi/8 about the polar axis; half turn with latitude flip)  max errors (a) 1.20e-15, (b) 5.62e-16, (c) 9.76e-16

   e       c(corr)  p(push)  w(twist)  q(unpush)  r(uncorr)  kappa
  0.00      0.000     0.000     0.000     0.000     0.000     0.000
  0.10      0.725     0.000     0.000     0.000     0.000     0.725
  0.16      1.000     0.084     0.000     0.000     0.000     1.000
  0.30      1.000     0.916     0.000     0.000     0.000     1.000
  0.36      1.000     1.000     0.027     0.000     0.000     1.000
  0.50      1.000     1.000     0.500     0.000     0.000     1.000
  0.64      1.000     1.000     0.973     0.000     0.000     1.000
  0.70      1.000     1.000     1.000     0.084     0.000     1.000
  0.84      1.000     1.000     1.000     0.916     0.000     1.000
  0.90      1.000     1.000     1.000     1.000     0.275     0.725
  1.00      1.000     1.000     1.000     1.000     1.000     0.000

ALL CHECKS PASSED  (31.7 s)
```

How to read it. **Immersion** is the key row: `‖∂θF × ∂φF‖/cos φ` is 1 on the round sphere and a
zero is a pinch. The minimum is 0.165 on the 128 × 64 grid at 201 `e`, 0.221 at 2001 `e`, 0.152 on 360
latitude rings (every 0.5°), and the true minimum found by pattern search from 45 starts is
**0.0887** (`e ≈ 0.453`, `|φ| ≈ 0.88`, inside the twist window). **Proposed `IMMERSION_MIN = 0.05`**
(the existing provisional value, a factor 1.8 below the true minimum). The "bounded 2nd difference"
row is the C¹-in-time test: `max‖d²F‖/δ²` is flat as `δ` halves twice. Not covered: the immersion is
sampled and searched, not proven; finite-difference derivatives use step 1e−5.

## 12. Departures from the spec text, and proposed amendments

| #   | Spec item                                                | Reality here                                                                                              | Affects       |
| --- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------- |
| 1   | §4.2 domain `θ ∈ [0, 2π)`                                | `[−π, π]`, `θ = 0` facing the viewer (T01 froze it); `v = nθ/2π`.                                         | —             |
| 2   | §4.2 twist: "belt rotates by `π/n`"                      | Caps `±π` about the polar axis, belt `π` about the viewer axis (§4); the `n`-fold symmetry hides the `π`. | T10 wording   |
| 3   | §4.3 windows                                             | Unchanged; they pass.                                                                                     | —             |
| 4   | §4.4 constant analytic pole normal, `POLE_EPS = 0.02`    | Constant normal is good to 0.003 rad only; use the revolution-zone normal (§8.3) with `POLE_EPS = 0.07`.  | T08, T09, T23 |
| 5   | S#11 "`π/n` rotation ∘ reflection"                       | `D₈` (§8.2).                                                                                              | T08 tests     |
| 6   | S#8 `IMMERSION_MIN`                                      | Keep 0.05 (true minimum 0.0887).                                                                          | —             |
| 7   | S#10 `1.35`                                              | Holds at 1.3357, scale 1, with `SIZE0 = 0.14`.                                                            | —             |
| 8   | §4.2 "second half = first half time-reversed ∘ symmetry" | The schedule is symmetric; the surface is symmetric only at `e = ½` (§8.2).                               | T08 tests     |
| 9   | §4.5 `R` "orientation-reversing isometry"                | `R = −I` exactly (§8.1).                                                                                  | T13           |

None of these needs a contract-file change: `EVERSION_STRIPS = 8`, `STAGE_WINDOWS`,
`STAGE_PARAM_COUNT = 8` and `IMMERSION_MIN` stand; only `POLE_EPS` changes value (0.02 → 0.07), which
tasks §0.4 allows as a value change.

---

## Appendix A. Fallback: the Bednorz–Bednorz analytic eversion (verified, not used)

The first T03 attempt, written when `evert` could not be found, implemented A. Bednorz and W.
Bednorz, _Analytic sphere eversion using ruled surfaces_, Differential Geometry and its Applications
64 (2019) 59, arXiv:1711.10466. It is a closed-form eversion with no strips and `n = 2` fixed (a
sextic halfway model with a quarter-turn symmetry), `R = −I`, no global scale (`max‖F‖ = 1.04`),
minimum immersion margin 0.0528 (grid; 0.0540 on 2001 `e`), peak speed 15.8, area stretch up to
12.6×. It passed every check in the T03 brief (script [`bednorz-check.ts`](./bednorz-check.ts), 9 s;
`thurston-check.ts --bednorz` runs it). It is the route if the owner rules out the `evert`
provenance of §0; it has no visible corrugations, and spec amendments for it (no strips, `R = −I`,
four windows instead of five, `IMMERSION_MIN` 0.02, `POLE_EPS` 0.01) were listed in the first
attempt's note (see git history of this file). Condensed record of the construction:

**Frames and constants (that attempt).** Math frame with the polar axis on `+z`:
`p(θ,φ) = (cos φ cos θ, cos φ sin θ, sin φ)`; to the body frame apply
`C = [[0,−1,0],[0,0,−1],[1,0,0]]` (`det +1`). `c = cos φ`, `s = sin φ`; `p` is a surface parameter,
not the sphere point. Stage parameters `t, q, p, ξ, α, γ, λ` (`γ = 2√α`), constants `η = T² = 25/9`,
`ω = 4`, `β = 1`, `κ = ¼`, `Q = 0.6`, `T = 1/Q`.

**A.1 The map `F(θ, φ, e)` (pure closed form)**

Given `stageParams(e) = {t, q, p, ξ, α, λ}` (with `γ = 2√α`, so `α = γ²/4`; see §3.4), and
constants `η, ω` (`β = 1`, `κ = 1/4`).

**3.1 Ruled cylinder (used when `λ = 1`)**

```
h = ω · s / c²
x = t·cos θ + p·sin θ − h·sin θ
y = t·sin θ + p·cos θ + h·cos θ
z = h·sin 2θ − (t/2)·cos 2θ − q·t·h
```

(Paper eq. 4 with `n = 2`.) At `t = 0, p = 1, q = 0` this is the halfway sextic
`x = sin θ − h sin θ`, `y = cos θ + h cos θ`, `z = h sin 2θ` (paper eq. 1). It is an
immersion iff `(n−1)·p·(1−q|t|) + q·t² > 0` (paper Appendix A, eq. 5). With the
schedule's `p = 1 − |q t| ∈ [0, 1]` the left side is `(1−q|t|)² + q t²`, which is
positive for all `(q, t)` reachable here (`q|t| ≤ 1`, and if `q = 0` then `p = 1`).

**3.2 Sphere ↔ wormhole blend (used when `λ < 1`)**

Only ever used with `p = 0` and `q·t = ±1` (the schedule guarantees `λ = 1` whenever
`p > 0`). With `μ = 1 − λ + λc²`:

```
x = (t·μ·cos θ − λ·ω·s·sin θ) / c²
y = (t·μ·sin θ + λ·ω·s·cos θ) / c²
z = λ·( ω·s·(sin 2θ − q·t)/c² − (t/2)·cos 2θ )
    − (1−λ)·η^{5/4}·t·|t|^{1/2}·s / c⁴
```

(Paper eqs. 12, 15.) At `λ = 1` this coincides with §3.1 with `p = 0`, so the shader
branches on the uniform `λ ≥ 1` (a uniform branch; the CPU sends exactly `1.0`).

**3.3 Damping**

```
D  = ξ + η·(x² + y²)
x₁ = x · D^(−1/4),   y₁ = y · D^(−1/4),   z₁ = z / D
```

(Paper eq. 7 with `κ = (n−1)/2n = 1/4`.)

**3.4 Inversion**

With `r² = x₁² + y₁²`, `den = α + r²`, `A = (α − r²)/den`, `γ = 2√α`:

```
X = x₁ · exp(γ z₁) / den
Y = y₁ · exp(γ z₁) / den
Z = A · E(γ, z₁) + (γ/2) · (1 − r²) / ( den · (α + 1) )
E(γ, w) = (exp(γ w) − 1) / γ           (→ w as γ → 0; use expm1 / series)
```

This is paper eq. 8 rewritten so that nothing divides by `γ`: the paper's
`Z = [A·e^{γ z₁} − (α−1)/(α+1)] / γ` has the identity
`A − (α−1)/(α+1) = 2α(1−r²)/(den(α+1))` (with `β = 1`, `γ² = 4α`), which gives the
`(γ/2)(1−r²)/(den(α+1))` term. **The schedule drives `γ` (and sets `α = γ²/4`),
not `α`**: written in `α`, the map contains `√α`, which makes the motion non-smooth
in time at the instant `α` leaves zero (measured: second difference of `F` grew like
`δ^{−1/2}`). Written in `γ` the dependence is analytic.

**3.5 Final reflection**

```
F(θ, φ, e) = −(X, Y, Z)
```

The paper's start sphere is `−p`; negating the whole family makes `F(·, 0) = p`
exactly. (A reflection of a regular homotopy is a regular homotopy, and the
immersion quantity `‖∂θF × ∂φF‖` is unchanged.)

**3.6 Specialisations worth knowing**

- With `ξ = α = γ = 0` (the sphere ends of the schedule) §3.3–3.4 collapse to the
  paper's "closing" inversion `X = η^{1/4}·x·ρ^{−3/2}`, `Z = −z/(ηρ²)`, `ρ² = x²+y²`.
- `sin 2θ = 2 sin θ cos θ`, `cos 2θ = 1 − 2 sin²θ`; `c⁴ = c₂²`; `D^{−1/4}` is
  `inversesqrt(sqrt(D))`. Per vertex the cost is a few dozen flops, no loops.
- Everything is smooth in `θ` (periodic) and in `(ξ, γ, t, q, p, λ)`; the only
  non-analytic spots are `|t|^{1/2}` (only evaluated at `t = ±T`, where `λ < 1`) and the
  `λ ≥ 1` branch (continuous, see §3.2).

**A.2 Stage parameters and windows (that attempt)**

Quintic smoothstep `S₅(u) = u³(u(6u − 15) + 10)`, clamped to `[0, 1]`;
`ramp(e, [a, b]) = S₅((e − a)/(b − a))`; `bump(e, w) = ramp(e, w)` for `e < ½`, else
`ramp(1 − e, w)` (the mirrored window).

```
λ(e)  = bump(e, stretch)
open  = bump(e, open)
ξ(e)  = 2 · open            γ(e) = 2 · open        α(e) = γ(e)² / 4
q(e)  = max(0, 0.6 · (1 − bump(e, unfold)))
t(e)  = −5/3 + (10/3) · ramp(e, sweep)             (ramp, not bump: monotone)
p(e)  = max(0, 1 − |q·t|)
```

| window    | range in the first half | second half (mirror) | what moves                                        | Levy-style name (nearest) |
| --------- | ----------------------- | -------------------- | ------------------------------------------------- | ------------------------- |
| `stretch` | `[0.00, 0.26]`          | `[0.74, 1.00]`       | `λ`: round sphere → wormhole                      | corrugate / uncorrugate   |
| `open`    | `[0.16, 0.34]`          | `[0.66, 0.84]`       | `ξ, γ`: inversion opens out                       | push / unpush             |
| `unfold`  | `[0.26, 0.44]`          | `[0.56, 0.74]`       | `q`: `Q → 0` (and back)                           | push / unpush             |
| `sweep`   | `[0.28, 0.72]`          | —                    | `t: −T → +T` (**the eversion; halfway at e = ½**) | twist                     |

Overlaps are deliberate (neighbouring windows overlap by 0.08–0.16 of `e`, i.e. ≈ 45–90 %
of the shorter window; the spec's starting point was 30 %. Widening the windows was
what brought the peak speed `max‖∂F/∂e‖` from 29 down to 16). Hard constraints that must be kept
when tuning: **`λ` must reach 1 before `q` starts to fall** (`p > 0` is incompatible
with the §3.2 formula), and **`q` must reach 0 before `t` crosses 0** (so `p = 1 − |qt|`
has no kink). Table of the parameters (printed by the check script):

```
   e      t       q      p     xi    alpha  lambda
  0.00  -1.667  0.600  0.000  0.000  0.000  0.000
  0.16  -1.667  0.600  0.000  0.000  0.000  0.709
  0.26  -1.667  0.600  0.000  1.207  0.364  1.000
  0.28  -1.667  0.593  0.012  1.580  0.624  1.000
  0.34  -1.598  0.362  0.421  2.000  1.000  1.000
  0.44  -0.811  0.000  1.000  2.000  1.000  1.000
  0.50   0.000  0.000  1.000  2.000  1.000  1.000
  0.56   0.811  0.000  1.000  2.000  1.000  1.000
  0.66   1.598  0.362  0.421  2.000  1.000  1.000
  0.72   1.667  0.593  0.012  1.580  0.624  1.000
  0.74   1.667  0.600  0.000  1.207  0.364  1.000
  0.84   1.667  0.600  0.000  0.000  0.000  0.709
  1.00   1.667  0.600  0.000  0.000  0.000  0.000
```

**CPU side (T08's `stageParams`, T23's uniforms):** `u_t, u_q, u_p, u_xi, u_alpha, u_gamma,
u_lambda` (7 floats) plus the constants `η = 25/9`, `ω = 4`. The shader does no window
math. Send `u_lambda` as exactly `1.0` when saturated.

**A.3 The end isometry `R`**

At `e = 0`: `t = −T`, `q = Q`, `p = 0`, `ξ = α = 0`, `λ = 0`. §3.2 gives
`x = −T cos θ / c²`, `y = −T sin θ / c²`, `z = +η^{5/4} T^{3/2} s / c⁴`, hence
`ρ = T / c²` and (§3.6)
`X = η^{1/4} · (−T cos θ/c²) · c³ / T^{3/2} = −η^{1/4} T^{−1/2} · c cos θ`, likewise `Y`,
and `Z = −z/(ηρ²) = −η^{1/4} T^{−1/2} · s`. With `η = T²`, `η^{1/4} T^{−1/2} = 1`, so
`(X, Y, Z) = −p` and `F = −(X,Y,Z) = p`. ✔ **exactly**, to rounding (`6.7e−16`).

At `e = 1`: only `t = +T` differs; `t` enters odd (`t |t|^{1/2}` odd, `t cos θ` odd), so
`(X, Y, Z) = +p` and `F = −p`.

**`R = −I` — the antipodal map; `det R = −1`; central** (it commutes with every rotation).
Consequences for T13: the Kabsch/polar fit is a formality (it must return `−I`; keep the
fit as the generic path and assert `‖R + I‖ < 1e−9`); `M_after = R⁻¹ ∘ Rot_align` is
`−Rot_align`, and because `R` is central the end-of-spin alignment condition reduces to
choosing the spin so that the page centre `p_c` sits at the antipode of the
camera-facing point at the end of the spin (the page centre ends at `−p_c`). Note the
spec's example (a vertical mirror plane, "page up is screen up") assumed a different
`R`; with `R = −I` a page rendered through `P(M_after ·)` reads as a 180° rotation
of the original relative to the original, so T13 must define "page-up" for the `after`
page with that in mind (S#13 is about the Jacobian sign and the up vector — see §12).
