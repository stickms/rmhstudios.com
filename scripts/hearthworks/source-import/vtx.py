"""VTX (dx90 / dx80 / sw, version 7) reader: LOD 0 triangle lists per [bodypart][model][mesh].

Same return shape as `srcmodel.read_vtx` in scripts/tf2-assets, with one fix that matters for HL2-era
models: the StripGroupHeader is 25 bytes and the StripHeader 27 in the 2007 SDK, but 33 and 35 in builds
that append the topology fields (`numTopologyIndices`, `topologyOffset`; MDL v49 compiles). Reading either file
with the wrong stride silently loses triangles (a missing arm), so the strides are inferred from the data: every
group header must be plausible and its strips' index ranges must tile the group's index array exactly.

Layout (all little endian, `#pragma pack(1)`):
  FileHeader       version i, vertCacheSize i, maxBonesPerStrip H, maxBonesPerTri H, maxBonesPerVert i,
                   checksum i, numLODs i, materialReplacementListOffset i, numBodyParts i, bodyPartOffset i
  BodyPartHeader   numModels i, modelOffset i                       (8)
  ModelHeader      numLODs i, lodOffset i                           (8)
  ModelLODHeader   numMeshes i, meshOffset i, switchPoint f         (12)
  MeshHeader       numStripGroups i, stripGroupOffset i, flags B    (9)
  StripGroupHeader numVerts i, vertOffset i, numIndices i, indexOffset i, numStrips i, stripOffset i,
                   flags B [, numTopologyIndices i, topologyOffset i]   (25 | 33)
  Vertex           boneWeightIndex[3] B, numBones B, origMeshVertID H, boneID[3] B   (9)
  StripHeader      numIndices i, indexOffset i, numVerts i, vertOffset i, numBones h, flags B,
                   numBoneStateChanges i, boneStateChangeOffset i [, numTopologyIndices i, topologyOffset i]  (27 | 35)
Strip flags: 1 = triangle list, 2 = triangle strip.
"""
import struct

import numpy as np

VTX_VERTEX = np.dtype([("b", "u1", 3), ("nb", "u1"), ("orig", "<u2"), ("bid", "u1", 3)])


class VtxError(Exception):
    pass


def _group_layout(vtx, go, size):
    """The strip header stride (27 or 35) of the strip group at `go` if its header, vertex/index arrays and
    strip list are all consistent, else None. Consistent = strip index ranges tile the group's index array."""
    if go + size > len(vtx):
        return None
    nverts, voff, nidx, ioff, nstrips, soff = struct.unpack_from("<6i", vtx, go)
    # a real strip group always has vertices, indices and strips; a mis-strided read produces zeros here
    if not (0 < nverts <= 65536 and 0 < nidx <= 1 << 21 and 0 < nstrips <= 4096):
        return None
    if not (0 < voff and go + voff + nverts * 9 <= len(vtx) and 0 < ioff and go + ioff + nidx * 2 <= len(vtx)
            and 0 < soff):
        return None
    for ssize in (27, 35):
        if go + soff + nstrips * ssize > len(vtx):
            continue
        running = 0
        for s in range(nstrips):
            sn, si = struct.unpack_from("<ii", vtx, go + soff + s * ssize)
            if si != running or sn < 0:
                break
            running += sn
        else:
            if running == nidx:
                return ssize
    return None


def group_layout(vtx, mesh_at, nsg, sg_off):
    """-> (strip group header size 25|33, [strip header size per group]) for one mesh. The sizes grew by 8 bytes
    (topology index count + offset) in builds that write MDL v49, and for a single-group mesh both are equally
    valid; with several groups the stride that keeps every header consistent wins."""
    for size in (25, 33):
        layouts = [_group_layout(vtx, mesh_at + sg_off + g * size, size) for g in range(nsg)]
        if all(layouts):
            return size, layouts
    raise VtxError("strip groups fit neither the 25 nor the 33 byte header layout")


def read_vtx(vtx):
    """-> [bodypart][model][mesh] = int64 array of mesh-local vertex ids (3 per triangle, Source winding)."""
    version, _cache, _mb, _mt, _mv, _cs, _nl, _mat, num_bp, bp_off = struct.unpack_from("<iihhiiiiii", vtx, 0)
    if version != 7:
        raise VtxError("unsupported VTX version %s" % version)
    result = []
    for b in range(num_bp):
        bo = bp_off + b * 8
        nmodels, model_off = struct.unpack_from("<ii", vtx, bo)
        models = []
        for m in range(nmodels):
            mo = bo + model_off + m * 8
            nlods, lod_off = struct.unpack_from("<ii", vtx, mo)
            meshes = []
            if nlods:
                lo = mo + lod_off  # LOD 0
                nmesh, mesh_off = struct.unpack_from("<ii", vtx, lo)
                for k in range(nmesh):
                    me = lo + mesh_off + k * 9
                    nsg, sg_off = struct.unpack_from("<ii", vtx, me)
                    size, strip_sizes = group_layout(vtx, me, nsg, sg_off) if nsg else (25, [])
                    tris = []
                    for g in range(nsg):
                        go = me + sg_off + g * size
                        nverts, voff, nidx, ioff, nstrips, soff = struct.unpack_from("<6i", vtx, go)
                        orig = (np.frombuffer(vtx, dtype=VTX_VERTEX, count=nverts, offset=go + voff)["orig"]
                                if nverts else np.zeros(0, "<u2"))
                        idx = np.frombuffer(vtx, dtype="<u2", count=nidx, offset=go + ioff) if nidx else np.zeros(0, "<u2")
                        for s in range(nstrips):
                            so = go + soff + s * strip_sizes[g]
                            sn, si, _sv, _sov, _nb, flags = struct.unpack_from("<iiiihB", vtx, so)
                            seg = orig[idx[si:si + sn]]
                            if flags & 1:  # triangle list
                                tris.append(seg[: len(seg) // 3 * 3])
                            elif flags & 2:  # triangle strip
                                for t in range(len(seg) - 2):
                                    a, b2, c = seg[t], seg[t + 1], seg[t + 2]
                                    tris.append(np.array([a, c, b2] if t % 2 else [a, b2, c], dtype="<u2"))
                    meshes.append(np.concatenate(tris).astype(np.int64) if tris else np.zeros(0, np.int64))
            models.append(meshes)
        result.append(models)
    return result
