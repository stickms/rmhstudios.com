"""Frame animations (STUDIO_FRAMEANIM, CS:GO's MDL v49) on synthetic data: the header, per-bone flags,
constants and fixed-size frames decode in order; the Quaternion48S encoding round-trips; and a header whose
sizes disagree with its flags is refused rather than read as garbage."""
import math
import struct
import unittest

import numpy as np

import srcanim
from srcmodel import ModelError


def enc_quat48s(q):
    """Quaternion48S encoder (the inverse of srcanim._quat48s), for building test data."""
    q = list(q)
    dropped = max(range(4), key=lambda i: abs(q[i]))
    if q[dropped] < 0:
        q = [-x for x in q]  # q and -q are the same rotation: keep the dropped one positive, sign bit 0
    rest = [q[(dropped + k) & 3] for k in (1, 2, 3)]
    w = [int(round(v * srcanim._Q48S_SCALE)) + srcanim._Q48S_SHIFT for v in rest]
    a = (w[0] & 0x7FFF) | ((dropped >> 1) << 15)
    b = (w[1] & 0x7FFF) | ((dropped & 1) << 15)
    c = w[2] & 0x7FFF
    return struct.pack("<3H", a, b, c)


def enc_quat48(q):
    x, y, z, w = q
    return struct.pack("<3H", int(round(x * 32768 + 32768)), int(round(y * 32768 + 32768)),
                       (int(round(z * 16384 + 16384)) & 0x7FFF) | (0x8000 if w < 0 else 0))


def enc_vec48(v):
    return np.array(v, "<f2").tobytes()


def norm(q):
    n = math.sqrt(sum(x * x for x in q))
    return tuple(x / n for x in q)


def frame_anim(flags, consts, frames):
    """The header, the flag bytes, then the constants, then the frames (offsets from the header)."""
    const_off = srcanim.FRAME_HEADER + len(flags)
    frame_len = len(frames[0]) if frames else 0
    frame_off = const_off + len(consts)
    head = struct.pack("<3i3i", const_off if consts else 0, frame_off, frame_len, 0, 0, 0)
    return head + bytes(flags) + consts + b"".join(frames)


class FrameAnimation(unittest.TestCase):
    def setUp(self):
        self.bones = [{"pos": (0.0, 0.0, 0.0), "quat": (0.0, 0.0, 0.0, 1.0)} for _ in range(3)]

    def test_quaternion48s_round_trips(self):
        for q in [(0.1, 0.2, 0.3, 0.9), (-0.7, 0.1, 0.1, 0.7), (0.0, 0.0, 1.0, 0.0), (0.5, -0.5, 0.5, -0.5)]:
            q = norm(q)
            got = srcanim._quat48s(enc_quat48s(q), 0)
            dot = abs(sum(a * b for a, b in zip(q, got)))
            self.assertGreater(dot, 0.9999, (q, got))

    def test_constants_and_frames_decode_in_order(self):
        rest = norm((0.2, 0.1, 0.0, 0.97))
        spin = [norm((0.0, 0.0, math.sin(a), math.cos(a))) for a in (0.0, 0.3, 0.6)]
        flags = [srcanim.F_CONST_ROT2 | srcanim.F_RAWPOS, srcanim.F_ANIMROT | srcanim.F_ANIMPOS, 0]
        consts = enc_quat48s(rest) + enc_vec48((1.0, 2.0, 3.0))
        frames = [enc_quat48(q) + enc_vec48((float(i), 0.0, -float(i))) for i, q in enumerate(spin)]
        data = b"\0" * 8 + frame_anim(flags, consts, frames)
        pos = np.zeros((3, 3, 3), np.float32)
        quat = np.tile(np.array([0, 0, 0, 1], np.float32), (3, 3, 1))
        srcanim.decode_frame_anim(data, 8, self.bones, 3, pos, quat)
        for f in range(3):
            self.assertGreater(abs(float(np.dot(quat[f, 0], rest))), 0.9999)
            np.testing.assert_allclose(pos[f, 0], (1.0, 2.0, 3.0))
            self.assertGreater(abs(float(np.dot(quat[f, 1], spin[f]))), 0.999)
            np.testing.assert_allclose(pos[f, 1], (f, 0.0, -f))
            # A bone with no flags keeps what the arrays held (here the identity / origin).
            np.testing.assert_allclose(quat[f, 2], (0, 0, 0, 1))

    def test_full_positions_and_a_size_mismatch(self):
        flags = [srcanim.F_FULLANIMPOS, 0, 0]
        frames = [struct.pack("<3f", 0.5, 1.5, 2.5)]
        data = frame_anim(flags, b"", frames)
        pos = np.zeros((1, 3, 3), np.float32)
        quat = np.tile(np.array([0, 0, 0, 1], np.float32), (1, 3, 1))
        srcanim.decode_frame_anim(data, 0, self.bones, 1, pos, quat)
        np.testing.assert_allclose(pos[0, 0], (0.5, 1.5, 2.5))
        # The header says 10 bytes a frame, the flags say 12: refused, not misread.
        bad = bytearray(data)
        struct.pack_into("<i", bad, 8, 10)
        with self.assertRaises(ModelError):
            srcanim.decode_frame_anim(bytes(bad), 0, self.bones, 1, pos, quat)


if __name__ == "__main__":
    unittest.main()
