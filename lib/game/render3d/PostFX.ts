// lib/game/render3d/PostFX.ts
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FilmPass } from 'three/examples/jsm/postprocessing/FilmPass.js';
import { RGBShiftShader } from 'three/examples/jsm/shaders/RGBShiftShader.js';
import { VignetteShader } from 'three/examples/jsm/shaders/VignetteShader.js';

const BASE_BLOOM = 0.9;

export class PostFX {
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private rgb: ShaderPass;
  private film: FilmPass;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    width: number,
    height: number,
  ) {
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));

    this.bloom = new UnrealBloomPass(new THREE.Vector2(width, height), BASE_BLOOM, 0.6, 0.2);
    this.composer.addPass(this.bloom);

    this.rgb = new ShaderPass(RGBShiftShader);
    this.rgb.uniforms.amount.value = 0.0016;
    this.composer.addPass(this.rgb);

    const vignette = new ShaderPass(VignetteShader);
    vignette.uniforms.offset.value = 1.1;
    vignette.uniforms.darkness.value = 1.1;
    this.composer.addPass(vignette);

    this.film = new FilmPass(0.22);
    this.composer.addPass(this.film);

    this.resize(width, height);
  }

  setBloom(strength: number): void {
    this.bloom.strength = strength;
  }

  setReducedFx(reduced: boolean): void {
    this.rgb.enabled = !reduced;
    this.film.enabled = !reduced;
  }

  resize(width: number, height: number): void {
    this.composer.setSize(width, height);
    this.bloom.resolution.set(width, height);
  }

  render(): void {
    this.composer.render();
  }

  dispose(): void {
    for (const pass of this.composer.passes) {
      (pass as { dispose?: () => void }).dispose?.();
    }
    this.composer.dispose();
  }
}
