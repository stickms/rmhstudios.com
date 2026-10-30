"""menu_ui.py on a synthetic Source install: the menu's text files, a console background (both shapes)
and a chapter picture from the chapter list, the scheme's font and GameUI's words, content-addressed
with an index."""
import json
import os
import struct
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [HERE, os.path.join(HERE, "..", "tf2-assets")]

import menu_ui  # noqa: E402


def vtf_rgba(w, h, rgba=(10, 20, 30, 255)):
    """A VTF 7.2 holding one RGBA8888 image, no mips or low-res image."""
    head = struct.pack("<4sII", b"VTF\0", 7, 2) + struct.pack("<I", 80)
    head += struct.pack("<HHIH", w, h, 0, 1) + struct.pack("<H", 0) + b"\0" * 4 + struct.pack("<3f", 0, 0, 0)
    head += b"\0" * 4 + struct.pack("<f", 1.0) + struct.pack("<i", 0) + bytes([1]) + struct.pack("<i", -1)
    head += bytes([0, 0]) + struct.pack("<H", 1)
    head = head.ljust(80, b"\0")
    return head + bytes(rgba) * (w * h)


def write(root, rel, data):
    path = os.path.join(root, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as fh:
        fh.write(data if isinstance(data, bytes) else data.encode())


class SourceMenu(unittest.TestCase):
    def test_collects_the_menu(self):
        with tempfile.TemporaryDirectory() as tmp:
            root, out = os.path.join(tmp, "install"), os.path.join(tmp, "out")
            g = os.path.join(root, "hl2")
            write(g, "resource/gamemenu.res", '"GameMenu" { "1" { "label" "#GameUI_GameMenu_NewGame" "command" "OpenNewGameDialog" } }')
            write(g, "resource/sourcescheme.res", 'Scheme { CustomFontFiles { "1" "resource/menu.ttf" } }')
            write(g, "scripts/chapterbackgrounds.txt", '"chapters"\n{\n\t1\t"background01"\n}\n')
            write(g, "gameinfo.txt", '"GameInfo" { game "HALF-LIFE 2" }')
            write(g, "materials/console/background01.vtf", vtf_rgba(8, 4))
            write(g, "materials/console/background01_widescreen.vtf", vtf_rgba(16, 8))
            write(g, "materials/vgui/chapters/chapter1.vtf", vtf_rgba(4, 4))
            write(g, "resource/menu.ttf", b"\0\1\0\0font")
            lang = '"lang" { "Language" "English" "Tokens" { "GameUI_GameMenu_NewGame" "NEW GAME" } }'
            write(g, "resource/gameui_english.txt", b"\xff\xfe" + lang.encode("utf-16-le"))
            index = menu_ui.build(menu_ui.Install(root, "hl2"), "hl2", out)
            self.assertEqual(set(index["images"]), {"console/background01", "console/background01_widescreen",
                                                    "vgui/chapters/chapter1"})
            self.assertIn("resource/menu.ttf", index["fonts"])
            with open(os.path.join(out, index["files"])) as fh:
                files = json.load(fh)
            self.assertIn("OpenNewGameDialog", files["resource/gamemenu.res"])
            with open(os.path.join(out, index["lang"]["english"])) as fh:
                self.assertEqual(json.load(fh)["tokens"]["gameui_gamemenu_newgame"], "NEW GAME")
            for rel in [index["files"], *index["images"].values(), *index["fonts"].values()]:
                self.assertTrue(os.path.isfile(os.path.join(out, rel)), rel)


def encode_vfont(plain, salt=b"\x05\x09\x2a"):
    """The inverse of menu_ui.decode_vfont, for building test data."""
    key = menu_ui.VFONT_KEY
    for b in salt:
        key ^= (b + menu_ui.VFONT_KEY) % 256
    out = bytearray()
    for p in plain:
        c = p ^ key
        out.append(c)
        key = (c + menu_ui.VFONT_KEY) % 256
    return bytes(out) + salt + bytes([len(salt) + 1]) + menu_ui.VFONT_MAGIC


class VFont(unittest.TestCase):
    def test_round_trips(self):
        plain = bytes(range(256)) * 3 + b"\0\1\0\0glyf"
        self.assertEqual(menu_ui.decode_vfont(encode_vfont(plain)), plain)

    def test_refuses_other_files(self):
        with self.assertRaises(ValueError):
            menu_ui.decode_vfont(b"\0\1\0\0 a TrueType file")


if __name__ == "__main__":
    unittest.main()
