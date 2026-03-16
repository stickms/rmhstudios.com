import { saveSample, loadSample, listSamples, deleteSample } from '../project-store';
import type { SampleMeta } from '../types';

/**
 * SampleManager — loads, decodes, and caches audio samples.
 * Stores raw ArrayBuffers in IndexedDB, decoded AudioBuffers in memory.
 */
export class SampleManager {
  private static instance: SampleManager | null = null;
  private cache = new Map<string, AudioBuffer>();
  private audioContext: AudioContext | null = null;

  static getInstance(): SampleManager {
    if (!SampleManager.instance) SampleManager.instance = new SampleManager();
    return SampleManager.instance;
  }

  setAudioContext(ctx: AudioContext) {
    this.audioContext = ctx;
  }

  /**
   * Import a file from the user's device.
   */
  async importFile(file: File, folder = 'User'): Promise<{ id: string; meta: SampleMeta }> {
    const buffer = await file.arrayBuffer();
    const id = crypto.randomUUID();
    const audioBuffer = await this.decodeBuffer(buffer);

    const meta: SampleMeta = {
      id,
      name: file.name.replace(/\.[^.]+$/, ''),
      duration: audioBuffer.duration,
      sampleRate: audioBuffer.sampleRate,
      channels: audioBuffer.numberOfChannels,
      size: buffer.byteLength,
      folder,
      tags: [],
    };

    await saveSample(id, meta.name, buffer, meta);
    this.cache.set(id, audioBuffer);

    return { id, meta };
  }

  /**
   * Get a decoded AudioBuffer by sample ID. Loads from IndexedDB if not cached.
   */
  async getBuffer(id: string): Promise<AudioBuffer | null> {
    if (this.cache.has(id)) return this.cache.get(id)!;

    const data = await loadSample(id);
    if (!data) return null;

    const audioBuffer = await this.decodeBuffer(data.buffer);
    this.cache.set(id, audioBuffer);
    return audioBuffer;
  }

  /**
   * List all stored sample metadata.
   */
  async list(): Promise<SampleMeta[]> {
    return listSamples();
  }

  /**
   * Remove a sample from storage and cache.
   */
  async remove(id: string): Promise<void> {
    this.cache.delete(id);
    await deleteSample(id);
  }

  /**
   * Clear the in-memory cache (does not remove from IndexedDB).
   */
  clearCache() {
    this.cache.clear();
  }

  private async decodeBuffer(buffer: ArrayBuffer): Promise<AudioBuffer> {
    const ctx = this.audioContext || new AudioContext();
    return ctx.decodeAudioData(buffer.slice(0));
  }
}
