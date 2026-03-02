/**
 * RMHStudio — Mixer Engine
 *
 * Manages per-channel audio routing (gain, pan, mute/solo) and the master
 * bus.  Provides AnalyserNodes for peak-level metering in the UI.
 */

export interface ChannelStrip {
  gainNode: GainNode;
  panNode: StereoPannerNode;
  analyser: AnalyserNode;
  mute: boolean;
  solo: boolean;
  volume: number; // 0–1 (pre-mute)
  pan: number;    // -1 … 1
}

export class Mixer {
  private channels: ChannelStrip[] = [];
  private masterGain: GainNode;
  private masterAnalyser: AnalyserNode;
  private limiter: DynamicsCompressorNode;

  constructor(private ctx: AudioContext) {
    // Master chain: masterGain → limiter → analyser → destination
    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = 0.8;

    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -3;
    this.limiter.knee.value = 6;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.1;

    this.masterAnalyser = ctx.createAnalyser();
    this.masterAnalyser.fftSize = 256;

    this.masterGain.connect(this.limiter);
    this.limiter.connect(this.masterAnalyser);
    this.masterAnalyser.connect(ctx.destination);
  }

  /** Get the destination node for a channel (the input of its gain chain). */
  getChannelInput(index: number): AudioNode {
    return this.ensureChannel(index).gainNode;
  }

  /** Get the master gain node (for routing things like metronome). */
  getMasterInput(): AudioNode {
    return this.masterGain;
  }

  /** Create / ensure a channel strip exists at the given index. */
  private ensureChannel(index: number): ChannelStrip {
    while (this.channels.length <= index) {
      const gain = this.ctx.createGain();
      const pan = this.ctx.createStereoPanner();
      const analyser = this.ctx.createAnalyser();
      analyser.fftSize = 256;

      gain.connect(pan);
      pan.connect(analyser);
      analyser.connect(this.masterGain);

      this.channels.push({
        gainNode: gain,
        panNode: pan,
        analyser,
        mute: false,
        solo: false,
        volume: 0.8,
        pan: 0,
      });
    }
    return this.channels[index];
  }

  /** Initialise channel strips to match the given count. */
  initChannels(count: number) {
    // Ensure we have enough strips
    for (let i = 0; i < count; i++) this.ensureChannel(i);
  }

  // ─── Volume / Pan ─────────────────────────────────────────────

  setChannelVolume(index: number, volume: number) {
    const ch = this.ensureChannel(index);
    ch.volume = Math.max(0, Math.min(1, volume));
    this.applyChannelGain(index);
  }

  setChannelPan(index: number, pan: number) {
    const ch = this.ensureChannel(index);
    ch.pan = Math.max(-1, Math.min(1, pan));
    ch.panNode.pan.setValueAtTime(ch.pan, this.ctx.currentTime);
  }

  // ─── Mute / Solo ──────────────────────────────────────────────

  setChannelMute(index: number, mute: boolean) {
    const ch = this.ensureChannel(index);
    ch.mute = mute;
    this.applyAllGains();
  }

  setChannelSolo(index: number, solo: boolean) {
    const ch = this.ensureChannel(index);
    ch.solo = solo;
    this.applyAllGains();
  }

  private applyAllGains() {
    const anySolo = this.channels.some(c => c.solo);
    for (let i = 0; i < this.channels.length; i++) {
      this.applyChannelGain(i, anySolo);
    }
  }

  private applyChannelGain(index: number, anySolo?: boolean) {
    const ch = this.channels[index];
    if (!ch) return;
    if (anySolo === undefined) anySolo = this.channels.some(c => c.solo);

    let effective = ch.volume;
    if (ch.mute) effective = 0;
    else if (anySolo && !ch.solo) effective = 0;

    ch.gainNode.gain.setValueAtTime(effective, this.ctx.currentTime);
  }

  // ─── Master ───────────────────────────────────────────────────

  setMasterVolume(volume: number) {
    this.masterGain.gain.setValueAtTime(
      Math.max(0, Math.min(1, volume)),
      this.ctx.currentTime,
    );
  }

  // ─── Metering ─────────────────────────────────────────────────

  /** Returns peak amplitude (0–1) for a channel. */
  getChannelPeak(index: number): number {
    const ch = this.channels[index];
    if (!ch) return 0;
    return this.peakFromAnalyser(ch.analyser);
  }

  /** Returns peak amplitude (0–1) for the master bus. */
  getMasterPeak(): number {
    return this.peakFromAnalyser(this.masterAnalyser);
  }

  private peakBuf = new Float32Array(128);
  private peakFromAnalyser(analyser: AnalyserNode): number {
    if (this.peakBuf.length !== analyser.fftSize / 2) {
      this.peakBuf = new Float32Array(analyser.fftSize / 2);
    }
    analyser.getFloatTimeDomainData(this.peakBuf);
    let peak = 0;
    for (let i = 0; i < this.peakBuf.length; i++) {
      const abs = Math.abs(this.peakBuf[i]);
      if (abs > peak) peak = abs;
    }
    return peak;
  }

  /** Disconnect everything for cleanup. */
  dispose() {
    for (const ch of this.channels) {
      ch.gainNode.disconnect();
      ch.panNode.disconnect();
      ch.analyser.disconnect();
    }
    this.masterGain.disconnect();
    this.limiter.disconnect();
    this.masterAnalyser.disconnect();
    this.channels = [];
  }
}
