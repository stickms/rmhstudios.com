"""Pure numeric helpers of the importer: Source -> glTF axes, quaternion maths, clip resampling and keyframe
reduction. No file or format knowledge in here, so every function is unit-testable (test_import.py).

Conventions
  quaternions are (x, y, z, w) arrays, like both MDL and glTF
  Source space: +X forward, +Y left, +Z up, 1 unit = 1/16 ft
  glTF space:   +Z forward, +X left (the character's own left), +Y up, metres
  the map gl = P @ src is a cyclic permutation (det +1), so winding and handedness are preserved.
"""
import math

import numpy as np

SCALE = 0.01905  # metres per Source unit: 1 unit = 1/16 ft = 0.0254 * 12/16
P = np.array([[0.0, 1.0, 0.0], [0.0, 0.0, 1.0], [1.0, 0.0, 0.0]])  # gl = P @ src


def vec_to_gl(v, scale=True):
    """Source vector(s) [..., 3] -> glTF axes (scaled to metres unless `scale` is False, e.g. normals)."""
    v = np.asarray(v, np.float64)
    out = v[..., [1, 2, 0]]
    return out * SCALE if scale else out


def quat_to_gl(q):
    """Source quaternion(s) [..., 4] -> the same rotation expressed in glTF axes (vector part permuted)."""
    return np.asarray(q, np.float64)[..., [1, 2, 0, 3]]


def mat_to_gl(m):
    """Source 4x4 transform(s) [..., 4, 4] -> glTF axes and metres (conjugation by the axis map)."""
    m = np.asarray(m, np.float64)
    out = np.empty_like(m)
    out[..., :3, :3] = P @ m[..., :3, :3] @ P.T
    out[..., :3, 3] = (m[..., :3, 3] @ P.T) * SCALE
    out[..., 3, :] = [0, 0, 0, 1]
    return out


def qnormalize(q):
    q = np.asarray(q, np.float64)
    return q / np.maximum(np.linalg.norm(q, axis=-1, keepdims=True), 1e-12)


def qmul(a, b):
    ax, ay, az, aw = np.moveaxis(np.asarray(a, np.float64), -1, 0)
    bx, by, bz, bw = np.moveaxis(np.asarray(b, np.float64), -1, 0)
    return np.stack([aw * bx + ax * bw + ay * bz - az * by,
                     aw * by - ax * bz + ay * bw + az * bx,
                     aw * bz + ax * by - ay * bx + az * bw,
                     aw * bw - ax * bx - ay * by - az * bz], axis=-1)


def quat_to_mat(q):
    """(x, y, z, w) [..., 4] -> rotation matrix [..., 3, 3]."""
    x, y, z, w = np.moveaxis(qnormalize(q), -1, 0)
    return np.stack([
        np.stack([1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)], -1),
        np.stack([2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)], -1),
        np.stack([2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)], -1),
    ], -2)


def mat_to_quat(m):
    """Rotation matrix [3, 3] -> (x, y, z, w)."""
    m = np.asarray(m, np.float64)
    t = m[0, 0] + m[1, 1] + m[2, 2]
    if t > 0:
        s = math.sqrt(t + 1) * 2
        q = ((m[2, 1] - m[1, 2]) / s, (m[0, 2] - m[2, 0]) / s, (m[1, 0] - m[0, 1]) / s, s / 4)
    elif m[0, 0] > m[1, 1] and m[0, 0] > m[2, 2]:
        s = math.sqrt(1 + m[0, 0] - m[1, 1] - m[2, 2]) * 2
        q = (s / 4, (m[0, 1] + m[1, 0]) / s, (m[0, 2] + m[2, 0]) / s, (m[2, 1] - m[1, 2]) / s)
    elif m[1, 1] > m[2, 2]:
        s = math.sqrt(1 + m[1, 1] - m[0, 0] - m[2, 2]) * 2
        q = ((m[0, 1] + m[1, 0]) / s, s / 4, (m[1, 2] + m[2, 1]) / s, (m[0, 2] - m[2, 0]) / s)
    else:
        s = math.sqrt(1 + m[2, 2] - m[0, 0] - m[1, 1]) * 2
        q = ((m[0, 2] + m[2, 0]) / s, (m[1, 2] + m[2, 1]) / s, s / 4, (m[1, 0] - m[0, 1]) / s)
    return qnormalize(np.array(q))


def compose(pos, quat):
    """Local TRS -> 4x4 matrices. pos [..., 3], quat [..., 4]."""
    pos = np.asarray(pos, np.float64)
    m = np.zeros(pos.shape[:-1] + (4, 4))
    m[..., :3, :3] = quat_to_mat(quat)
    m[..., :3, 3] = pos
    m[..., 3, 3] = 1.0
    return m


def world_from_local(parent, pos, quat):
    """Bone-to-model matrices [n, 4, 4] from one pose; parents must precede their children."""
    n = len(parent)
    local = compose(pos, quat)
    world = np.empty_like(local)
    for i in range(n):
        world[i] = local[i] if parent[i] < 0 else world[parent[i]] @ local[i]
    return world


def hemisphere_fix(q):
    """Flip quaternions so neighbouring keys are in one hemisphere (shortest-path slerp). q [k, 4]."""
    q = np.array(q, np.float64)
    for i in range(1, len(q)):
        if np.dot(q[i], q[i - 1]) < 0:
            q[i] = -q[i]
    return q


def slerp(a, b, t):
    """Vectorised slerp: a, b [..., 4]; t [...] or scalar."""
    a = np.asarray(a, np.float64)
    b = np.asarray(b, np.float64)
    t = np.asarray(t, np.float64)[..., None]
    d = np.sum(a * b, axis=-1, keepdims=True)
    b = np.where(d < 0, -b, b)
    d = np.abs(d)
    small = d > 0.9995
    theta = np.arccos(np.clip(d, -1, 1))
    s = np.maximum(np.sin(theta), 1e-9)
    w0 = np.where(small, 1 - t, np.sin((1 - t) * theta) / s)
    w1 = np.where(small, t, np.sin(t * theta) / s)
    return qnormalize(w0 * a + w1 * b)


def resample(pos, quat, src_fps, out_fps=30.0, loop=False, duration=None):
    """Resample a decoded clip (pos [F, B, 3], quat [F, B, 4]) to `out_fps`.

    A looping clip lasts F / src_fps seconds and wraps (the last key repeats the first, so a LoopRepeat
    player interpolates the seam); a one-shot lasts (F - 1) / src_fps. Returns (times [K], pos, quat)."""
    frames = pos.shape[0]
    if duration is None:
        duration = (frames / src_fps) if loop else (max(frames - 1, 0) / src_fps)
    steps = max(1, int(round(duration * out_fps)))
    times = np.arange(steps + 1) / out_fps
    times[-1] = steps / out_fps
    x = np.minimum(times * src_fps, frames if loop else frames - 1)
    i0 = np.floor(x).astype(int)
    frac = x - i0
    i1 = i0 + 1
    if loop:
        i0 %= frames
        i1 %= frames
    else:
        i0 = np.clip(i0, 0, frames - 1)
        i1 = np.clip(i1, 0, frames - 1)
    p = pos[i0] * (1 - frac)[:, None, None] + pos[i1] * frac[:, None, None]
    q = slerp(quat[i0], quat[i1], frac[:, None])
    return times, p, q


def rot_error(a, b):
    """Angle (radians) between quaternions a, b [..., 4]."""
    d = np.abs(np.sum(qnormalize(a) * qnormalize(b), axis=-1))
    return 2 * np.arccos(np.clip(d, 0, 1))


def reduce_keys(times, values, tol, rotation):
    """Indices of keys to keep so interpolating between them reproduces every dropped key within `tol`
    (radians for rotations, metres for translations). Greedy forward sweep; first and last always kept."""
    n = len(values)
    if n <= 2:
        return list(range(n))
    keep, i = [0], 0
    while i < n - 1:
        best, j = i + 1, i + 2
        while j < n:
            a = ((times[i + 1:j] - times[i]) / (times[j] - times[i]))
            if rotation:
                est = slerp(np.broadcast_to(values[i], (j - i - 1, 4)), np.broadcast_to(values[j], (j - i - 1, 4)), a)
                err = rot_error(est, values[i + 1:j]).max()
            else:
                est = values[i] * (1 - a)[:, None] + values[j] * a[:, None]
                err = np.linalg.norm(est - values[i + 1:j], axis=-1).max()
            if err > tol:
                break
            best = j
            j += 1
        keep.append(best)
        i = best
    return keep
