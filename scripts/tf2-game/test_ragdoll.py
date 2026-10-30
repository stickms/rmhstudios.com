"""ragdoll.py on synthetic .phy files (no install needed).

    python3 -B -m unittest discover -s scripts/tf2-game -p test_ragdoll.py
"""
import os
import struct
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import ragdoll  # noqa: E402

TEXT = b"""solid {
"index" "0"
"name" "bip_pelvis"
"mass" "13.5"
"surfaceprop" "flesh"
}
solid {
"index" "1"
"name" "Bip_Spine_2"
"mass" "10"
}
solid {
"index" "2"
"name" "bip_head"
"mass" "5"
}
ragdollconstraint {
"parent" "0"
"child" "1"
"xmin" "-20.000000"
"xmax" "20.000000"
"xfriction" "0.5"
"ymin" "-10"
"ymax" "35"
"zmin" "-15"
"zmax" "15"
}
ragdollconstraint {
"parent" "1"
"child" "2"
"xmin" "-40"
"xmax" "40"
}
collisionrules {
"selfcollisions" "0"
}
editparams {
"rootname" "bip_pelvis"
"totalmass" "28.5"
}
"""
BONES = ["bip_pelvis", "bip_spine_2", "bip_head", "bip_hand_l"]


def phy(text=TEXT, solids=3):
    blobs = b"".join(struct.pack("<i", 8) + b"VPHY\0\0\0\0" for _ in range(solids))
    return struct.pack("<4i", 16, 0, solids, 1234) + blobs + text + b"\0"


class Ragdoll(unittest.TestCase):
    def test_reads_solids_and_limits(self):
        r = ragdoll.ragdoll_info(phy(), BONES)
        self.assertEqual(r["solids"], [{"bone": "bip_pelvis", "mass": 13.5}, {"bone": "bip_spine_2", "mass": 10.0},
                                       {"bone": "bip_head", "mass": 5.0}])
        self.assertEqual(r["constraints"][0], {"parent": 0, "child": 1, "x": [-20.0, 20.0], "y": [-10.0, 35.0],
                                               "z": [-15.0, 15.0]})
        # Missing axes are locked (0, 0), as vphysics reads them.
        self.assertEqual(r["constraints"][1]["y"], [0.0, 0.0])

    def test_not_a_ragdoll(self):
        prop = b'solid {\n"index" "0"\n"name" "static_prop"\n"mass" "40"\n}\neditparams {\n"totalmass" "40"\n}\n'
        self.assertIsNone(ragdoll.ragdoll_info(phy(prop, 1), ["static_prop"]))
        self.assertIsNone(ragdoll.ragdoll_info(None, BONES))
        self.assertIsNone(ragdoll.ragdoll_info(b"\0" * 8, BONES))

    def test_solid_on_a_missing_bone(self):
        self.assertIsNone(ragdoll.ragdoll_info(phy(), ["bip_pelvis", "bip_head"]))

    def test_truncated_solids(self):
        data = phy()
        self.assertIsNone(ragdoll.ragdoll_info(data[:40], BONES))


if __name__ == "__main__":
    unittest.main()
