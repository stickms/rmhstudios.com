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
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.gainNode = this.audioContext.createGain();
      this.gainNode.connect(this.audioContext.destination);
      this.gainNode.gain.value = this.volume;
    }
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

  public play() {
    if (!this.audioContext || !this.buffer) return;
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }

    if (this.isPlaying) this.stop();

    this.source = this.audioContext.createBufferSource();
    this.source.buffer = this.buffer;
    this.source.playbackRate.value = this.playbackRate;
    
    // Normalize Buffer Logic
    // Find peak amplitude
    let peak = 0;
    const channelData = this.buffer.getChannelData(0); // Check first channel
    // Checking every sample is expensive, check every 100th
    for (let i = 0; i < channelData.length; i += 100) {
        const val = Math.abs(channelData[i]);
        if (val > peak) peak = val;
    }
    
    // Target peak is ~0.8 to leave headroom
    const normalizationGain = peak > 0 ? 0.8 / peak : 1.0;
    
    // Connect source -> gain -> destination
    if (!this.gainNode) this.initialize();
    
    // Apply normalization gain via a separate node or just adjust existing gain?
    // Better to have a separate node for normalization so user volume control is independent.
    const normNode = this.audioContext.createGain();
    normNode.gain.value = normalizationGain;
    
    this.source.connect(normNode);
    normNode.connect(this.gainNode!); // Connect to user volume gain

    // Calculate start time
    const now = this.audioContext.currentTime;
    // If we were paused, resume from pauseTime. Else from 0.
    const offset = this.pauseTime;
    
    this.source.start(now, offset);
    
    this.startTime = now - (offset / this.playbackRate);
    this.timeAtLastRateChange = now;
    this.offsetAtLastRateChange = offset;
    
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

  public getDuration(): number {
    return this.buffer ? this.buffer.duration : 0;
  }
}
