import type * as ToneNS from 'tone';
import { MASTER_BUS_ID } from '../constants';

type Tone = typeof ToneNS;

/**
 * StudioEngine — singleton that owns the Tone.js context and master audio chain.
 *
 * Audio graph:
 *   TrackNodes → Master Channel → Limiter → Analyser → destination
 *
 * Tone.js is dynamically imported to avoid bundling ~200KB on pages that
 * don't use the studio.
 */
export class StudioEngine {
  private static instance: StudioEngine | null = null;

  private tone: Tone | null = null;
  private masterChannel: ToneNS.Channel | null = null;
  private masterLimiter: ToneNS.Limiter | null = null;
  private masterAnalyser: ToneNS.Analyser | null = null;
  private masterMeter: ToneNS.Meter | null = null;
  private _initialized = false;

  // Track audio nodes keyed by track ID
  private trackChannels = new Map<string, ToneNS.Channel>();
  // Aux send/return buses
  private auxBuses = new Map<string, { send: ToneNS.Channel; effect: ToneNS.ToneAudioNode; ret: ToneNS.Channel }>();

  private constructor() {}

  static getInstance(): StudioEngine {
    if (!StudioEngine.instance) {
      StudioEngine.instance = new StudioEngine();
    }
    return StudioEngine.instance;
  }

  get initialized() {
    return this._initialized;
  }

  /** Must call getTone() after initialize — returns the lazily-loaded Tone module */
  getTone(): Tone {
    if (!this.tone) throw new Error('StudioEngine not initialized. Call initialize() first.');
    return this.tone;
  }

  getMasterChannel() {
    return this.masterChannel;
  }

  getMasterMeter() {
    return this.masterMeter;
  }

  getMasterAnalyser() {
    return this.masterAnalyser;
  }

  /**
   * Initialize the engine. Must be called from a user gesture handler
   * (click/tap) so the AudioContext can start.
   */
  async initialize(): Promise<void> {
    if (this._initialized) return;

    // Dynamically import Tone.js
    this.tone = await import('tone');
    await this.tone.start();

    // Build master chain: Channel → Limiter → Analyser → destination
    this.masterChannel = new this.tone.Channel({ volume: 0, channelCount: 2 }).toDestination();
    this.masterLimiter = new this.tone.Limiter(-1);
    this.masterAnalyser = new this.tone.Analyser('fft', 2048);
    this.masterMeter = new this.tone.Meter({ channelCount: 2 });

    // Route: masterChannel → limiter → analyser → meter → destination
    this.masterChannel.disconnect();
    this.masterChannel.chain(this.masterLimiter, this.masterAnalyser, this.masterMeter, this.tone.getDestination());

    this._initialized = true;
  }

  // ─── Track Channel Management ───────────────────────────────────────────

  createTrackChannel(trackId: string, volume = 0, pan = 0): ToneNS.Channel {
    if (!this.tone || !this.masterChannel) throw new Error('Engine not initialized');

    const channel = new this.tone.Channel({ volume, pan }).connect(this.masterChannel);
    this.trackChannels.set(trackId, channel);
    return channel;
  }

  getTrackChannel(trackId: string): ToneNS.Channel | undefined {
    return this.trackChannels.get(trackId);
  }

  removeTrackChannel(trackId: string): void {
    const channel = this.trackChannels.get(trackId);
    if (channel) {
      channel.dispose();
      this.trackChannels.delete(trackId);
    }
  }

  setTrackVolume(trackId: string, volumeDb: number): void {
    this.trackChannels.get(trackId)?.set({ volume: volumeDb });
  }

  setTrackPan(trackId: string, pan: number): void {
    this.trackChannels.get(trackId)?.set({ pan });
  }

  setTrackMute(trackId: string, muted: boolean): void {
    this.trackChannels.get(trackId)?.set({ mute: muted });
  }

  setTrackSolo(trackId: string, soloed: boolean): void {
    this.trackChannels.get(trackId)?.set({ solo: soloed });
  }

  setMasterVolume(volumeDb: number): void {
    this.masterChannel?.set({ volume: volumeDb });
  }

  // ─── Aux Bus Management ─────────────────────────────────────────────────

  createAuxBus(busId: string, effect: ToneNS.ToneAudioNode): void {
    if (!this.tone || !this.masterChannel) throw new Error('Engine not initialized');

    const send = new this.tone.Channel();
    const ret = new this.tone.Channel().connect(this.masterChannel);
    send.chain(effect, ret);
    this.auxBuses.set(busId, { send, effect, ret });
  }

  connectTrackToAux(trackId: string, busId: string, level = 0): void {
    const channel = this.trackChannels.get(trackId);
    const bus = this.auxBuses.get(busId);
    if (channel && bus) {
      channel.connect(bus.send);
      bus.send.set({ volume: level });
    }
  }

  removeAuxBus(busId: string): void {
    const bus = this.auxBuses.get(busId);
    if (bus) {
      bus.send.dispose();
      bus.effect.dispose();
      bus.ret.dispose();
      this.auxBuses.delete(busId);
    }
  }

  // ─── Cleanup ────────────────────────────────────────────────────────────

  dispose(): void {
    for (const [id] of this.trackChannels) this.removeTrackChannel(id);
    for (const [id] of this.auxBuses) this.removeAuxBus(id);

    this.masterMeter?.dispose();
    this.masterAnalyser?.dispose();
    this.masterLimiter?.dispose();
    this.masterChannel?.dispose();

    this.masterMeter = null;
    this.masterAnalyser = null;
    this.masterLimiter = null;
    this.masterChannel = null;
    this.tone = null;
    this._initialized = false;

    StudioEngine.instance = null;
  }
}
