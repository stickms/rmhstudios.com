/**
 * Bum's Rush audio — the public API.
 */

export { initAudioBus, getContext, applyAudioSettings, getGainNode, setGlobalMute, disposeBus } from './bus';
export { playSwing, playGripSlip, playGripTension, playImpact, handleGameEvent, getVoiceState, clearAllVoices } from './sfx';
export { initMusic, loadMusicBuffer, playMusic, stopMusic, duckMusic, unduckMusic, beatClock, getCurrentBpm } from './music';
export { SpriteSheet, loadSpriteSheet, validateSpriteManifest } from './sprites';
export * as synth from './synth';
