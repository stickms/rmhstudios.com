import {
  Box3,
  Matrix4,
  Quaternion,
  Raycaster,
  Vector3,
  type Mesh,
  type Object3D,
  type SkinnedMesh,
} from 'three';
import type { EffectPlacement } from '../catalog-types';
import { controlPoint, type ParticleEnvironment } from './simulation';
import { glToSource, sourceToGl } from './renderer';
import type { ParticleBundle } from './types';

interface Attachment {
  bone: string;
  bind: number[];
  pose?: number[];
}
interface Hitbox extends Attachment {
  min: number[];
  max: number[];
}
interface ModelMetadata {
  particleAttachments?: Record<string, Attachment>;
  particleRoot?: Attachment;
  particleHitboxes?: Hitbox[];
}
const GL_TO_SOURCE_ROTATION = new Quaternion().setFromRotationMatrix(
  new Matrix4().set(0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1),
);

/** CPs follow exported MDL attachments; emitted particles remain in Source world space. */
export function createParticleEnvironment(
  bundle: ParticleBundle,
  owner: Object3D | undefined,
  body: Object3D | undefined,
  fallbackBox: Box3,
  placement: Required<EffectPlacement>,
) {
  const metadata = (owner?.userData ?? {}) as ModelMetadata;
  const queried = owner ?? body;
  const hitboxes = ((queried?.userData ?? {}) as ModelMetadata).particleHitboxes ?? [];
  const bones = new Map<string, Object3D>(),
    ownerBones = new Map<string, Object3D>();
  queried?.traverse((o) => {
    if (o.name) bones.set(o.name.toLowerCase(), o);
  });
  // A bone-merged cosmetic drops its copies of the shared bones, so the attachment's bone
  // lives on the player's skeleton; the cosmetic's own bones take precedence.
  body?.traverse((o) => {
    if (o.name) ownerBones.set(o.name.toLowerCase(), o);
  });
  owner?.traverse((o) => {
    if (o.name) ownerBones.set(o.name.toLowerCase(), o);
  });
  const matrices = hitboxes.map(() => new Matrix4()),
    inverses = hitboxes.map(() => new Matrix4());
  const localBounds = hitboxes.map(
    (h) => new Box3(new Vector3().fromArray(h.min), new Vector3().fromArray(h.max)),
  );
  const box = fallbackBox.clone();
  const a = new Vector3(),
    b = new Vector3(),
    offset = new Vector3(),
    size = new Vector3();
  const matrix = new Matrix4(),
    localMatrix = new Matrix4(),
    scale = new Vector3(),
    rotation = new Quaternion();
  const ray = new Raycaster(),
    queryMeshes: Object3D[] = [];
  queried?.traverse((o) => {
    if ((o as Mesh).isMesh) queryMeshes.push(o);
  });
  const points = new Map([[0, controlPoint()]]);
  const attachmentMatrix = (attachment: Attachment | undefined, target: Matrix4) => {
    if (!owner) return target.identity();
    if (!attachment) return target.copy(owner.matrixWorld);
    const bone = ownerBones.get(attachment.bone);
    if (bone) {
      target.copy(bone.matrixWorld);
      if (attachment.pose) target.multiply(localMatrix.fromArray(attachment.pose));
    } else target.copy(owner.matrixWorld).multiply(localMatrix.fromArray(attachment.bind));
    return target;
  };
  const environment: ParticleEnvironment = {
    points,
    player: new Vector3(),
    sampleModel(_cp, random, target, boxScale, local) {
      if (!hitboxes.length) {
        a.set(random(), random(), random()).multiply(box.getSize(size)).add(box.min);
        glToSource(a, target);
        return -1;
      }
      const index = Math.min(hitboxes.length - 1, Math.floor(random() * hitboxes.length)),
        h = localBounds[index];
      h.getCenter(a);
      local
        .set(random(), random(), random())
        .multiply(h.getSize(size))
        .add(h.min)
        .sub(a)
        .multiplyScalar(boxScale)
        .add(a);
      glToSource(b.copy(local).applyMatrix4(matrices[index]), target);
      return index;
    },
    modelPoint(hitbox, local, target) {
      if (matrices[hitbox]) glToSource(a.copy(local).applyMatrix4(matrices[hitbox]), target);
    },
    insideModel(point) {
      sourceToGl(point, a);
      if (!hitboxes.length) return box.containsPoint(a);
      for (let i = 0; i < hitboxes.length; i++)
        if (localBounds[i].containsPoint(b.copy(a).applyMatrix4(inverses[i]))) return true;
      return false;
    },
    trace(from, to, radius, brushOnly) {
      // The studio preview supplies a floor; a game's BSP geometry is not present.
      const floor = environment.player.z + radius;
      if (from.z >= floor && to.z < floor) {
        const t = (from.z - floor) / Math.max(1e-9, from.z - to.z);
        return { position: new Vector3().lerpVectors(from, to, t), normal: new Vector3(0, 0, 1) };
      }
      if (!brushOnly && queryMeshes.length) {
        sourceToGl(from, a);
        sourceToGl(to, b);
        b.sub(a);
        const distance = b.length();
        if (distance < 1e-9) return null;
        ray.set(a, b.divideScalar(distance));
        ray.far = distance;
        const hit = ray.intersectObjects(queryMeshes, false)[0];
        if (hit?.face) {
          a.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
          const normal = glToSource(a, new Vector3()).normalize();
          return {
            position: glToSource(hit.point, new Vector3()).addScaledVector(normal, radius),
            normal,
          };
        }
      }
      return null;
    },
  };
  const update = () => {
    queried?.updateWorldMatrix(true, true);
    queried?.traverse((o) => {
      if ((o as SkinnedMesh).isSkinnedMesh) (o as SkinnedMesh).skeleton.update();
    });
    owner?.updateWorldMatrix(true, true);
    if (owner) box.setFromObject(owner);
    box.getSize(size);
    offset.set(placement.x * size.x, placement.y * size.y, placement.z * size.z);
    const player = body ?? owner;
    if (player) glToSource(player.getWorldPosition(a), environment.player);
    for (let i = 0; i < hitboxes.length; i++) {
      const bone = bones.get(hitboxes[i].bone);
      if (bone) matrices[i].copy(bone.matrixWorld);
      else
        matrices[i]
          .copy(queried?.matrixWorld ?? matrix.identity())
          .multiply(localMatrix.fromArray(hitboxes[i].bind));
      inverses[i].copy(matrices[i]).invert();
    }
    for (let index = 0; index < 8; index++) {
      const name = index === 0 ? bundle.schema.attachment : bundle.schema['control_point_' + index];
      const attachment = name ? metadata.particleAttachments?.[name.toLowerCase()] : undefined;
      if (index && !attachment) continue;
      let cp = points.get(index);
      if (!cp) {
        cp = controlPoint();
        points.set(index, cp);
      }
      const root =
        !attachment && bundle.schema.attach_to_rootbone === '1' ? metadata.particleRoot : undefined;
      attachmentMatrix(attachment ?? root, matrix);
      matrix.decompose(a, rotation, scale);
      if (!owner) fallbackBox.getCenter(a);
      glToSource(a.add(offset), cp.position);
      cp.rotation.copy(rotation).premultiply(GL_TO_SOURCE_ROTATION);
      if (!attachment && !root) cp.rotation.identity();
    }
  };
  update();
  for (const cp of points.values()) {
    cp.previous.copy(cp.position);
    cp.previousRotation.copy(cp.rotation);
  }
  return { environment, update };
}
