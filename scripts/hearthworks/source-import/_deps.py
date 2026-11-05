"""Import shim: the repo already ships tested Source-format readers (scripts/tf2-assets, scripts/tf2-game);
this importer reuses them instead of re-implementing the MDL/VVD/VTF/animation decoders:

  srcmodel   MDL v44-49 + VVD v4 -> LOD0 triangle meshes with bone weights
  srcanim    skeleton, RLE/raw animation decoding (sections, deltas, .ani animation blocks)
  srctex     VTF -> Pillow image, VMT -> (shader, key/values)
  mdlinfo    sequences, pose parameters and the `$includemodel` virtual model

`srcmodel.read_vtx` is replaced by `vtx.read_vtx` (strip-group stride fix, see vtx.py). Import this module
first; then `from _deps import srcmodel, srcanim, srctex, mdlinfo`.
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPTS = os.path.normpath(os.path.join(HERE, "..", ".."))
for sub in ("hearthworks/source-import", "tf2-assets", "tf2-game"):
    p = os.path.join(SCRIPTS, sub)
    if p not in sys.path:
        sys.path.insert(0, p)

import mdlinfo  # noqa: E402
import srcanim  # noqa: E402
import srcmodel  # noqa: E402
import srctex  # noqa: E402
import vtx as vtx_reader  # noqa: E402

srcmodel.read_vtx = vtx_reader.read_vtx

__all__ = ["mdlinfo", "srcanim", "srcmodel", "srctex", "vtx_reader"]
