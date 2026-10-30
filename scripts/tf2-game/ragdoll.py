"""A model's ragdoll from its .phy (public/phyfile.h): which bones are physics solids, their masses, and the
joint limits between them, for the client's ragdolls (lib/tf2-game/render/entities/ragdoll.ts).

The file is phyheader_t (int size, int id, int solidCount, int checksum), one `int size` + collision blob per
solid, then a KeyValues-style text section::

    solid { "index" "0" "name" "bip_pelvis" "mass" "13.0" ... }
    ragdollconstraint { "parent" "0" "child" "1" "xmin" "-30" "xmax" "30" ... "zmax" "30" }
    collisionrules { ... }   editparams { "rootname" "bip_pelvis" "totalmass" "..." ... }

Only the text section is read: the client shapes each solid from the model's hitboxes. A constraint's limits
are degrees of the child's rotation about its own bone axes, relative to its bind-pose orientation to the
parent (vphysics' ragdoll constraint frame).
"""
import re
import struct

TOKEN = re.compile(rb'"([^"]*)"|([{}])|([^\s"{}]+)')


def text_section(phy):
    """The .phy's text section (after the solids), or None when the file is malformed."""
    if not phy or len(phy) < 16:
        return None
    header, _, count, _ = struct.unpack_from("<4i", phy, 0)
    p = header
    for _ in range(count):
        if p + 4 > len(phy):
            return None
        (size,) = struct.unpack_from("<i", phy, p)
        if size < 0:
            return None
        p += 4 + size
    if p > len(phy):
        return None
    return phy[p:].split(b"\0", 1)[0]


def blocks(text):
    """Top-level `name { "k" "v" ... }` blocks as (name, {k: v}) in file order (nested blocks skipped)."""
    out, name, cur, depth, key = [], None, None, 0, None
    for m in TOKEN.finditer(text):
        tok = m.group(1) if m.group(1) is not None else (m.group(2) or m.group(3))
        tok = tok.decode("latin-1")
        if m.group(2) == b"{":
            depth += 1
            if depth == 1:
                cur, key = {}, None
            continue
        if m.group(2) == b"}":
            depth -= 1
            if depth == 0 and cur is not None:
                out.append((name, cur))
                cur, name = None, None
            continue
        if depth == 0:
            name = tok.lower()
        elif depth == 1:
            if key is None:
                key = tok.lower()
            else:
                cur[key] = tok
                key = None
    return out


def _num(v, default=0.0):
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def ragdoll_info(phy, bone_names):
    """-> {"solids": [{"bone", "mass"}], "constraints": [{"parent", "child", "x", "y", "z"}]} or None.

    None unless the .phy is a ragdoll: two solids or more joined by ragdoll constraints, every solid naming a
    bone of the model (`bone_names`, lower case)."""
    text = text_section(phy)
    if not text:
        return None
    entries = blocks(text)
    solids, constraints = {}, []
    for name, kv in entries:
        if name == "solid":
            solids[int(_num(kv.get("index"), -1))] = kv
        elif name == "ragdollconstraint":
            constraints.append(kv)
    if len(solids) < 2 or not constraints or sorted(solids) != list(range(len(solids))):
        return None
    names = set(bone_names)
    out_solids = []
    for i in range(len(solids)):
        bone = solids[i].get("name", "").lower()
        if bone not in names:
            return None
        out_solids.append({"bone": bone, "mass": round(_num(solids[i].get("mass"), 1.0), 4)})
    out_constraints = []
    for kv in constraints:
        parent, child = int(_num(kv.get("parent"), -1)), int(_num(kv.get("child"), -1))
        if not (0 <= parent < len(out_solids) and 0 <= child < len(out_solids)) or parent == child:
            continue
        out_constraints.append({"parent": parent, "child": child,
                                **{a: [round(_num(kv.get(a + "min")), 3), round(_num(kv.get(a + "max")), 3)]
                                   for a in "xyz"}})
    if not out_constraints:
        return None
    return {"solids": out_solids, "constraints": out_constraints}
