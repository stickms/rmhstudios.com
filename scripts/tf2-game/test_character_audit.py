"""character-audit.py's pure helpers (no install needed)."""
import importlib.util
import os
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("character_audit", os.path.join(HERE, "character-audit.py"))
audit_mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit_mod)

SOURCE = open(os.path.join(HERE, "build-maps.ts"), encoding="utf8").read()


class WantedModels(unittest.TestCase):
    def test_reads_the_one_list_out_of_build_maps(self):
        hl2 = audit_mod.wanted_models(SOURCE, "hl2")
        self.assertIn("models/alyx.mdl", hl2)
        self.assertIn("models/combine_soldier.mdl", hl2)
        portal = audit_mod.wanted_models(SOURCE, "portal")
        for m in ("models/player/chell/player.mdl", "models/player/chell.mdl", "models/player.mdl",
                  "models/weapons/v_portalgun.mdl"):
            self.assertIn(m, portal)

    def test_unknown_game_is_empty(self):
        self.assertEqual(audit_mod.wanted_models(SOURCE, "nope"), [])
        self.assertEqual(audit_mod.wanted_models("no list here", "hl2"), [])


class Audit(unittest.TestCase):
    def test_splits_present_missing_and_other(self):
        names = ["models/alyx.mdl", "models/player/chell_alt.mdl", "models/props/crate.mdl", "models/player.mdl"]
        present, missing, other = audit_mod.audit(names, ["models/alyx.mdl", "models/combine_soldier.mdl"])
        self.assertEqual(present, ["models/alyx.mdl"])
        self.assertEqual(missing, ["models/combine_soldier.mdl"])
        # a differently named character file is surfaced so it can be added to the list
        self.assertEqual(other, ["models/player.mdl", "models/player/chell_alt.mdl"])

    def test_empty_install(self):
        self.assertEqual(audit_mod.audit([], ["models/alyx.mdl"]), ([], ["models/alyx.mdl"], []))


if __name__ == "__main__":
    unittest.main()
