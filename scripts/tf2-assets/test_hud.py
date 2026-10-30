"""HUD base selection (hud.py): the game's localisation is published, captions are not; the
browser game's menus get what they read; tf/ wins over hl2/.

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

    def test_menu_files_match_the_game(self):
        # The browser game's menus read these (lib/tf2-game/client/menus/source.ts menuFiles).
        src = open(os.path.join(os.path.dirname(__file__), "../../lib/tf2-game/client/menus/kb-act.ts")).read()
        self.assertIn("'hl2/scripts/kb_act.lst'", src)
        self.assertIn("scripts/kb_act.lst", hud.MENU_FILES)
        self.assertIn("cfg/user_default.scr", hud.MENU_FILES)
        files = hud.engine_language_files()
        self.assertIn("resource/gameui_english.txt", files)
        self.assertIn("resource/valve_koreana.txt", files)
        self.assertEqual(len(files), 2 * len(hud.LANGUAGES))
        store = open(os.path.join(os.path.dirname(__file__), "../../lib/tf2-hud/base-store.server.ts")).read()
        self.assertIn("lst", store)
        self.assertIn("scr", store)

    def test_tf_packs_are_searched_before_hl2(self):
        class Pak:
            def __init__(self, path, names):
                self.vpk_path = path
                self.names = names

            def __iter__(self):
                return iter(self.names)

            def __contains__(self, n):
                return n in self.names

            def __getitem__(self, n):
                class F:
                    def __init__(self, data):
                        self.data = data

                    def read(self):
                        return self.data

                return F(("%s:%s" % (self.vpk_path, n)).encode())

        class FS:
            root = "/nowhere"

            def __init__(self):
                self.paks = [Pak("/g/hl2/hl2_misc_dir.vpk", ["scripts/kb_act.lst"]),
                             Pak("/g/tf/tf2_misc_dir.vpk", ["scripts/kb_act.lst"])]
                self._index = {}

        fs = hud.game_first(FS())
        self.assertIn("/tf/", fs.paks[0].vpk_path)
        self.assertIsNone(fs._index)
        self.assertEqual(hud.read_hl2(fs, "scripts/kb_act.lst"), b"/g/hl2/hl2_misc_dir.vpk:scripts/kb_act.lst")


if __name__ == "__main__":
    unittest.main()
