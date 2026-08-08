import { getAudioContext } from '@/lib/shared/platform';
export class AudioManager {
  private static instance: AudioManager;
  private audioContext: AudioContext | null = null;
  private source: AudioBufferSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private buffer: AudioBuffer | null = null;
  private startTime: number = 0;
  private pauseTime: number = 0;
  private isPlaying: boolean = false;
  private playbackRate: number = 1.0;
  private volume: number = 1.0;
  
  // Track position logic
  private offsetAtLastRateChange: number = 0;
  private timeAtLastRateChange: number = 0;

  private constructor() {}

  public static getInstance(): AudioManager {
    if (!AudioManager.instance) {
      AudioManager.instance = new AudioManager();
    }
    return AudioManager.instance;
  }

  public initialize() {
    if (this.audioContext) return;
    // Shared and null-safe: construction throws on a device without Web Audio
    // (or once the per-document context budget is spent), and this used to be
    // on the init path of everything that plays a sound.
    this.audioContext = getAudioContext();
    if (!this.audioContext) return;
    this.gainNode = this.audioContext.createGain();
    this.gainNode.connect(this.audioContext.destination);
    this.gainNode.gain.value = this.volume;
  }

  public getContext(): AudioContext | null {
    return this.audioContext;
  }

  public async loadTrack(url: string): Promise<AudioBuffer> {
    if (!this.audioContext) this.initialize();
    
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch audio: ${response.status} ${response.statusText}`);
    const arrayBuffer = await response.arrayBuffer();
    this.buffer = await this.audioContext!.decodeAudioData(arrayBuffer);
    return this.buffer;
  }

  /** Load a pre-decoded AudioBuffer directly, avoiding a network request. */
  public loadFromBuffer(buffer: AudioBuffer): void {
    if (!this.audioContext) this.initialize();
    this.buffer = buffer;
    this.pauseTime = 0;
    this.isPlaying = false;
  }

  /**
   * Begin (or resume) playback.
   *
   * `leadInSeconds` schedules the audio to start that far in the FUTURE while
   * the clock starts running now, so {@link getCurrentTime} returns a negative
   * position counting up to zero. A caller that draws against the clock — Slice
   * It's playfield — gets a silent runway in which notes can travel in from
   * off-screen, without the note times themselves being shifted and without the
   * audio being padded. Measured in the caller's own timebase (song seconds),
   * not wall-clock, so a run at 2x speed gets the same *visible* runway rather
   * than half of one.
   */
  public play(leadInSeconds = 0) {
    if (!this.audioContext || !this.buffer) return;
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }

    if (this.isPlaying) this.stop();

    this.source = this.audioContext.createBufferSource();
    this.source.buffer = this.buffer;
    this.source.playbackRate.value = this.playbackRate;
    
    // RMS Normalization — normalize to a consistent average loudness level,
    // then the user's volume control is applied on top via gainNode.
    const numChannels = this.buffer.numberOfChannels;
    let sumOfSquares = 0;
    let sampleCount = 0;
    const step = 50; // sample every 50th value for performance
    for (let c = 0; c < numChannels; c++) {
      const channelData = this.buffer.getChannelData(c);
      for (let i = 0; i < channelData.length; i += step) {
        sumOfSquares += channelData[i] * channelData[i];
        sampleCount++;
      }
    }
    const rms = sampleCount > 0 ? Math.sqrt(sumOfSquares / sampleCount) : 0;
    // ~-20 dBFS target — comfortable with headroom; cap at 4× to avoid over-amplifying very quiet tracks
    const targetRms = 0.10;
    const normalizationGain = rms > 0 ? Math.min(targetRms / rms, 4.0) : 1.0;
    
    // Connect: source → normNode (per-song RMS normalization) → gainNode (user volume)
    if (!this.gainNode) this.initialize();
    const normNode = this.audioContext.createGain();
    normNode.gain.value = normalizationGain;
    
    this.source.connect(normNode);
    normNode.connect(this.gainNode!); // Connect to user volume gain

    // Calculate start time
    const now = this.audioContext.currentTime;
    // If we were paused, resume from pauseTime. Else from 0.
    //
    // `pauseTime` can be NEGATIVE: pausing during a lead-in stores the position
    // the clock was showing, which is the runway still to go. `start()` rejects
    // a negative offset, so that case resumes at sample zero with the remaining
    // runway re-scheduled as a fresh lead-in — the alternative, clamping it to
    // 0, would swallow the rest of the runway and drop the player straight into
    // the song with notes already on top of the line.
    const paused = this.pauseTime;
    const offset = Math.max(0, paused);
    const pendingLeadIn = Math.max(0, leadInSeconds, paused < 0 ? -paused : 0);

    // The lead-in is expressed in song seconds, so the wall-clock wait shrinks
    // with the playback rate: `getCurrentTime()` then reads exactly
    // `offset - pendingLeadIn` at this instant whatever the rate is, and the
    // runway a note travels is the same at 0.5x and 2x.
    const leadIn = pendingLeadIn / this.playbackRate;
    const startAt = now + leadIn;

    this.source.start(startAt, offset);

    // Anchored to `startAt`, not `now`. `getCurrentTime()` is
    // `offsetAtLastRateChange + (now - timeAtLastRateChange) * rate`, so
    // anchoring ahead makes it return a negative position during the lead-in
    // that rises linearly and crosses zero exactly as the first sample sounds —
    // one timeline, no separate "are we in the lead-in" state for callers to
    // get out of step with.
    this.startTime = startAt - (offset / this.playbackRate);
    this.timeAtLastRateChange = startAt;
    this.offsetAtLastRateChange = offset;
    this.pauseTime = 0;

    this.isPlaying = true;
    
    this.source.onended = () => {
      // Handle natural end vs stop
      // if (this.isPlaying) this.isPlaying = false; 
    };
  }

  public pause() {
    if (!this.source || !this.isPlaying || !this.audioContext) return;
    
    this.source.stop();
    // Calculate and store exact pause time
    this.pauseTime = this.getCurrentTime();
    this.isPlaying = false;
    this.source = null;
  }
  
  public resume() {
     if (this.isPlaying) return;
     this.play(); // Play handles using pauseTime offset
  }

  /**
   * Move playback to an absolute position, in seconds, whether or not the
   * track is currently playing.
   *
   * Requested twice over — by a replay viewer's scrubber
   * (`docs/_handoff/replay-requests.md` #1) and by H6's lead-in skip
   * (`docs/_handoff/presentation-requests.md`) — and both requests proposed
   * this exact method, so it is added once here rather than worked around
   * twice. `play()` already reads `pauseTime` as its start offset; seeking is
   * just relocating that offset and, if we were mid-playback, restarting the
   * source there.
   */
  public seek(seconds: number) {
    const wasPlaying = this.isPlaying;
    if (this.source) {
      try {
        this.source.stop();
      } catch {
        // Already stopped, or never started — nothing to clean up.
      }
      this.source = null;
    }
    this.isPlaying = false;
    this.pauseTime = Math.max(0, Math.min(seconds, this.getDuration() || seconds));
    if (wasPlaying) this.play();
  }

  public stop() {
    if (this.source) {
      try { this.source.stop(); } catch(e) {}
      this.source = null;
    }
    this.pauseTime = 0;
    this.isPlaying = false;
    this.startTime = 0;
    this.offsetAtLastRateChange = 0;
    this.timeAtLastRateChange = 0;
  }

  public setPlaybackRate(rate: number) {
    if (rate === this.playbackRate) return;

    if (this.isPlaying && this.audioContext) {
        // Capture current position before changing rate
        const currentPos = this.getCurrentTime();
        const now = this.audioContext.currentTime;
        
        if (this.source) {
            this.source.playbackRate.setValueAtTime(rate, now);
        }
        
        // Update tracking for getCurrentTime
        this.offsetAtLastRateChange = currentPos;
        this.timeAtLastRateChange = now;
    }
    
    this.playbackRate = rate;
  }
  
  public setVolume(volume: number) {
      this.volume = Math.max(0, Math.min(1, volume));
      if (this.gainNode) {
          this.gainNode.gain.value = this.volume;
      }
  }

  /**
   * Has this track been started at all since it was loaded or stopped?
   *
   * `getCurrentTime()` reports 0 both before the first `play()` and at the very
   * start of playback, and a caller that draws a timeline needs to tell those
   * apart: Slice It renders the pre-roll at `-LEAD_IN_SECONDS` so the opening
   * notes are already off-screen while the countdown runs, instead of sitting
   * near the judgement line and snapping backwards the instant the clock moves.
   * True while paused mid-song, so a pause does not read as "not started".
   */
  public hasBegun(): boolean {
    return this.isPlaying || this.pauseTime !== 0;
  }

  public getCurrentTime(): number {
    if (!this.audioContext) return 0;
    if (!this.isPlaying) return this.pauseTime;
    
    const now = this.audioContext.currentTime;
    // Time passed since last rate change * rate + offset at that time
    return this.offsetAtLastRateChange + (now - this.timeAtLastRateChange) * this.playbackRate;
  }
  
  public playSfX(freq: number, type: OscillatorType = 'sine', duration: number = 0.1, volume: number = 0.5) {
    if (!this.audioContext) this.initialize();
    if (!this.audioContext) return;
    
    // Resume if suspended
    if (this.audioContext.state === 'suspended') {
        this.audioContext.resume();
    }

    const t = this.audioContext.currentTime;
    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    
    // SOFTER SFX LOGIC
    // Use sine wave for less harshness
    osc.type = 'sine'; 
    
    // Pitch Envelope
    // Start slightly higher and drop quickly for a "tick" sound without being a hard click
    osc.frequency.setValueAtTime(freq * 1.2, t);
    osc.frequency.exponentialRampToValueAtTime(freq, t + 0.02);
    
    // Amplitude Envelope (ADSR - emphasis on Attack/Decay)
    // Soft attack to avoid popping
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(volume, t + 0.005); 
    gain.gain.exponentialRampToValueAtTime(0.01, t + duration);
    
    osc.connect(gain);
    gain.connect(this.audioContext.destination);
    
    osc.start(t);
    osc.stop(t + duration);
  }

  /**
   * Schedule a tick at an absolute AudioContext time (P4).
   *
   * `playSfX` fires now; a metronome cannot. Driven from the frame loop, a beat
   * lands whenever `update()` next notices it has passed — so the guide inherits
   * the frame jitter, and a guide that wobbles is worse than none because the
   * player calibrates against it. Handing the beat to the audio clock ahead of
   * time makes it exact regardless of what the main thread is doing.
   *
   * A `when` already in the past is dropped rather than clamped to `now`: a late
   * beat played on time is a beat in the wrong place, which is the failure this
   * exists to avoid.
   */
  public scheduleSfx(
    freq: number,
    type: OscillatorType,
    duration: number,
    volume: number,
    when: number,
  ) {
    if (!this.audioContext) this.initialize();
    if (!this.audioContext) return;
    if (this.audioContext.state === 'suspended') this.audioContext.resume();

    const ctx = this.audioContext;
    if (when < ctx.currentTime) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, when);

    // Same soft attack as playSfX — a hard gate on a square wave pops, and a
    // pop every beat is its own kind of distracting.
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(volume, when + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(when);
    osc.stop(when + duration + 0.02);
  }

  // ── Hit Sound File Playback ──────────────────────────────────────────────
  private hitSoundCache: Map<string, AudioBuffer> = new Map();
  private hitSoundLoading: Map<string, Promise<AudioBuffer>> = new Map();

  /**
   * Check whether a hit sound is already decoded and cached.
   */
  public isHitSoundCached(url: string): boolean {
    return this.hitSoundCache.has(url);
  }

  /**
   * Pre-load a hit sound file into the cache so playback is instant.
   */
  public async preloadHitSound(url: string): Promise<AudioBuffer> {
    if (this.hitSoundCache.has(url)) return this.hitSoundCache.get(url)!;
    if (this.hitSoundLoading.has(url)) return this.hitSoundLoading.get(url)!;

    if (!this.audioContext) this.initialize();

    const loadPromise = fetch(url)
      .then(res => {
        if (!res.ok) throw new Error(`Failed to load hit sound: ${res.status}`);
        return res.arrayBuffer();
      })
      .then(ab => this.audioContext!.decodeAudioData(ab))
      .then(buf => {
        this.hitSoundCache.set(url, buf);
        this.hitSoundLoading.delete(url);
        return buf;
      })
      .catch(err => {
        this.hitSoundLoading.delete(url);
        throw err;
      });

    this.hitSoundLoading.set(url, loadPromise);
    return loadPromise;
  }

  /**
   * Play a cached hit sound file at the given volume.
   * Falls back to synthesised SFX if the buffer isn't cached yet.
   */
  public playHitSoundFile(url: string, volume: number = 0.5, pitch: number = 1.0) {
    if (!this.audioContext) this.initialize();
    if (!this.audioContext) return;

    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }

    const buf = this.hitSoundCache.get(url);
    if (!buf) {
      // Buffer not ready — fire-and-forget preload for next time, play synth fallback now
      this.preloadHitSound(url);
      this.playSfX(880, 'triangle', 0.1, volume);
      return;
    }

    const source = this.audioContext.createBufferSource();
    source.buffer = buf;
    source.playbackRate.value = pitch;

    const gain = this.audioContext.createGain();
    gain.gain.value = Math.max(0, Math.min(1, volume));

    source.connect(gain);
    gain.connect(this.audioContext.destination);
    source.start();
  }

  public getDuration(): number {
    return this.buffer ? this.buffer.duration : 0;
  }
}
