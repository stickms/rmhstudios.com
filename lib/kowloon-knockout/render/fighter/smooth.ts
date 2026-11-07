// ============================================================
// Smooth keyframes: resample a clip's few authored keys into dense ones along a spline.
//
// three.js interpolates a quaternion track with straight slerp between keys, which is continuous but
// not smooth: the angular velocity changes abruptly at every key, and the eye reads that as a limb that
// stops and restarts. A Catmull-Rom spline passes through the same keys with a continuous velocity;
// baking it into dense keys keeps the runtime cost at three's plain linear interpolant. For rotations it
// runs on the (hemisphere-consistent) quaternion components and renormalises — C1-smooth, robust for
// the large swings a punch makes (a spherical spline's control points swing the wrong way past ~90°),
// and indistinguishable from a true spherical one over a key spacing this small. Looping clips wrap
// their neighbours, so the seam is as smooth as any other key; one-shots clamp at their ends.
// ============================================================


/** Samples per second of the baked curve: 3x the usual 30 fps clip rate keeps even a fast punch round. */
export const SMOOTH_RATE = 90;
const MIN_SEGMENT_SAMPLES = 3;

export interface BakedTrack { times: number[]; values: number[] }

function segmentSamples(len: number): number {
    return Math.max(MIN_SEGMENT_SAMPLES, Math.ceil(len * SMOOTH_RATE));
}

/** Catmull-Rom through `dim`-wide keys; `loop`: the last key repeats the first and the curve is periodic. */
function catmullRom(times: readonly number[], values: readonly number[], dim: number, loop: boolean): BakedTrack {
    const n = times.length;
    if (n < 3) return { times: [...times], values: [...values] };
    const unique = loop ? n - 1 : n;
    const idx = (i: number) => (loop ? ((i % unique) + unique) % unique : Math.min(n - 1, Math.max(0, i)));
    const get = (i: number, c: number) => values[idx(i) * dim + c];
    const outT: number[] = [];
    const outV: number[] = [];
    for (let i = 0; i < n - 1; i++) {
        const k = segmentSamples(times[i + 1] - times[i]);
        for (let j = 0; j < k; j++) {
            const u = j / k;
            outT.push(times[i] + (times[i + 1] - times[i]) * u);
            for (let c = 0; c < dim; c++) {
                const p0 = get(i - 1, c), p1 = get(i, c), p2 = get(i + 1, c), p3 = get(i + 2, c);
                outV.push(0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u));
            }
        }
    }
    outT.push(times[n - 1]);
    for (let c = 0; c < dim; c++) outV.push(values[(n - 1) * dim + c]);
    return { times: outT, values: outV };
}

/**
 * Quaternion keys (flat xyzw, hemisphere-consistent) → dense, unit-length keys on a smooth curve. Returns
 * the keys untouched when there are fewer than three (nothing to smooth). `loop`: the last key equals the first.
 */
export function smoothQuaternions(times: readonly number[], values: readonly number[], loop: boolean): BakedTrack {
    const baked = catmullRom(times, values, 4, loop);
    const v = baked.values;
    for (let i = 0; i < v.length; i += 4) {
        const len = Math.hypot(v[i], v[i + 1], v[i + 2], v[i + 3]) || 1;
        v[i] /= len; v[i + 1] /= len; v[i + 2] /= len; v[i + 3] /= len;
    }
    return { times: baked.times, values: fixHemisphere(v) };
}

/** Vec3 keys → dense keys on the same spline (same neighbour rules as `smoothQuaternions`). */
export function smoothVectors(times: readonly number[], values: readonly number[], loop: boolean): BakedTrack {
    return catmullRom(times, values, 3, loop);
}

/** Flip a quaternion that sits across the hemisphere from the previous one, so slerp takes the short way. */
export function fixHemisphere(v: number[]): number[] {
    const out = v.slice();
    for (let i = 4; i < out.length; i += 4) {
        const dot = out[i] * out[i - 4] + out[i + 1] * out[i - 3] + out[i + 2] * out[i - 2] + out[i + 3] * out[i - 1];
        if (dot < 0) for (let k = 0; k < 4; k++) out[i + k] = -out[i + k];
    }
    return out;
}
