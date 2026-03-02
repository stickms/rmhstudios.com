# DAW Web Application — Feature Brainstorm

**Stack:** Next.js · TypeScript · Better Auth · Prisma  
**Vision:** A browser-based digital audio workstation inspired by FL Studio, delivering professional-grade music production capabilities with the accessibility of a web app.

---

## 1. Core Audio Engine

### 1.1 Playback & Transport
- Play, pause, stop, record with low-latency Web Audio API scheduling
- Loop region selection (bar-level and free-form)
- Song mode vs. pattern mode toggle (FL Studio-style)
- Tempo control with tap-tempo and tempo automation
- Time signature support (4/4, 3/4, 6/8, odd meters)
- Metronome with configurable sound, volume, and count-in bars
- Swing / groove templates (MPC, Akai, custom)
- Master BPM with per-pattern BPM override option
- Audio clock sync (MIDI clock, Ableton Link if feasible via WebRTC bridge)

### 1.2 Audio Processing
- Real-time audio graph routing via Web Audio API + AudioWorklet
- Sample-accurate scheduling and latency compensation
- Offline rendering / bounce-to-file (WAV, MP3, FLAC, OGG)
- Dithering options on export (16-bit, 24-bit, 32-bit float)
- Resampling quality settings (linear, sinc, high-quality sinc)
- Sidechain routing between any channels
- Multi-threaded processing via AudioWorklet + SharedArrayBuffer

### 1.3 Audio I/O
- Microphone / line-in recording via `getUserMedia`
- MIDI input via Web MIDI API (external controllers)
- Multi-take recording with comp (composite take) lanes
- Punch-in / punch-out recording
- Audio interface selection (input/output device picker)
- Adjustable buffer size for latency tuning
- Monitor toggle (direct monitoring vs. software monitoring)

---

## 2. Arrangement & Sequencing

### 2.1 Playlist / Arrangement View
- Horizontal timeline with beat/bar/time rulers
- Drag-and-drop pattern clips, audio clips, and automation clips
- Clip colors, naming, grouping, and clip-level gain/fade
- Slip editing (move audio within a clip boundary)
- Time-stretch and pitch-shift clips (Elastique-style algorithm)
- Split, merge, duplicate, and ghost (reference) clips
- Marker system (intro, verse, chorus, drop, etc.) with color coding
- Arrangement sections / song structure blocks
- Track freeze / unfreeze for CPU optimization

### 2.2 Pattern / Step Sequencer
- FL Studio-style step sequencer grid per pattern
- Configurable step count (16, 32, 64, custom)
- Per-step velocity, panning, pitch, filter cutoff, and swing
- Graph editor below the step sequencer for per-step parameter editing
- Pattern cloning, linking (instances vs. unique copies)
- Pattern color coding and categorization
- Polyrhythmic patterns (different step counts per channel)

### 2.3 Piano Roll
- Full MIDI note editor with velocity coloring
- Snap-to-grid with configurable subdivisions (1/1 through 1/64, triplets, dotted)
- Draw, paint, erase, select, slice, glue tools
- Ghost notes from other channels (semi-transparent overlay)
- Chord stamp tool (major, minor, 7th, dim, aug, sus, custom voicings)
- Scale highlighting / locking (force notes to scale)
- Strum tool (offset note start times to simulate strumming)
- Arpeggiator tool (convert chords to arpeggiated sequences)
- Randomize velocity, timing, and pitch within ranges
- MIDI CC lanes below the note editor (modwheel, expression, pitch bend, etc.)
- Slide notes and portamento support
- Note color grouping (by channel, velocity, custom)
- Multi-pattern editing (view/edit multiple patterns simultaneously)
- Humanize function (subtle timing and velocity randomization)
- Legato / overlap adjustment tools
- Quick quantize and advanced quantize dialogs

---

## 3. Mixer

### 3.1 Channel Strip
- Volume fader, pan knob, mute, solo, arm for recording
- Insert FX slots (up to 10 per channel)
- Send knobs routed to return/bus tracks
- Channel routing (any channel → any other channel or bus)
- Phase invert, stereo separation, and stereo swap
- Channel delay compensation (manual PDC override)
- Input source selector (pattern, audio in, sidechain)
- Per-channel metering (peak, RMS, LUFS)

### 3.2 Mixer Layout
- Resizable mixer panel (dockable, floating, or full-screen)
- Track grouping / folder tracks with sub-mix behavior
- Color-coded tracks with custom icons
- Mixer snapshot save/recall (A/B comparison)
- Channel strip drag reordering
- Mixer undo history (separate from arrangement undo)

### 3.3 Master Channel
- Master volume and limiter
- Master insert FX chain
- Stereo imaging / mid-side processing
- Spectrum analyzer and loudness meter (integrated LUFS)
- Reference track slot (load a commercial mix for comparison)
- Mono compatibility check toggle

---

## 4. Built-In Synth Plugins

### 4.1 "WaveLab" — Subtractive Synthesizer
> *The bread-and-butter synth. Modeled after classic subtractive synthesis (Sylenth1 / Serum basic mode).*

- **Oscillators (×3):** Saw, square, triangle, sine, noise, plus 32+ wavetable shapes
- **Oscillator Controls:** Coarse tune (±24 semitones), fine tune (±100 cents), phase, waveform morph, pulse width
- **Sub-oscillator:** Dedicated sine/square sub one or two octaves down
- **Noise generator:** White, pink, and filtered noise with independent level
- **Unison:** Up to 8 voices per oscillator, detune spread, stereo width, unison blend mode
- **Filters (×2):** Low-pass, high-pass, band-pass, notch, comb, formant — 12/24/48 dB slopes
- **Filter routing:** Serial, parallel, or split
- **Envelopes (×4):** ADSR with curve shaping, loopable, tempo-syncable
- **LFOs (×4):** Sine, saw, square, triangle, S&H, custom shape — free or tempo-synced, mono/poly
- **Modulation matrix:** Any source → any destination with depth, curve, and via (velocity, mod wheel, aftertouch)
- **Effects section:** Built-in distortion, chorus, delay, reverb per-voice
- **Preset browser** with category tagging and search

### 4.2 "Prism" — Wavetable Synthesizer
> *Deep wavetable synth for modern sound design (Serum-inspired).*

- **Oscillators (×2):** Load or draw custom wavetables, up to 256 frames per table
- **Wavetable editor:** Draw, import from audio, spectral editing, additive harmonic editor
- **Wavetable position** as modulatable parameter (morph through frames)
- **Warp modes:** Sync, bend, mirror, PWM, asymmetric, FM from oscillator B
- **FM / RM:** Frequency and ring modulation between oscillators
- **Spectral filter:** Per-partial amplitude and phase control
- **Macro knobs (×8):** Assignable to any parameter, exposable as host automation
- **Global unison** with up to 16 voices, multiple detune algorithms (linear, exponential, super)
- **Drag-and-drop modulation:** Visual mod routing by dragging LFO/ENV onto any knob
- **Advanced filter types:** Phaser filter, vocal formant filter, ladder, SVF, dirty analog model
- **Built-in FX rack:** Distortion, multi-band compressor, chorus, flanger, phaser, delay, reverb, EQ

### 4.3 "Pulse" — Drum Synthesizer
> *Dedicated percussion synthesis engine for kicks, snares, hats, and toms without samples.*

- **Kick engine:** Sine oscillator with pitch envelope (punch), saturation, sub-layer, click transient generator
- **Snare engine:** Noise burst + tone oscillator, noise color control, transient snap, body decay
- **Hi-hat engine:** Metallic oscillator bank (6 partials), noise mix, decay/choke control, open/closed morph
- **Tom engine:** Sine/triangle oscillator with pitch envelope, body resonance, overtone tuning
- **Clap engine:** Multi-layered noise bursts with scatter/spread, tone coloring, reverb tail
- **Cymbal/ride engine:** Inharmonic partial generator, shimmer control, bell/bow/edge morph
- **Global per-pad:** Pitch, decay, drive, tone filter, output routing, velocity curve
- **8-pad layout** with drag-and-drop to step sequencer channels
- **Randomize button** per pad for quick variations
- **Preset kits** organized by genre (trap, house, techno, lo-fi, acoustic, etc.)

### 4.4 "Rhodes" — Electric Piano / Keys
> *Physically modeled electric piano, organ, and clav sounds.*

- **Models:** Rhodes, Wurlitzer, Clavinet, CP-80, DX7 E.Piano, Hammond organ
- **Tine/Tone balance:** Adjustable hammer hardness and tine brightness
- **Velocity response curves:** Soft, medium, hard, custom
- **Tremolo:** Rate, depth, stereo spread (auto-pan or true tremolo)
- **Built-in amp sim:** Clean, overdriven, tube saturation with cabinet selection
- **Chorus / phaser** with classic CE-1 and Small Stone models
- **Key noise:** Mechanical key-off noise with adjustable level
- **Sustain pedal behavior:** Half-pedaling support, re-pedal catch
- **Hammond mode extras:** Drawbar control (9 drawbars), key click, rotary speaker sim (slow/fast/brake)
- **Layer / split** with adjustable crossover point

### 4.5 "Granular" — Granular Synthesizer
> *Granular engine for evolving textures, pads, and experimental sound design.*

- **Sample loader:** Drag-and-drop any audio file as grain source
- **Grain controls:** Size (1ms–500ms), density (1–100 grains/sec), position, spray/jitter
- **Position automation:** Scrub through source audio manually or via LFO/envelope
- **Pitch per grain:** Random pitch spread, harmonize, quantize to scale
- **Grain envelope:** Attack/release per grain with shape control
- **Stereo scatter:** Randomize grain panning for spatial width
- **Freeze mode:** Lock grain position for infinite sustain pad
- **Reverse grains** toggle and probability
- **Multi-source:** Load up to 4 audio sources and crossfade between them
- **Modulation:** 2 LFOs, 2 envelopes, mod matrix, macro knobs
- **Built-in FX:** Reverb, delay, shimmer, pitch shifter, lo-fi degradation

### 4.6 "Strummer" — Plucked String Synthesizer
> *Karplus-Strong physical modeling for guitars, harps, sitars, and plucked instruments.*

- **Exciter types:** Noise burst, pick, bow, hammer, pluck
- **String model:** Decay time, damping, brightness, body resonance
- **Body selector:** Nylon guitar, steel guitar, harp, koto, sitar, banjo, custom IR
- **Strum engine:** Auto-strum with configurable direction, speed, and pattern
- **Sympathetic resonance** toggle (other strings ring based on played notes)
- **Palm mute / harmonics** articulation controls
- **Fret noise** and slide noise level
- **Chord mode:** Strum full chords from single MIDI notes
- **Pickup position** simulation (bridge, middle, neck)
- **Built-in amp/cab sim** with pedal board (overdrive, chorus, wah, tremolo)

### 4.7 "Additive" — Additive / Spectral Synthesizer
> *Control individual harmonics for precise tonal sculpting and resynthesis.*

- **Partial editor:** Up to 256 individually controllable harmonics
- **Amplitude + phase** per partial with visual spectrum display
- **Resynthesis:** Import audio and decompose into partials for manipulation
- **Partial groups:** Select and edit ranges of harmonics together
- **Morph between snapshots:** Keyframe harmonic states and morph over time
- **Filter as partial mask:** Draw filter shapes directly on the spectrum
- **Noise layer:** Residual noise from resynthesis or synthetic noise
- **Envelopes per partial group** for evolving timbres
- **Export to wavetable** for use in Prism synth

### 4.8 "Sampler" — Multi-Sample Instrument
> *Classic sampler for loading and mapping audio across the keyboard (Kontakt-lite).*

- **Multi-zone mapping:** Drag samples onto a key/velocity map grid
- **Auto-mapping:** Detect root notes and auto-distribute across zones
- **Per-zone controls:** Volume, pan, tune, start/end points, loop (forward, ping-pong, crossfade)
- **Round-robin layers** and random layer selection
- **Velocity layers** with adjustable crossfade
- **Global filter, envelope (ADSR), LFO, and pitch envelope**
- **Choke groups** (hi-hat open/closed behavior)
- **Time-stretching mode** per zone (repitch, stretch, slice)
- **Slice mode:** Auto-slice loops by transient, equal divisions, or manual markers
- **SFZ / SF2 import** for loading existing sample libraries
- **One-shot mode** for drum hits and FX

### 4.9 "FM8" — FM Synthesizer
> *Frequency modulation synthesis for bells, basses, pads, and complex evolving timbres.*

- **Operators (×6):** Each with waveform (sine, saw, square, triangle, custom), ratio, level, and envelope
- **Algorithm selector:** 32 preset routing algorithms (visual diagram) + freeform matrix
- **Operator matrix:** Drag to connect any operator to any other (including self-feedback)
- **Per-operator envelope:** ADSR + rate scaling for pitch-dependent behavior
- **Per-operator tuning:** Coarse ratio, fine detune, fixed frequency mode
- **Velocity sensitivity** per operator
- **Modulation index** as automatable parameter
- **Visualizer:** Real-time waveform display showing output of each operator and combined result
- **Classic presets:** DX7 bass, e-piano, bell, pad, pluck faithful recreations
- **Randomize algorithm** for experimental discovery

### 4.10 "Drift" — Analog-Modeled Monosynth
> *Monophonic synth with analog imperfections for leads, basses, and acid lines.*

- **Oscillators (×2 + sub):** Saw, square, triangle with PWM, cross-mod, hard sync
- **Analog drift:** Configurable pitch instability, filter wobble, and oscillator phase drift
- **Glide / portamento:** Legato and always-on modes with adjustable time and curve
- **24dB Ladder filter** with drive, resonance (self-oscillating), and key tracking
- **Accent system:** Velocity-driven filter spike (303-style accent)
- **Arpeggiator:** Built-in with pattern editor, octave range, gate length
- **Sequencer:** 16-step internal sequencer with per-step pitch, slide, and accent
- **Unison mode:** Up to 4 voices with detune (mono stack)
- **Analog-style envelopes:** Snappy to slow with nonlinear curves
- **Overdrive / distortion** post-filter with multiple saturation models

---

## 5. Built-In Effects Plugins

### 5.1 Dynamics
- **Compressor:** Threshold, ratio, attack, release, knee, makeup gain, sidechain input, visualizer
- **Multi-Band Compressor:** 3–5 adjustable bands with independent dynamics per band
- **Limiter:** Brick-wall limiting with lookahead, ceiling, release, and loudness metering
- **Gate / Expander:** Threshold, range, attack, hold, release, sidechain-triggered
- **De-Esser:** Frequency-targeted dynamic EQ for sibilance control
- **Transient Shaper:** Attack and sustain gain with per-band mode

### 5.2 Equalization
- **Parametric EQ:** 8-band fully parametric with spectrum analyzer overlay
- **Graphic EQ:** 31-band graphic with ±12 dB per band
- **Dynamic EQ:** Per-band threshold-triggered EQ adjustments
- **Linear Phase EQ:** Zero phase distortion mode for mastering
- **Tilt EQ:** Single-knob tonal balance (dark ↔ bright)
- **Mid/Side EQ:** Independent EQ for mid and side signals

### 5.3 Reverb
- **Algorithmic Reverb:** Room, hall, plate, chamber, cathedral — with size, decay, damping, pre-delay, diffusion, modulation, early reflections mix
- **Convolution Reverb:** Load impulse responses (IR), position/stretch/reverse IR, wet/dry
- **Shimmer Reverb:** Pitch-shifted feedback for ethereal textures
- **Gated Reverb:** 80s-style gated verb with adjustable gate time
- **Spring Reverb:** Modeled spring tank with drip and boing character

### 5.4 Delay
- **Stereo Delay:** Independent L/R time (free or synced), feedback, filtering, ping-pong mode
- **Tape Delay:** Analog-modeled tape echo with wow/flutter, saturation, degradation
- **Multi-Tap Delay:** Up to 8 taps with independent timing, level, pan, and filter
- **Granular Delay:** Grain-based delay with pitch, density, and scatter
- **Ducking Delay:** Auto-ducks delay tails when input signal is present

### 5.5 Modulation FX
- **Chorus:** Rate, depth, voices, stereo spread (classic CE-1/Juno models)
- **Flanger:** Rate, depth, feedback, manual, through-zero mode
- **Phaser:** 4/6/8/12-stage, rate, depth, feedback, stereo
- **Tremolo / Auto-Pan:** Rate, depth, shape, stereo mode
- **Ring Modulator:** Carrier frequency, mix, with envelope follower option
- **Vibrato:** Rate, depth with mod wheel control

### 5.6 Distortion & Saturation
- **Overdrive:** Soft-clipping tube-style warmth
- **Distortion:** Hard-clipping aggressive grit
- **Bit Crusher:** Bit depth and sample rate reduction
- **Tape Saturation:** Analog tape warmth with hiss and compression
- **Waveshaper:** Custom transfer curve editor
- **Cabinet Simulator:** Guitar and bass cab IRs with mic position

### 5.7 Utility & Analysis
- **Spectrum Analyzer:** FFT display with adjustable resolution, peak hold
- **Oscilloscope:** Waveform display with trigger, zoom, and XY Lissajous mode
- **Loudness Meter:** Integrated LUFS, short-term, momentary, true peak, LRA
- **Correlation Meter:** Phase correlation and stereo balance
- **Tuner:** Chromatic tuner for audio input
- **Stereo Imager:** Widen or narrow stereo field, mid/side balance, multi-band
- **Utility:** Gain, pan, phase flip, mono, channel swap, DC offset removal
- **Test Tone Generator:** Sine, white/pink noise, sweep — for calibration

---

## 6. Sample & Asset Management

### 6.1 Browser Panel
- Persistent side-panel file browser (collapsible)
- Browse local uploaded samples, user library, and built-in factory library
- Folder tree navigation with favorites / bookmarks
- Drag-and-drop samples onto step sequencer, playlist, sampler, or any drop target
- Audio preview on hover or click with auto-tempo sync
- Search with filters: name, file type, BPM, key, tags, duration, sample rate
- Tag system (user-defined and auto-detected)
- Waveform thumbnail previews
- "Smart folders" with auto-populating filter rules

### 6.2 Sample Processing
- On-import normalization option
- Auto-BPM detection for loops
- Auto-key detection for melodic samples
- Sample editor: trim, fade, normalize, reverse, time-stretch, pitch-shift
- Batch processing for imported samples

### 6.3 Cloud Storage (Prisma-backed)
- User sample library stored in cloud (S3/R2 + Prisma metadata)
- Upload progress with drag-and-drop anywhere
- Storage quota per plan tier
- Sample pack marketplace / community sharing (optional future)
- Version history for user-uploaded samples

---

## 7. Automation

### 7.1 Automation Clips
- Dedicated automation clip type in playlist
- Link any plugin parameter, mixer knob, or synth control to automation
- Curve types: linear, smooth (bezier), stairs, single curve, double curve
- Point editing: add, move, delete, copy, paste nodes
- LFO tool: paint repeating automation shapes (sine, saw, square, custom)
- Automation snap to grid (bar, beat, step)
- Copy automation between parameters

### 7.2 Automation Recording
- Touch mode: write only while adjusting a control
- Latch mode: write continuously after first touch
- Write mode: overwrite continuously during playback
- Trim mode: relative adjustment of existing automation

### 7.3 Modulation vs. Automation
- Clear distinction between per-voice modulation (synth-internal) and track-level automation
- Ability to convert between modulation curves and automation clips
- Automation takes priority over modulation when both exist

---

## 8. MIDI & Controller Support

### 8.1 Web MIDI Integration
- Auto-detect connected MIDI devices via Web MIDI API
- MIDI learn mode: click any knob/fader → move physical controller → mapped
- MIDI mapping profiles (save/load per controller)
- MIDI CC, note, pitch bend, aftertouch, program change support
- MIDI through (route external MIDI to any instrument)

### 8.2 Virtual Controllers
- On-screen MIDI keyboard (resizable, velocity-sensitive via vertical mouse position)
- On-screen drum pads (4×4 grid, velocity-sensitive)
- On-screen XY pad for filter/modulation control
- Touch-optimized controls for tablet use

### 8.3 MIDI Tools
- MIDI file import / export (.mid)
- MIDI channel routing and filtering
- Chord detector (display detected chords in real-time)
- MIDI transpose, velocity scaling, and CC remapping
- MIDI clock output for syncing external gear

---

## 9. Collaboration & Social

### 9.1 Real-Time Collaboration
- Live multi-user editing (Google Docs-style cursors)
- WebSocket / CRDT-based state synchronization
- Per-user cursor colors and presence indicators
- Role-based permissions: owner, editor, viewer
- Voice chat room integrated into session (WebRTC)
- Conflict resolution for simultaneous edits
- Activity feed / changelog showing who changed what

### 9.2 Project Sharing
- Share project via link (public, unlisted, or invite-only)
- Fork / remix projects (with attribution chain)
- Comment system: timestamped comments on the timeline
- Version snapshots with diff comparison
- Export collaboration as stems for external mixing

### 9.3 Community
- Public profile pages with published tracks and projects
- Follow system and activity feed
- Like / repost / comment on published tracks
- Embed player widget for external sites
- Community preset/sample sharing marketplace
- Challenge / contest system (weekly beat battles, remix competitions)
- Genre and tag-based discovery feed

---

## 10. Project Management

### 10.1 Project Files (Prisma-backed)
- Auto-save with configurable interval (every 30s, 1min, 5min)
- Manual save with Ctrl+S
- Project version history with named snapshots
- Project templates (start from genre-specific setups)
- Duplicate / archive / delete projects
- Project metadata: title, artist, genre, BPM, key, description, artwork
- Import/export project as single archive file (.dawproj or .zip)
- Recent projects list with thumbnails and last-modified time

### 10.2 Undo / Redo System
- Unlimited undo/redo stack per session
- Branching undo (undo tree, not just linear)
- Undo history panel showing all actions with timestamps
- Selective undo (undo a specific past action without reverting everything after)
- Undo scope: global, per-view (piano roll, mixer, playlist)

### 10.3 File Management
- Project folder structure in cloud storage
- Collect all and save (bundle all samples into project)
- Missing sample finder / relink tool
- Purge unused samples from project

---

## 11. Export & Rendering

### 11.1 Audio Export
- Full mix export (WAV, MP3, FLAC, OGG)
- Stem export (per-track or per-bus bouncing)
- Selection export (render only highlighted region)
- Tail mode: leave remainder, cut, wrap remainder
- Bit depth: 16, 24, 32-bit float
- Sample rate: 44.1k, 48k, 88.2k, 96k
- Normalize option: off, peak, LUFS target (-14, -16, custom)
- Dither: none, triangular, noise-shaped
- Split mixer tracks (export each mixer channel as separate file)
- Real-time export vs. offline (fast) render

### 11.2 MIDI Export
- Export all MIDI data as .mid file
- Per-channel MIDI export
- Include CC automation in MIDI export

### 11.3 Project Export
- Export as shareable project archive
- Export project notes / session info as PDF
- Stem package export for collaboration (labeled stems + session notes)

### 11.4 Video Export
- Sync audio to imported video file
- Export combined audio + video
- Visualizer generation (waveform, spectrum, particle-based)
- Thumbnail/artwork attachment for social media export

---

## 12. UI / UX Design

### 12.1 Layout System
- Resizable, dockable panels (step sequencer, piano roll, mixer, browser, playlist)
- Tab system for multiple open editors
- Detachable panels (pop out to separate windows/monitors)
- Customizable layout presets (production, mixing, mastering, minimal)
- Full-screen mode per panel
- Responsive design — usable on tablets (touch-optimized)
- Minimap for playlist and piano roll (bird's-eye view of entire arrangement)

### 12.2 Theme & Appearance
- Dark mode (default), light mode, and custom theme support
- Theme editor: accent color, background, panel colors, text color
- Community themes (import/export .json theme files)
- UI scaling (75%, 100%, 125%, 150%)
- Font size adjustment
- High contrast / accessibility mode
- Waveform color customization
- Knob style selector (FL-style, Ableton-style, skeuomorphic, flat)

### 12.3 Tooltips & Hints
- Hover tooltips for every knob, button, and control
- "What's this?" mode — click anywhere for a detailed explanation
- Parameter value display on hover (dB, Hz, ms, %, etc.)
- Beginner mode with persistent helper text and guided arrows
- Tutorial overlay for first-time users

---

## 13. Keyboard Shortcuts & Bindings

### 13.1 Transport
| Action | Default Shortcut |
|---|---|
| Play / Pause | `Space` |
| Stop | `Space` (double tap) |
| Record | `R` |
| Toggle Loop | `L` |
| Toggle Metronome | `M` |
| Tap Tempo | `T` (repeated) |
| Rewind to Start | `Home` |
| Jump to End | `End` |
| Nudge Position Forward | `→` |
| Nudge Position Backward | `←` |

### 13.2 Editing
| Action | Default Shortcut |
|---|---|
| Undo | `Ctrl+Z` |
| Redo | `Ctrl+Shift+Z` / `Ctrl+Y` |
| Cut | `Ctrl+X` |
| Copy | `Ctrl+C` |
| Paste | `Ctrl+V` |
| Duplicate | `Ctrl+D` |
| Select All | `Ctrl+A` |
| Delete Selection | `Delete` / `Backspace` |
| Quantize | `Ctrl+Q` |
| Group | `Ctrl+G` |
| Ungroup | `Ctrl+Shift+G` |

### 13.3 Navigation
| Action | Default Shortcut |
|---|---|
| Open Mixer | `F9` |
| Open Piano Roll | `F7` |
| Open Step Sequencer | `F6` |
| Open Playlist | `F5` |
| Open Browser | `Alt+F8` |
| Open Plugin Picker | `F8` |
| Zoom In | `Ctrl+=` / `Ctrl+Scroll Up` |
| Zoom Out | `Ctrl+-` / `Ctrl+Scroll Down` |
| Scroll Timeline | `Middle Mouse Drag` / `Shift+Scroll` |
| Switch Pattern | `Numpad +/-` |

### 13.4 Tools (Piano Roll / Playlist)
| Action | Default Shortcut |
|---|---|
| Draw Tool | `P` (pencil) |
| Select Tool | `V` |
| Erase Tool | `E` |
| Slice Tool | `C` |
| Mute Tool | `T` |
| Zoom Tool | `Z` |
| Playback Tool | `Y` |

### 13.5 Mixer
| Action | Default Shortcut |
|---|---|
| Solo Channel | `S + Click` |
| Mute Channel | `Ctrl+Click` on mute |
| Arm for Recording | `Shift+Click` on track |
| Reset Fader to 0dB | `Double-Click Fader` |
| Bypass Insert FX | `Alt+Click` on FX slot |

### 13.6 Global
| Action | Default Shortcut |
|---|---|
| Save Project | `Ctrl+S` |
| Save As | `Ctrl+Shift+S` |
| Open Project | `Ctrl+O` |
| New Project | `Ctrl+N` |
| Export Audio | `Ctrl+Shift+E` |
| Toggle Full Screen | `F11` |
| Open Settings | `Ctrl+,` |
| Open Keyboard Shortcut Editor | `Ctrl+K` |
| Command Palette | `Ctrl+Shift+P` |

### 13.7 Customization
- Full keyboard shortcut editor (rebind any action)
- Multiple shortcut profiles (FL Studio, Ableton, Logic, custom)
- Chord shortcut macros (bind a key to trigger a sequence of actions)
- Per-context shortcuts (different binds in piano roll vs. mixer vs. playlist)
- Print shortcut cheat sheet as PDF
- Import/export keybind profiles

---

## 14. Settings & Preferences

### 14.1 Audio Settings
- Output device selection
- Input device selection
- Buffer size / latency configuration
- Sample rate selection
- Audio driver mode (if applicable)
- CPU usage / DSP meter with overload warning
- Multi-core processing toggle
- Audio engine restart without losing project state

### 14.2 Project Defaults
- Default BPM, time signature, and key
- Default number of mixer tracks
- Default step sequencer step count
- Auto-save interval
- Default export format and settings
- Template selection for new projects

### 14.3 UI Preferences
- Theme selection
- UI scale
- Animation toggle (reduce motion for accessibility or performance)
- Scroll direction (natural vs. traditional)
- Knob behavior: circular, vertical drag, or horizontal drag
- Meter ballistics: peak hold time, falloff speed
- Waveform rendering: filled, outline, gradient
- Piano roll note style: block, rounded, FL-style
- Grid brightness / opacity

### 14.4 MIDI Settings
- MIDI device configuration and channel filtering
- MIDI learn enable/disable
- MIDI mapping import/export
- Velocity curve editor (global or per-device)
- MIDI transpose offset

### 14.5 Account & Cloud
- Profile management (display name, avatar, bio)
- Subscription / plan management
- Cloud storage usage and quota
- Two-factor authentication (via Better Auth)
- Connected accounts (Google, GitHub, Discord)
- Data export (GDPR compliance — download all your data)
- Delete account

### 14.6 Notifications
- Collaboration invite notifications
- Comment and activity notifications
- Render completion notifications (browser push)
- Auto-save confirmation toasts
- Error/warning notifications with action suggestions
- Notification sound toggle

---

## 15. Authentication & User System (Better Auth + Prisma)

### 15.1 Authentication
- Email/password registration and login
- OAuth providers: Google, GitHub, Discord, Apple
- Magic link / passwordless login
- Two-factor authentication (TOTP / authenticator app)
- Session management (view active sessions, revoke remotely)
- Rate limiting on auth endpoints
- CAPTCHA on registration

### 15.2 User Roles & Permissions
- Free tier, Pro tier, Team tier with feature gating
- Admin panel for platform management
- Per-project role: owner, collaborator, viewer
- API key management for third-party integrations

### 15.3 Prisma Data Models (High Level)
- `User` — profile, settings, subscription tier
- `Project` — metadata, BPM, key, owner, collaborators, version
- `ProjectVersion` — snapshot of project state at a point in time
- `Track` — type (instrument, audio, bus), mixer settings, FX chain
- `Pattern` — step data, MIDI data, linked instrument
- `AutomationClip` — parameter target, curve points
- `Sample` — file reference, metadata (BPM, key, tags), owner
- `Preset` — plugin type, parameter blob, name, tags, author
- `Comment` — project, timestamp, author, text
- `Collaboration` — project, user, role, invite status

---

## 16. Performance & Optimization

### 16.1 Client-Side
- Web Worker offloading for non-audio computation (waveform rendering, FFT analysis)
- AudioWorklet for all DSP (never run DSP on main thread)
- SharedArrayBuffer for zero-copy audio buffer sharing between threads
- Canvas / WebGL rendering for waveforms, meters, and spectrum analyzers
- Virtual scrolling for large track lists and sample browsers
- Lazy loading for panels not currently visible
- IndexedDB caching for project state and sample data (offline mode)
- WASM modules for performance-critical DSP (filters, FFT, resampling)
- GPU-accelerated rendering for visual plugins (spectrum, oscilloscope)

### 16.2 Server-Side
- Edge rendering for static pages (Next.js edge runtime)
- API route caching with stale-while-revalidate
- CDN for sample and asset delivery
- WebSocket server for real-time collaboration (separate from Next.js)
- Background jobs for audio rendering/bouncing (offload to server workers)
- Database connection pooling (Prisma + PgBouncer)
- Rate limiting and abuse prevention on all API routes

### 16.3 Progressive Loading
- Initial load: transport bar, step sequencer, basic mixer (< 3s target)
- Deferred load: piano roll, full mixer, plugin UIs, browser panel
- Lazy load synth engines only when a synth is instantiated
- Stream large sample files (range requests, not full download)
- Service worker for offline project access

---

## 17. Accessibility

- Full keyboard navigation (Tab, Shift+Tab, Enter, Escape, Arrow keys)
- ARIA labels on all interactive controls
- Screen reader announcements for transport state changes
- High contrast mode and colorblind-safe themes
- Reduced motion mode (disables animations)
- Adjustable text size independent of UI scale
- Focus indicators on all interactive elements
- Alt text for all visual feedback (metering described numerically)
- Touch target sizing ≥ 44px for tablet/mobile use

---

## 18. Mobile & Tablet Considerations

- Touch-optimized controls: larger hit targets, long-press for context menus
- Gesture support: pinch-to-zoom, two-finger scroll, swipe between views
- Simplified mobile layout: single-panel view with bottom tab navigation
- On-screen keyboard with velocity via vertical touch position
- Drum pad mode optimized for finger tapping
- Gyroscope/accelerometer mappable to parameters (tilt to filter, shake to randomize)
- Responsive breakpoints: desktop (>1200px), tablet (768–1200px), mobile (<768px)
- PWA support (installable, offline-capable, push notifications)

---

## 19. AI-Powered Features (Stretch Goals)

- **Auto-accompaniment:** Generate chord progressions and basslines from a melody
- **Smart quantize:** AI-detected groove preservation during quantization
- **Auto-mix:** One-click basic mix (level balancing, panning, basic EQ)
- **Auto-master:** AI mastering chain with genre-aware presets
- **Lyric assistant:** AI-generated lyrics based on mood, theme, and structure
- **Sample recommendation:** "More like this" suggestions based on current project context
- **Chord suggestion:** Next-chord prediction based on music theory and style
- **Stem separation:** Upload a full mix → extract vocals, drums, bass, other
- **Voice-to-MIDI:** Hum a melody → convert to MIDI notes
- **Style transfer:** Apply the mixing style of a reference track to current project

---

## 20. Plugin Ecosystem (Future)

### 20.1 Plugin API
- Published SDK for third-party Web Audio plugins
- Standard plugin format (AudioWorklet-based with UI descriptor)
- Plugin sandboxing (run in iframe with message passing)
- Parameter discovery and automation integration
- Preset format standardization

### 20.2 Plugin Store
- Community plugin marketplace
- Free and paid plugins
- Rating, reviews, and download counts
- Developer portal with documentation, testing tools, and analytics
- Revenue split model for paid plugins

---

## 21. Monetization & Plan Tiers

| Feature | Free | Pro | Team |
|---|---|---|---|
| Projects | 3 | Unlimited | Unlimited |
| Cloud Storage | 500 MB | 50 GB | 200 GB |
| Export Formats | MP3 only | WAV/FLAC/MP3/OGG | All + stems |
| Built-in Synths | WaveLab, Pulse | All synths | All synths |
| Effects | Basic set | Full suite | Full suite |
| Collaboration | View only | 2 collaborators | Unlimited |
| AI Features | — | ✓ | ✓ |
| Custom Themes | — | ✓ | ✓ |
| Priority Rendering | — | ✓ | ✓ |
| Plugin Store Access | Free only | Free + Paid | Free + Paid |
| Support | Community | Email | Priority + Chat |
