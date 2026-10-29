"""HUD base selection (hud.py): the game's localisation is published, captions are not.

    python3 -B -m unittest discover -s scripts/tf2-assets -p test_hud.py
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))

import hud  # noqa: E402


class SelectionTest(unittest.TestCase):
    def test_language_files_cover_every_tf2_language(self):
        files = hud.language_files()
        self.assertIn("resource/tf_english.txt", files)
        self.assertIn("resource/tf_schinese.txt", files)
        self.assertEqual(len(files), len(set(files)))
        # Mirrors TF_LANGUAGES in lib/tf2-hud/localisation.ts.
        src = open(os.path.join(os.path.dirname(__file__), "../../lib/tf2-hud/localisation.ts")).read()
        for lang in hud.LANGUAGES:
            self.assertIn("id: '%s'" % lang, src)

    def test_skips_captions_and_item_strings_only(self):
        self.assertTrue(hud.wanted_resource("resource/tf_english.txt"))
        self.assertTrue(hud.wanted_resource("resource/ui/scoreboard.res"))
        self.assertTrue(hud.wanted_resource("resource/clientscheme.res"))
        self.assertFalse(hud.wanted_resource("resource/closecaption_english.dat"))
        self.assertFalse(hud.wanted_resource("resource/tf_proto_obj_defs_english.txt"))


if __name__ == "__main__":
    unittest.main()
