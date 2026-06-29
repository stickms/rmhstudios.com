// lib/game/render3d/Environment.ts
import * as THREE from 'three';
import { LANE_COLORS } from './palette';

const STAR_COUNT = 900;

export class Environment {
  private stars: THREE.Points;
  private keyLight: THREE.PointLight;
  private rimLight: THREE.PointLight;
  private spin = 0;

  constructor(scene: THREE.Scene) {
    const pos = new Float32Array(STAR_COUNT * 3);
    const col = new Float32Array(STAR_COUNT * 3);
    const a = new THREE.Color(LANE_COLORS[0]);
    const b = new THREE.Color(LANE_COLORS[1]);
    for (let i = 0; i < STAR_COUNT; i++) {
      pos[i*3]   = (Math.random() - 0.5) * 60;
      pos[i*3+1] = (Math.random() - 0.5) * 40;
      pos[i*3+2] = (Math.random() - 0.5) * 60 - 10;
      const c = Math.random() < 0.5 ? a : b;
      col[i*3] = c.r; col[i*3+1] = c.g; col[i*3+2] = c.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.12, vertexColors: true, transparent: true, opacity: 0.7,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.stars = new THREE.Points(geo, mat);
    this.stars.frustumCulled = false;
    scene.add(this.stars);

    this.keyLight = new THREE.PointLight(LANE_COLORS[0], 8, 60);
    this.keyLight.position.set(-6, 6, 6);
    this.rimLight = new THREE.PointLight(LANE_COLORS[1], 8, 60);
    this.rimLight.position.set(8, -4, -4);
    scene.add(this.keyLight, this.rimLight);
  }

  update(dt: number, energy: number): void {
    this.spin += dt * 0.02;
    this.stars.rotation.y = this.spin;
    const pulse = 6 + energy * 12;
    this.keyLight.intensity = pulse;
    this.rimLight.intensity = pulse * 0.8;
  }

  dispose(): void {
    this.stars.geometry.dispose();
    (this.stars.material as THREE.Material).dispose();
    this.stars.removeFromParent();
    this.keyLight.removeFromParent();
    this.rimLight.removeFromParent();
  }
}
