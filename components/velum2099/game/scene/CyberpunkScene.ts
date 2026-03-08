// @ts-nocheck
/* ═══════════════════════════════════════════
   NEURODRIVE — Cyberpunk Scene
   Grid-based procedural city — drive in
   any direction with infinite generation
   ═══════════════════════════════════════════ */

import { ACESFilmicToneMapping, AdditiveBlending, AmbientLight, BackSide, Box3, BoxGeometry, BufferAttribute, BufferGeometry, CanvasTexture, Clock, Color, ConeGeometry, CylinderGeometry, DirectionalLight, DoubleSide, EdgesGeometry, ExtrudeGeometry, FogExp2, Frustum, Group, HemisphereLight, InstancedBufferAttribute, InstancedMesh, Line, LineBasicMaterial, LineSegments, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, PerspectiveCamera, PlaneGeometry, PointLight, Points, QuadraticBezierCurve3, RepeatWrapping, Scene, ShaderMaterial, Shape, SphereGeometry, Vector2, Vector3, WebGLRenderer } from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { ProceduralTextures } from '../textures/ProceduralTextures';

/* ── Retro shader ── */
const RetroShader = {
    uniforms: {
        tDiffuse: { value: null },
        time: { value: 0 },
        scanlineIntensity: { value: 0.06 },
        chromaticAberration: { value: 0.002 },
    },
    vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
    fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform float scanlineIntensity;
    uniform float chromaticAberration;
    varying vec2 vUv;

    // Pseudo-random hash
    float hash(float n) { return fract(sin(n) * 43758.5453); }

    void main() {
      vec2 uv = vUv;

      // ── VHS horizontal jitter ──
      // Occasional scanline-thin horizontal shift
      float jitterLine = floor(uv.y * 300.0 + time * 40.0);
      float jitterAmount = (hash(jitterLine + floor(time * 7.0)) - 0.5) * 0.0006;
      // Stronger glitch burst ~1% of the time
      float burst = step(0.99, hash(floor(time * 4.0)));
      jitterAmount += burst * (hash(jitterLine * 0.1 + time) - 0.5) * 0.003;
      uv.x += jitterAmount;

      // ── VHS tracking wobble ──
      // Slow sine-wave vertical warp
      float wobble = sin(uv.y * 3.0 + time * 1.5) * 0.00015;
      uv.x += wobble;

      // ── Chromatic aberration (shifted UV) ──
      float ca = chromaticAberration;
      float r = texture2D(tDiffuse, uv + vec2(ca, 0.0)).r;
      float g = texture2D(tDiffuse, uv).g;
      float b = texture2D(tDiffuse, uv - vec2(ca, 0.0)).b;
      vec3 color = vec3(r, g, b);

      // ── VHS brightness flicker ──
      float flicker = 1.0 + (hash(floor(time * 12.0)) - 0.5) * 0.008;
      color *= flicker;

      // ── Scanlines ──
      float scanline = sin(uv.y * 800.0 + time * 2.0) * scanlineIntensity;
      color -= scanline;

      // ── VHS tape noise band ──
      // Thin noisy band that drifts up the screen
      float bandY = fract(time * 0.08);
      float bandDist = abs(uv.y - bandY);
      float band = smoothstep(0.02, 0.0, bandDist);
      color += band * (hash(uv.x * 100.0 + time * 50.0) - 0.5) * 0.03;

      // ── Vignette ──
      float vignette = smoothstep(0.9, 0.4, length(uv - 0.5));
      color *= vignette * 0.1 + 0.9;

      gl_FragColor = vec4(color, 1.0);
    }
  `,
};

/* ── Live blend shader (Layer 2) ── */
const LiveBlendShader = {
    uniforms: {
        tDiffuse: { value: null },
        tLiveStream: { value: null },
        blendFactor: { value: 0.0 },
    },
    vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
    fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform sampler2D tLiveStream;
    uniform float blendFactor;
    varying vec2 vUv;
    void main() {
      vec4 original = texture2D(tDiffuse, vUv);
      vec4 stylized = texture2D(tLiveStream, vUv);
      gl_FragColor = mix(original, stylized, blendFactor);
    }
  `,
};

/* ── Cyberpunk palettes ── */
const PALETTES = [
    {   // Classic Cyber — pink/cyan
        neons: [0xff0080, 0x00ffff, 0xaa00ff, 0xffff00, 0x00ff66, 0xff6600, 0x0066ff],
        fog: 0x1a1a3a, rain: 0x8888cc,
        vehicleLight: 0x00ffff, fillLight: 0xff6633,
        skyLo: [0.08, 0.03, 0.14], skyHi: [0.02, 0.02, 0.08], skyGlow: [0.6, 0.1, 0.35],
    },
    {   // Toxic Neon — green/yellow/lime
        neons: [0x39ff14, 0xccff00, 0x00ff66, 0xffff00, 0x88ff00, 0x00ffaa, 0x66ff33],
        fog: 0x0a1a0a, rain: 0x66cc88,
        vehicleLight: 0x39ff14, fillLight: 0xccff00,
        skyLo: [0.02, 0.08, 0.02], skyHi: [0.01, 0.04, 0.01], skyGlow: [0.1, 0.5, 0.05],
    },
    {   // Bloodline — red/orange/crimson
        neons: [0xff0033, 0xff4400, 0xff0066, 0xff6600, 0xcc0022, 0xff2200, 0xff8800],
        fog: 0x1a0a0a, rain: 0xcc6666,
        vehicleLight: 0xff4400, fillLight: 0xff0033,
        skyLo: [0.12, 0.02, 0.02], skyHi: [0.06, 0.01, 0.01], skyGlow: [0.7, 0.1, 0.05],
    },
    {   // Ice — blue/white/silver
        neons: [0x00aaff, 0x88ddff, 0x0066ff, 0xaaeeff, 0x4488ff, 0x00ccff, 0xffffff],
        fog: 0x0a1a2a, rain: 0xaaccff,
        vehicleLight: 0x88ddff, fillLight: 0x0066ff,
        skyLo: [0.03, 0.06, 0.14], skyHi: [0.01, 0.03, 0.08], skyGlow: [0.1, 0.2, 0.6],
    },
    {   // Synthwave — magenta/purple/hot pink
        neons: [0xff00ff, 0xcc00ff, 0xff0099, 0xff44cc, 0xaa00ff, 0xff66ff, 0xdd00aa],
        fog: 0x1a0a2a, rain: 0xbb88dd,
        vehicleLight: 0xff00ff, fillLight: 0xcc00ff,
        skyLo: [0.10, 0.02, 0.14], skyHi: [0.04, 0.01, 0.08], skyGlow: [0.5, 0.05, 0.6],
    },
    {   // Gold Rush — gold/amber/warm white
        neons: [0xffaa00, 0xffcc33, 0xff8800, 0xffdd44, 0xffee66, 0xeeaa00, 0xffbb11],
        fog: 0x1a1508, rain: 0xccbb88,
        vehicleLight: 0xffcc33, fillLight: 0xff8800,
        skyLo: [0.10, 0.07, 0.02], skyHi: [0.05, 0.03, 0.01], skyGlow: [0.6, 0.4, 0.05],
    },
    {   // Light Cyber — pastel neon on pale sky
        neons: [0xff66aa, 0x66ddff, 0xbb77ff, 0x77ffcc, 0xffaa66, 0xff77dd, 0x66aaff],
        fog: 0xc8c0d8, rain: 0xaabbdd,
        vehicleLight: 0x66ddff, fillLight: 0xff66aa,
        skyLo: [0.65, 0.58, 0.72], skyHi: [0.50, 0.55, 0.70], skyGlow: [0.75, 0.45, 0.60],
    },
    {   // Bebop — dusty orange/amber/teal (Cowboy Bebop inspired)
        neons: [0xff8844, 0xcc6633, 0xffcc44, 0x448888, 0xff6622, 0xddaa33, 0x55aaaa],
        fog: 0x2a1800, rain: 0xcc9966,
        vehicleLight: 0xffcc44, fillLight: 0xff8844,
        skyLo: [0.16, 0.08, 0.03], skyHi: [0.08, 0.04, 0.02], skyGlow: [0.7, 0.35, 0.08],
    },
];

// Palette tone classification: dark vs light
const PALETTE_TONE = ['dark', 'dark', 'dark', 'light', 'dark', 'light', 'light', 'dark'];
const DARK_PALETTES  = PALETTE_TONE.map((t, i) => t === 'dark'  ? i : -1).filter(i => i >= 0);
const LIGHT_PALETTES = PALETTE_TONE.map((t, i) => t === 'light' ? i : -1).filter(i => i >= 0);
const ALL_PALETTES   = PALETTES.map((_, i) => i);

let _activePalette = PALETTES[0];
function randomNeon() { return _activePalette.neons[Math.floor(Math.random() * _activePalette.neons.length)]; }

/* ── Grid constants ── */
const CHUNK_SIZE = 60;          // world units per chunk
const ROAD_WIDTH = 28;          // width of a road
const VIEW_RADIUS = 5;          // generate chunks in a 5-chunk radius
const CLEANUP_RADIUS = 7;       // remove chunks beyond this radius

/* ── Seeded random for deterministic chunks ── */
function hashChunk(cx, cz) {
    let h = cx * 374761393 + cz * 668265263;
    h = (h ^ (h >> 13)) * 1274126177;
    h = h ^ (h >> 16);
    return h;
}
function seededRandom(cx, cz, idx) {
    const h = hashChunk(cx * 31 + idx, cz * 17 + idx);
    return (h & 0x7fffffff) / 0x7fffffff;
}

/* ── Chunk types ── */
const CHUNK_STRAIGHT_NS = 0;  // North-South road
const CHUNK_STRAIGHT_EW = 1;  // East-West road
const CHUNK_CROSS = 2;        // Intersection
const CHUNK_T_NORTH = 3;      // T from south, splits east-west
const CHUNK_EMPTY = 4;        // Building-only block (no road)
const CHUNK_HIGHWAY_NS = 5;   // Elevated highway (N-S)
const CHUNK_HIGHWAY_EW = 6;   // Elevated highway (E-W)
const CHUNK_RAMP_UP_NS = 7;   // Ramp going up (N-S)
const CHUNK_RAMP_DOWN_NS = 8; // Ramp going down (N-S)
const CHUNK_RAMP_UP_EW = 9;   // Ramp going up (E-W)
const CHUNK_RAMP_DOWN_EW = 10; // Ramp going down (E-W)

const HIGHWAY_HEIGHT = 8;     // Elevation of highways
const HIGHWAY_WIDTH = 16;     // Slightly narrower than normal roads

export class CyberpunkScene {
    constructor(canvas, textureManager) {
        this.canvas = canvas;
        this.textureManager = textureManager || null;
        this.proceduralTextures = new ProceduralTextures();
        this.liveStreamClient = null; // Set externally for Layer 2
        this.clock = new Clock();
        this.chunks = new Map();  // key "cx,cz" -> { group, meshes[], signs[], collidables[] }
        this.signs = [];
        this.trafficVehicles = [];  // oncoming traffic objects
        this.rainDrops = null;
        this._paletteIndex = 0;
        this._paletteTimer = 0;
        this._palettePool = ALL_PALETTES; // indices to cycle through
        this._paletteLocked = false;
        this.camDist = 10;
        this.camHeight = 5;

        // Shared dash geometry/material for InstancedMesh road lines
        this._dashGeoNS = new PlaneGeometry(0.15, 2);
        this._dashGeoEW = new PlaneGeometry(2, 0.15);
        this._dashMat = new MeshBasicMaterial({ color: 0xffff00 });

        // Item 1: Shared window geometry
        this._winGeo = new PlaneGeometry(0.6, 0.8);
        this._winMat = new MeshBasicMaterial({ vertexColors: false });

        // Item 2: Texture clone cache
        this._texCache = new Map();

        // Item 3: Shared crosswalk stripe geometries/material
        this._stripeGeoNS = new PlaneGeometry(0.8, 3);
        this._stripeGeoEW = new PlaneGeometry(3, 0.8);
        this._stripeMat = new MeshBasicMaterial({ color: 0xffffff });

        // Item 6: Pre-allocated vectors for update()
        this._camTarget = new Vector3();
        this._camOffset = new Vector3();
        this._lookTarget = new Vector3();

        // Item 6: Pre-allocated for getCollidables()
        this._trafficBox = new Box3();
        this._trafficSize = new Vector3(1.8, 0.7, 3.5);

        // Item 9: Geometry cache for buildings
        this._geoCache = new Map();

        // Building edge outlines (toggled via settings)
        this._buildingEdgesEnabled = false;
        this._allEdgeMeshes = [];

        // Item 10: Frustum culling
        this._frustum = new Frustum();
        this._projScreenMatrix = new Matrix4();
        this._chunkBox = new Box3();

        this._initRenderer();
        this._initScene();
        this._initCamera();
        this._initLights();
        this._initFog();
        this._buildRain();
        this._buildSkybox();
        this._initPostProcessing();

        // Generate initial chunks around origin
        this._updateChunks(0, 0);
    }

    _initRenderer() {
        this.renderer = new WebGLRenderer({
            canvas: this.canvas, antialias: false, powerPreference: 'high-performance',
            logarithmicDepthBuffer: true,
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.toneMapping = ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 2.8;
        this.renderer.shadowMap.enabled = false;
        window.addEventListener('resize', () => this._onResize());
    }

    _initScene() { this.scene = new Scene(); }

    _initCamera() {
        this.camera = new PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1200);
        this.camera.position.set(0, 5, 12);
    }

    _initLights() {
        this.scene.add(new AmbientLight(0x667799, 3.0));

        const dir = new DirectionalLight(0xaabbdd, 2.0);
        dir.position.set(10, 50, -20);
        this.scene.add(dir);

        this.scene.add(new HemisphereLight(0x8866cc, 0x445566, 2.0));

        // Vehicle-following lights
        this._vehicleLight = new PointLight(0x00ffff, 6, 80, 1.5);
        this.scene.add(this._vehicleLight);
        this._fillLight = new PointLight(0xff6633, 4, 100, 2);
        this.scene.add(this._fillLight);
    }

    _initFog() { this.scene.fog = new FogExp2(0x1a1a3a, 0.003); }

    /* ═══════════════════════════════════════
       CHUNK GENERATION — Grid-based
       ═══════════════════════════════════════ */

    _updateChunks(vx, vz) {
        const ccx = Math.round(vx / CHUNK_SIZE);
        const ccz = Math.round(vz / CHUNK_SIZE);

        // Generate missing chunks within radius
        for (let dx = -VIEW_RADIUS; dx <= VIEW_RADIUS; dx++) {
            for (let dz = -VIEW_RADIUS; dz <= VIEW_RADIUS; dz++) {
                if (dx * dx + dz * dz > VIEW_RADIUS * VIEW_RADIUS) continue;
                const cx = ccx + dx;
                const cz = ccz + dz;
                const key = `${cx},${cz}`;
                if (!this.chunks.has(key)) {
                    this._spawnChunk(cx, cz);
                }
            }
        }

        // Remove far chunks
        for (const [key, chunk] of this.chunks) {
            const [cx, cz] = key.split(',').map(Number);
            const dx = cx - ccx;
            const dz = cz - ccz;
            if (dx * dx + dz * dz > CLEANUP_RADIUS * CLEANUP_RADIUS) {
                this._removeChunk(key, chunk);
            }
        }
    }

    /** Walk outward from 0 with variable strides to decide if coord is a road line */
    _isRoadLine(coord, seed) {
        if (coord === 0) return true;
        let pos = 0;
        if (coord > 0) {
            while (pos < coord) {
                const stride = 2 + (((hashChunk(pos, seed) >>> 0) & 3));  // 2–5
                pos += stride;
                if (pos === coord) return true;
            }
        } else {
            while (pos > coord) {
                const stride = 2 + (((hashChunk(pos, seed) >>> 0) & 3));  // 2–5
                pos -= stride;
                if (pos === coord) return true;
            }
        }
        return false;
    }

    _isNSRoadLine(cx) { return this._isRoadLine(cx, 7777); }
    _isEWRoadLine(cz) { return this._isRoadLine(cz, 9999); }

    /** Highway lines — much rarer, fixed stride of 10-14 chunks */
    _isHighwayLine(coord, seed) {
        if (coord === 0) return false; // no highway at origin
        let pos = 0;
        if (coord > 0) {
            while (pos < coord) {
                const stride = 10 + (((hashChunk(pos, seed) >>> 0) & 3)); // 10-13
                pos += stride;
                if (pos === coord) return true;
            }
        } else {
            while (pos > coord) {
                const stride = 10 + (((hashChunk(pos, seed) >>> 0) & 3));
                pos -= stride;
                if (pos === coord) return true;
            }
        }
        return false;
    }
    _isNSHighwayLine(cx) { return this._isHighwayLine(cx, 11111); }
    _isEWHighwayLine(cz) { return this._isHighwayLine(cz, 22222); }

    /** Check if a neighbor chunk in a given direction is a highway */
    _isHighwayChunk(cx, cz, dir) {
        const onHwyNS = this._isNSHighwayLine(cx) && !this._isEWRoadLine(cz);
        const onHwyEW = this._isEWHighwayLine(cz) && !this._isNSRoadLine(cx);
        if (dir === 'ns') return onHwyNS;
        if (dir === 'ew') return onHwyEW;
        return onHwyNS || onHwyEW;
    }

    _getChunkType(cx, cz) {
        const r = seededRandom(cx, cz, 0);

        const onNSRoad = this._isNSRoadLine(cx);
        const onEWRoad = this._isEWRoadLine(cz);
        const onNSHwy = this._isNSHighwayLine(cx);
        const onEWHwy = this._isEWHighwayLine(cz);

        // Highway takes priority on its dedicated line (but not at road intersections)
        if (onNSHwy && !onEWRoad && !onEWHwy) {
            // Check if neighbors along Z are also highway — if not, this is a ramp
            const prevIsHwy = this._isNSHighwayLine(cx) && !this._isEWRoadLine(cz - 1);
            const nextIsHwy = this._isNSHighwayLine(cx) && !this._isEWRoadLine(cz + 1);
            if (!prevIsHwy && nextIsHwy) return CHUNK_RAMP_UP_NS;
            if (prevIsHwy && !nextIsHwy) return CHUNK_RAMP_DOWN_NS;
            return CHUNK_HIGHWAY_NS;
        }
        if (onEWHwy && !onNSRoad && !onNSHwy) {
            const prevIsHwy = this._isEWHighwayLine(cz) && !this._isNSRoadLine(cx - 1);
            const nextIsHwy = this._isEWHighwayLine(cz) && !this._isNSRoadLine(cx + 1);
            if (!prevIsHwy && nextIsHwy) return CHUNK_RAMP_UP_EW;
            if (prevIsHwy && !nextIsHwy) return CHUNK_RAMP_DOWN_EW;
            return CHUNK_HIGHWAY_EW;
        }

        if (onNSRoad && onEWRoad) return CHUNK_CROSS;
        if (onNSRoad) return CHUNK_STRAIGHT_NS;
        if (onEWRoad) return CHUNK_STRAIGHT_EW;

        // Off-grid: small chance of surprise road, otherwise buildings
        if (r < 0.12) return CHUNK_CROSS;
        if (r < 0.2) return CHUNK_STRAIGHT_NS;
        if (r < 0.28) return CHUNK_STRAIGHT_EW;
        return CHUNK_EMPTY;
    }

    _spawnChunk(cx, cz) {
        const key = `${cx},${cz}`;
        const group = new Group();
        const meshes = [];
        const chunkSigns = [];
        const collidables = [];
        this._chunkRBs = [];
        this._chunkEdgeMeshes = [];
        const worldX = cx * CHUNK_SIZE;
        const worldZ = cz * CHUNK_SIZE;
        const type = this._getChunkType(cx, cz);

        // Ground plane for every chunk
        const groundGeo = new PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE);
        const groundMat = this._createGroundMaterial(cx, cz);
        const ground = new Mesh(groundGeo, groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.position.set(worldX, -0.01, worldZ);
        group.add(ground);

        if (type === CHUNK_STRAIGHT_NS) {
            this._buildRoadNS(group, meshes, worldX, worldZ, cx, cz, collidables);
            this._buildSideBuildings(group, meshes, chunkSigns, worldX, worldZ, 'ns', cx, cz, collidables);
            this._buildObstacles(group, meshes, worldX, worldZ, 'ns', cx, cz, collidables);
        } else if (type === CHUNK_STRAIGHT_EW) {
            this._buildRoadEW(group, meshes, worldX, worldZ, cx, cz, collidables);
            this._buildSideBuildings(group, meshes, chunkSigns, worldX, worldZ, 'ew', cx, cz, collidables);
            this._buildObstacles(group, meshes, worldX, worldZ, 'ew', cx, cz, collidables);
        } else if (type === CHUNK_CROSS) {
            this._buildIntersection(group, worldX, worldZ, cx, cz);
            this._buildCornerBuildings(group, meshes, chunkSigns, worldX, worldZ, cx, cz, collidables);
            this._buildTrafficLights(group, meshes, worldX, worldZ, cx, cz, collidables);
        } else if (type === CHUNK_HIGHWAY_NS) {
            this._buildHighway(group, meshes, worldX, worldZ, cx, cz, collidables, 'ns', 0);
        } else if (type === CHUNK_HIGHWAY_EW) {
            this._buildHighway(group, meshes, worldX, worldZ, cx, cz, collidables, 'ew', 0);
        } else if (type === CHUNK_RAMP_UP_NS) {
            this._buildRamp(group, meshes, worldX, worldZ, cx, cz, collidables, 'ns', 1);
        } else if (type === CHUNK_RAMP_DOWN_NS) {
            this._buildRamp(group, meshes, worldX, worldZ, cx, cz, collidables, 'ns', -1);
        } else if (type === CHUNK_RAMP_UP_EW) {
            this._buildRamp(group, meshes, worldX, worldZ, cx, cz, collidables, 'ew', 1);
        } else if (type === CHUNK_RAMP_DOWN_EW) {
            this._buildRamp(group, meshes, worldX, worldZ, cx, cz, collidables, 'ew', -1);
        } else {
            // Empty — fill with buildings
            this._buildBlockBuildings(group, meshes, chunkSigns, worldX, worldZ, cx, cz, collidables);
        }

        this.scene.add(group);
        const rooftopBillboards = this._chunkRBs || [];
        this._chunkRBs = null;
        const edgeMeshes = this._chunkEdgeMeshes || [];
        this._chunkEdgeMeshes = null;
        for (const m of edgeMeshes) this._allEdgeMeshes.push(m);
        this.chunks.set(key, { group, meshes, signs: chunkSigns, collidables, type, cx, cz, rooftopBillboards, edgeMeshes });
    }

    _removeChunk(key, chunk) {
        this.scene.remove(chunk.group);
        chunk.group.traverse(c => {
            if (c.geometry) c.geometry.dispose();
            if (c.material) {
                if (Array.isArray(c.material)) c.material.forEach(m => m.dispose());
                else c.material.dispose();
            }
        });
        for (const m of chunk.meshes) {
            this.scene.remove(m);
            if (m.geometry) m.geometry.dispose();
            if (m.material) m.material.dispose();
        }
        // Remove edge meshes from global tracker
        if (chunk.edgeMeshes && chunk.edgeMeshes.length) {
            const edgeSet = new Set(chunk.edgeMeshes);
            this._allEdgeMeshes = this._allEdgeMeshes.filter(m => !edgeSet.has(m));
        }
        // Remove signs
        this.signs = this.signs.filter(s => !chunk.signs.includes(s));
        // Dispose rooftop billboard textures
        if (chunk.rooftopBillboards) {
            for (const rb of chunk.rooftopBillboards) {
                if (rb.texture) rb.texture.dispose();
            }
        }
        // Clean spark references
        if (this._sparkMeshes) {
            const meshSet = new Set(chunk.meshes);
            this._sparkMeshes = this._sparkMeshes.filter(s => !meshSet.has(s));
        }
        // Remove traffic vehicles from this chunk
        this.trafficVehicles = this.trafficVehicles.filter(tv => {
            if (tv._chunkKey === key) {
                this.scene.remove(tv.mesh);
                return false;
            }
            return true;
        });
        this.chunks.delete(key);
    }

    /* ── Road builders ── */

    _buildRoadNS(group, meshes, wx, wz, cx, cz, collidables) {
        const roadGeo = new PlaneGeometry(ROAD_WIDTH, CHUNK_SIZE);
        const roadMat = this._createRoadMaterial(cx, cz);
        const road = new Mesh(roadGeo, roadMat);
        road.rotation.x = -Math.PI / 2;
        road.position.set(wx, 0.005, wz);
        group.add(road);

        // Center line (instanced)
        const dashCountNS = Math.floor(CHUNK_SIZE / 4);
        const dashesNS = new InstancedMesh(this._dashGeoNS, this._dashMat, dashCountNS);
        const _mat4 = new Matrix4();
        const _rotX = new Matrix4().makeRotationX(-Math.PI / 2);
        for (let i = 0; i < dashCountNS; i++) {
            const d = -CHUNK_SIZE / 2 + i * 4;
            _mat4.makeTranslation(wx, 0.02, wz + d).multiply(_rotX);
            dashesNS.setMatrixAt(i, _mat4);
        }
        dashesNS.instanceMatrix.needsUpdate = true;
        group.add(dashesNS);

        // Edge neon strips
        for (const s of [-1, 1]) {
            const eGeo = new BoxGeometry(0.12, 0.08, CHUNK_SIZE);
            const eMat = new MeshBasicMaterial({ color: s === -1 ? _activePalette.neons[1] : _activePalette.neons[0] });
            eMat._isNeon = true;
            const edge = new Mesh(eGeo, eMat);
            edge.position.set(wx + s * (ROAD_WIDTH / 2 + 0.1), 0.04, wz);
            group.add(edge);
        }

        // Street lamps + power lines
        const lampPosNS = this._addStreetLamps(group, meshes, wx, wz, 'ns', cx, cz, collidables);
        this._addPowerLines(group, lampPosNS, 'ns');
    }

    _buildRoadEW(group, meshes, wx, wz, cx, cz, collidables) {
        const roadGeo = new PlaneGeometry(CHUNK_SIZE, ROAD_WIDTH);
        const roadMat = this._createRoadMaterial(cx, cz);
        const road = new Mesh(roadGeo, roadMat);
        road.rotation.x = -Math.PI / 2;
        road.position.set(wx, 0.005, wz);
        group.add(road);

        // Center line (instanced)
        const dashCountEW = Math.floor(CHUNK_SIZE / 4);
        const dashesEW = new InstancedMesh(this._dashGeoEW, this._dashMat, dashCountEW);
        const _mat4EW = new Matrix4();
        const _rotXEW = new Matrix4().makeRotationX(-Math.PI / 2);
        for (let i = 0; i < dashCountEW; i++) {
            const d = -CHUNK_SIZE / 2 + i * 4;
            _mat4EW.makeTranslation(wx + d, 0.02, wz).multiply(_rotXEW);
            dashesEW.setMatrixAt(i, _mat4EW);
        }
        dashesEW.instanceMatrix.needsUpdate = true;
        group.add(dashesEW);

        for (const s of [-1, 1]) {
            const eGeo = new BoxGeometry(CHUNK_SIZE, 0.08, 0.12);
            const eMat = new MeshBasicMaterial({ color: s === -1 ? _activePalette.neons[1] : _activePalette.neons[0] });
            eMat._isNeon = true;
            const edge = new Mesh(eGeo, eMat);
            edge.position.set(wx, 0.04, wz + s * (ROAD_WIDTH / 2 + 0.1));
            group.add(edge);
        }

        // Street lamps + power lines
        const lampPosEW = this._addStreetLamps(group, meshes, wx, wz, 'ew', cx, cz, collidables);
        this._addPowerLines(group, lampPosEW, 'ew');
    }

    _buildIntersection(group, wx, wz, cx, cz) {
        // Large square road surface
        const size = ROAD_WIDTH + 8;
        const geo = new PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE);
        const mat = this._createRoadMaterial(cx, cz);
        const road = new Mesh(geo, mat);
        road.rotation.x = -Math.PI / 2;
        road.position.set(wx, 0.005, wz);
        group.add(road);

        // Crosswalk stripes — InstancedMesh (NS and EW)
        const offset = ROAD_WIDTH / 2 + 2;
        const _mat4 = new Matrix4();
        const _rotX = new Matrix4().makeRotationX(-Math.PI / 2);

        // NS stripes (n + s directions): 7 stripes × 2 = 14
        const nsStripes = new InstancedMesh(this._stripeGeoNS, this._stripeMat, 14);
        let nsIdx = 0;
        for (const dir of ['n', 's']) {
            const zOff = dir === 'n' ? -offset : offset;
            for (let i = -3; i <= 3; i++) {
                _mat4.identity();
                _mat4.setPosition(wx + i * 1.5, 0.02, wz + zOff);
                _mat4.multiply(_rotX);
                // Compose: translate then rotate
                _mat4.makeTranslation(wx + i * 1.5, 0.02, wz + zOff).multiply(_rotX);
                nsStripes.setMatrixAt(nsIdx++, _mat4);
            }
        }
        nsStripes.instanceMatrix.needsUpdate = true;
        group.add(nsStripes);

        // EW stripes (e + w directions): 7 stripes × 2 = 14
        const ewStripes = new InstancedMesh(this._stripeGeoEW, this._stripeMat, 14);
        let ewIdx = 0;
        for (const dir of ['e', 'w']) {
            const xOff = dir === 'e' ? offset : -offset;
            for (let i = -3; i <= 3; i++) {
                _mat4.makeTranslation(wx + xOff, 0.02, wz + i * 1.5).multiply(_rotX);
                ewStripes.setMatrixAt(ewIdx++, _mat4);
            }
        }
        ewStripes.instanceMatrix.needsUpdate = true;
        group.add(ewStripes);
    }

    _addStreetLamps(group, meshes, wx, wz, dir, cx, cz, collidables) {
        const poleMat = new MeshStandardMaterial({ color: 0x555555, metalness: 0.7, roughness: 0.3, emissive: 0x222222, emissiveIntensity: 0.6 });
        const positions = dir === 'ns'
            ? [{ x: wx - ROAD_WIDTH / 2 - 1, z: wz - 15 }, { x: wx + ROAD_WIDTH / 2 + 1, z: wz + 15 }]
            : [{ x: wx - 15, z: wz - ROAD_WIDTH / 2 - 1 }, { x: wx + 15, z: wz + ROAD_WIDTH / 2 + 1 }];

        positions.forEach((p, i) => {
            const pole = new Mesh(new CylinderGeometry(0.06, 0.06, 7, 6), poleMat);
            pole.position.set(p.x, 3.5, p.z);
            group.add(pole);

            const poleBox = new Box3().setFromCenterAndSize(
                new Vector3(p.x, 3.5, p.z),
                new Vector3(0.2, 7, 0.2)
            );
            collidables.push({ box: poleBox, mesh: pole, type: 'pole' });

            const color = i === 0 ? _activePalette.neons[1] : _activePalette.neons[0];
            const lampMat = new MeshBasicMaterial({ color });
            lampMat._isNeon = true;
            const lamp = new Mesh(new SphereGeometry(0.25, 8, 8), lampMat);
            lamp.position.set(p.x, 7.1, p.z);
            group.add(lamp);

            // Downward light cone — apex at lamp, spreads ~2 units wide over 4 units down
            const coneGeo = new ConeGeometry(1.8, 4.0, 12, 1, true);
            const coneMat = new MeshBasicMaterial({
                color, transparent: true, opacity: 0.07,
                side: BackSide, depthWrite: false,
            });
            const cone = new Mesh(coneGeo, coneMat);
            cone.position.set(p.x, 7.1 - 2.0, p.z); // center of height so apex sits at lamp
            group.add(cone);

            // Spark particles (15% chance per pole)
            if (seededRandom(cx, cz, 900 + i) < 0.15) {
                this._addSpark(group, meshes, p.x, 7.1, p.z);
            }
        });

        return positions;
    }

    _addPowerLines(group, positions, dir) {
        if (positions.length < 2) return;

        const p1 = positions[0];
        const p2 = positions[1];

        // Cross-road cables (between the two poles)
        for (let cable = 0; cable < 3; cable++) {
            const yOff = cable * 0.4;
            const start = new Vector3(p1.x, 7.0 - yOff, p1.z);
            const end = new Vector3(p2.x, 7.0 - yOff, p2.z);
            const mid = new Vector3().lerpVectors(start, end, 0.5);
            mid.y -= 1.5 + cable * 0.3;

            const curve = new QuadraticBezierCurve3(start, mid, end);
            const points = curve.getPoints(12);
            const geo = new BufferGeometry().setFromPoints(points);
            const mat = new LineBasicMaterial({
                color: 0x333344, transparent: true, opacity: 0.7,
            });
            group.add(new Line(geo, mat));
        }

        // Longitudinal cables (along road from each pole toward chunk edges)
        for (const p of positions) {
            for (const d of [-1, 1]) {
                const edgePos = dir === 'ns'
                    ? { x: p.x, z: p.z + d * (CHUNK_SIZE / 2) }
                    : { x: p.x + d * (CHUNK_SIZE / 2), z: p.z };

                const start = new Vector3(p.x, 7.0, p.z);
                const end = new Vector3(edgePos.x, 6.8, edgePos.z);
                const mid = new Vector3(
                    (p.x + edgePos.x) / 2,
                    5.8,
                    (p.z + edgePos.z) / 2
                );

                const curve = new QuadraticBezierCurve3(start, mid, end);
                const points = curve.getPoints(8);
                const geo = new BufferGeometry().setFromPoints(points);
                const mat = new LineBasicMaterial({
                    color: 0x333344, transparent: true, opacity: 0.6,
                });
                group.add(new Line(geo, mat));
            }
        }
    }

    _addSpark(group, meshes, x, y, z) {
        const count = 6;
        const pos = new Float32Array(count * 3);
        const phases = new Float32Array(count);
        for (let i = 0; i < count; i++) {
            pos[i * 3] = x + (Math.random() - 0.5) * 0.3;
            pos[i * 3 + 1] = y + Math.random() * 0.2;
            pos[i * 3 + 2] = z + (Math.random() - 0.5) * 0.3;
            phases[i] = Math.random() * Math.PI * 2;
        }
        const geo = new BufferGeometry();
        geo.setAttribute('position', new BufferAttribute(pos, 3));
        geo.setAttribute('phase', new BufferAttribute(phases, 1));

        const mat = new ShaderMaterial({
            uniforms: { time: { value: 0 } },
            vertexShader: `
                attribute float phase;
                varying float vPhase;
                void main() {
                    vPhase = phase;
                    gl_PointSize = 3.0;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform float time;
                varying float vPhase;
                void main() {
                    float flicker = step(0.85, fract(sin(time * 7.0 + vPhase * 100.0) * 43758.5));
                    if (flicker < 0.5) discard;
                    gl_FragColor = vec4(1.0, 0.8, 0.2, 0.9);
                }
            `,
            transparent: true,
            depthWrite: false,
            blending: AdditiveBlending,
        });

        const points = new Points(geo, mat);
        group.add(points);
        meshes.push(points);

        if (!this._sparkMeshes) this._sparkMeshes = [];
        this._sparkMeshes.push(points);
    }

    /* ── Elevated Highway builders ── */

    _buildHighway(group, meshes, wx, wz, cx, cz, collidables, dir, _unused) {
        const H = HIGHWAY_HEIGHT;
        const W = HIGHWAY_WIDTH;

        // Elevated road deck
        const deckGeo = new PlaneGeometry(
            dir === 'ns' ? W : CHUNK_SIZE,
            dir === 'ns' ? CHUNK_SIZE : W
        );
        const deckMat = this._createRoadMaterial(cx, cz);
        const deck = new Mesh(deckGeo, deckMat);
        deck.rotation.x = -Math.PI / 2;
        deck.position.set(wx, H + 0.005, wz);
        group.add(deck);

        // Underside (dark slab for visual depth)
        const slabGeo = new BoxGeometry(
            dir === 'ns' ? W + 0.5 : CHUNK_SIZE,
            0.4,
            dir === 'ns' ? CHUNK_SIZE : W + 0.5
        );
        const slabMat = new MeshStandardMaterial({ color: 0x333340, roughness: 0.9, metalness: 0.1 });
        const slab = new Mesh(slabGeo, slabMat);
        slab.position.set(wx, H - 0.2, wz);
        group.add(slab);

        // Center dashes
        const dashCount = Math.floor(CHUNK_SIZE / 4);
        const dashGeo = dir === 'ns' ? this._dashGeoNS : this._dashGeoEW;
        const dashes = new InstancedMesh(dashGeo, this._dashMat, dashCount);
        const _m = new Matrix4();
        const _rx = new Matrix4().makeRotationX(-Math.PI / 2);
        for (let i = 0; i < dashCount; i++) {
            const d = -CHUNK_SIZE / 2 + i * 4;
            if (dir === 'ns') {
                _m.makeTranslation(wx, H + 0.02, wz + d).multiply(_rx);
            } else {
                _m.makeTranslation(wx + d, H + 0.02, wz).multiply(_rx);
            }
            dashes.setMatrixAt(i, _m);
        }
        dashes.instanceMatrix.needsUpdate = true;
        group.add(dashes);

        // Concrete pillars (6 per chunk) with bracket caps
        const pillarMat = new MeshStandardMaterial({ color: 0x555560, roughness: 0.8, metalness: 0.15 });
        const pillarGeo = new CylinderGeometry(0.4, 0.5, H, 8);
        const capGeo = new BoxGeometry(1.5, 0.3, 1.5);
        for (let i = 0; i < 6; i++) {
            const along = -CHUNK_SIZE / 2 + CHUNK_SIZE * (i + 0.5) / 6;
            for (const s of [-1, 1]) {
                const pillar = new Mesh(pillarGeo, pillarMat);
                if (dir === 'ns') {
                    pillar.position.set(wx + s * (W / 2 - 1), H / 2, wz + along);
                } else {
                    pillar.position.set(wx + along, H / 2, wz + s * (W / 2 - 1));
                }
                group.add(pillar);

                // Bracket cap where pillar meets deck
                const cap = new Mesh(capGeo, pillarMat);
                cap.position.copy(pillar.position);
                cap.position.y = H - 0.15;
                group.add(cap);

                const pBox = new Box3().setFromCenterAndSize(
                    pillar.position,
                    new Vector3(1.2, H, 1.2)
                );
                collidables.push({ box: pBox, mesh: pillar, type: 'pole' });
            }
        }

        // Jersey barriers on edges
        const barrierMat = new MeshStandardMaterial({ color: 0x555555, roughness: 0.7, metalness: 0.2 });
        for (const s of [-1, 1]) {
            const bGeo = new BoxGeometry(
                dir === 'ns' ? 0.4 : CHUNK_SIZE,
                0.8,
                dir === 'ns' ? CHUNK_SIZE : 0.4
            );
            const barrier = new Mesh(bGeo, barrierMat);
            if (dir === 'ns') {
                barrier.position.set(wx + s * (W / 2), H + 0.4, wz);
            } else {
                barrier.position.set(wx, H + 0.4, wz + s * (W / 2));
            }
            group.add(barrier);

            const bBox = new Box3().setFromCenterAndSize(
                barrier.position.clone(),
                new Vector3(
                    dir === 'ns' ? 0.4 : CHUNK_SIZE,
                    0.8,
                    dir === 'ns' ? CHUNK_SIZE : 0.4
                )
            );
            collidables.push({ box: bBox, mesh: barrier, type: 'barrier' });

            // Neon edge strip on barrier top
            const nGeo = new BoxGeometry(
                dir === 'ns' ? 0.1 : CHUNK_SIZE,
                0.06,
                dir === 'ns' ? CHUNK_SIZE : 0.1
            );
            const nMat = new MeshBasicMaterial({
                color: s === -1 ? _activePalette.neons[2] : _activePalette.neons[0]
            });
            nMat._isNeon = true;
            const neon = new Mesh(nGeo, nMat);
            neon.position.copy(barrier.position);
            neon.position.y = H + 0.84;
            group.add(neon);
        }

        // Ground road underneath still exists (from ground plane), add a simple ground-level road too
        const groundRoadGeo = new PlaneGeometry(
            dir === 'ns' ? W + 4 : CHUNK_SIZE,
            dir === 'ns' ? CHUNK_SIZE : W + 4
        );
        const groundRoadMat = this._createRoadMaterial(cx, cz);
        const groundRoad = new Mesh(groundRoadGeo, groundRoadMat);
        groundRoad.rotation.x = -Math.PI / 2;
        groundRoad.position.set(wx, 0.003, wz);
        group.add(groundRoad);
    }

    _buildRamp(group, meshes, wx, wz, cx, cz, collidables, dir, rampDir) {
        // rampDir: 1 = ascending (0→HIGHWAY_HEIGHT), -1 = descending (HIGHWAY_HEIGHT→0)
        const H = HIGHWAY_HEIGHT;
        const W = HIGHWAY_WIDTH;
        const segments = 12;

        // Ramp surface — custom geometry with sloped vertices
        const rampGeo = new PlaneGeometry(
            dir === 'ns' ? W : CHUNK_SIZE,
            dir === 'ns' ? CHUNK_SIZE : W,
            dir === 'ns' ? 1 : segments,
            dir === 'ns' ? segments : 1
        );
        const posAttr = rampGeo.attributes.position;
        for (let i = 0; i < posAttr.count; i++) {
            // PlaneGeometry is in XY, we'll rotate to XZ later
            // For NS ramp: Y coordinate maps to Z (along road), varies from -CHUNK_SIZE/2 to +CHUNK_SIZE/2
            // We want to offset the Z (which is Y before rotation) to create height
            let t;
            if (dir === 'ns') {
                const y = posAttr.getY(i); // -CHUNK_SIZE/2 to CHUNK_SIZE/2
                t = (y + CHUNK_SIZE / 2) / CHUNK_SIZE; // 0 to 1
            } else {
                const x = posAttr.getX(i);
                t = (x + CHUNK_SIZE / 2) / CHUNK_SIZE;
            }
            if (rampDir === -1) t = 1 - t;
            // Smooth the ramp with a cubic ease
            const height = t * H;
            posAttr.setZ(i, posAttr.getZ(i) + height);
        }
        posAttr.needsUpdate = true;
        rampGeo.computeVertexNormals();

        const rampMat = this._createRoadMaterial(cx, cz);
        const ramp = new Mesh(rampGeo, rampMat);
        ramp.rotation.x = -Math.PI / 2;
        ramp.position.set(wx, 0.005, wz);
        group.add(ramp);

        // Ramp underside — sloped plane matching ramp surface, offset down by slab thickness
        const undersideGeo = new PlaneGeometry(
            dir === 'ns' ? W + 0.5 : CHUNK_SIZE,
            dir === 'ns' ? CHUNK_SIZE : W + 0.5,
            dir === 'ns' ? 1 : segments,
            dir === 'ns' ? segments : 1
        );
        const uPosAttr = undersideGeo.attributes.position;
        for (let i = 0; i < uPosAttr.count; i++) {
            let t;
            if (dir === 'ns') {
                const y = uPosAttr.getY(i);
                t = (y + CHUNK_SIZE / 2) / CHUNK_SIZE;
            } else {
                const x = uPosAttr.getX(i);
                t = (x + CHUNK_SIZE / 2) / CHUNK_SIZE;
            }
            if (rampDir === -1) t = 1 - t;
            const height = t * H - 0.4; // offset below the road surface
            uPosAttr.setZ(i, uPosAttr.getZ(i) + height);
        }
        uPosAttr.needsUpdate = true;
        undersideGeo.computeVertexNormals();
        // Flip normals so the underside faces downward
        const uNormAttr = undersideGeo.attributes.normal;
        for (let i = 0; i < uNormAttr.count; i++) {
            uNormAttr.setXYZ(i,
                -uNormAttr.getX(i),
                -uNormAttr.getY(i),
                -uNormAttr.getZ(i)
            );
        }
        uNormAttr.needsUpdate = true;
        // Reverse winding order for correct face culling
        const uIdx = undersideGeo.index;
        const uIdxArr = uIdx.array;
        for (let i = 0; i < uIdxArr.length; i += 3) {
            const tmp = uIdxArr[i];
            uIdxArr[i] = uIdxArr[i + 2];
            uIdxArr[i + 2] = tmp;
        }
        uIdx.needsUpdate = true;

        const slabMat = new MeshStandardMaterial({ color: 0x333340, roughness: 0.9, side: DoubleSide });
        const slab = new Mesh(undersideGeo, slabMat);
        slab.rotation.x = -Math.PI / 2;
        slab.position.set(wx, 0.005, wz);
        group.add(slab);

        // Guard walls on both sides — continuous tilted walls following the ramp slope
        const wallMat = new MeshStandardMaterial({ color: 0x555555, roughness: 0.7, metalness: 0.2 });
        const rampAngle = Math.atan2(H, CHUNK_SIZE);
        const wallLen = Math.sqrt(CHUNK_SIZE * CHUNK_SIZE + H * H);
        for (const s of [-1, 1]) {
            const wGeo = new BoxGeometry(
                dir === 'ns' ? 0.3 : wallLen,
                0.8,
                dir === 'ns' ? wallLen : 0.3
            );
            const wall = new Mesh(wGeo, wallMat);
            if (dir === 'ns') {
                wall.position.set(wx + s * (W / 2), H / 2 + 0.4, wz);
            } else {
                wall.position.set(wx, H / 2 + 0.4, wz + s * (W / 2));
            }
            if (dir === 'ns') {
                wall.rotation.x = rampDir * rampAngle;
            } else {
                wall.rotation.z = -rampDir * rampAngle;
            }
            group.add(wall);

            // Collision — 8 boxes along the ramp for accurate detection
            for (let seg = 0; seg < 8; seg++) {
                const t = (seg + 0.5) / 8;
                const segH = (rampDir === 1 ? t : (1 - t)) * H;
                const segAlong = -CHUNK_SIZE / 2 + t * CHUNK_SIZE;
                const wBox = new Box3().setFromCenterAndSize(
                    new Vector3(
                        dir === 'ns' ? wx + s * (W / 2) : wx + segAlong,
                        segH + 0.4,
                        dir === 'ns' ? wz + segAlong : wz + s * (W / 2)
                    ),
                    new Vector3(
                        dir === 'ns' ? 0.5 : CHUNK_SIZE / 8,
                        1.5,
                        dir === 'ns' ? CHUNK_SIZE / 8 : 0.5
                    )
                );
                collidables.push({ box: wBox, mesh: wall, type: 'barrier' });
            }

            // Neon strip along the wall top — tilted to follow ramp
            const nGeo = new BoxGeometry(
                dir === 'ns' ? 0.08 : wallLen,
                0.05,
                dir === 'ns' ? wallLen : 0.08
            );
            const nMat = new MeshBasicMaterial({
                color: s === -1 ? _activePalette.neons[2] : _activePalette.neons[0]
            });
            nMat._isNeon = true;
            const neon = new Mesh(nGeo, nMat);
            if (dir === 'ns') {
                neon.position.set(wx + s * (W / 2), H / 2 + 0.85, wz);
            } else {
                neon.position.set(wx, H / 2 + 0.85, wz + s * (W / 2));
            }
            if (dir === 'ns') {
                neon.rotation.x = rampDir * rampAngle;
            } else {
                neon.rotation.z = -rampDir * rampAngle;
            }
            group.add(neon);
        }

        // Support pillars (fewer than highway — 3 pairs) with bracket caps
        const pillarMat = new MeshStandardMaterial({ color: 0x555560, roughness: 0.8, metalness: 0.15 });
        const rampCapGeo = new BoxGeometry(1.3, 0.25, 1.3);
        for (let i = 0; i < 3; i++) {
            const t = (i + 0.5) / 3;
            const along = -CHUNK_SIZE / 2 + t * CHUNK_SIZE;
            const pillarH = (rampDir === 1 ? t : (1 - t)) * H;
            if (pillarH < 1.5) continue; // skip very short pillars
            const pGeo = new CylinderGeometry(0.35, 0.45, pillarH, 8);
            for (const s of [-1, 1]) {
                const pillar = new Mesh(pGeo, pillarMat);
                if (dir === 'ns') {
                    pillar.position.set(wx + s * (W / 2 - 1), pillarH / 2, wz + along);
                } else {
                    pillar.position.set(wx + along, pillarH / 2, wz + s * (W / 2 - 1));
                }
                group.add(pillar);

                // Bracket cap at top
                const cap = new Mesh(rampCapGeo, pillarMat);
                cap.position.copy(pillar.position);
                cap.position.y = pillarH - 0.125;
                group.add(cap);
            }
        }

        // Ground-level road underneath
        const groundRoadGeo = new PlaneGeometry(
            dir === 'ns' ? W + 4 : CHUNK_SIZE,
            dir === 'ns' ? CHUNK_SIZE : W + 4
        );
        const groundRoadMat = this._createRoadMaterial(cx, cz);
        const groundRoad = new Mesh(groundRoadGeo, groundRoadMat);
        groundRoad.rotation.x = -Math.PI / 2;
        groundRoad.position.set(wx, 0.003, wz);
        group.add(groundRoad);
    }

    /* ── Building generators ── */

    _createBuildingGeo(w, h, d, cx, cz, seed) {
        const r = seededRandom(cx, cz, seed);
        const shape = new Shape();

        let cacheExtra = '';
        if (r < 0.4) {
            // Plain rectangle
            cacheExtra = '0';
            shape.moveTo(-w / 2, -d / 2);
            shape.lineTo(w / 2, -d / 2);
            shape.lineTo(w / 2, d / 2);
            shape.lineTo(-w / 2, d / 2);
            shape.closePath();
        } else if (r < 0.7) {
            // L-shape — corner notch cut out
            const notchW = w * (0.3 + seededRandom(cx, cz, seed + 1) * 0.2);
            const notchD = d * (0.3 + seededRandom(cx, cz, seed + 2) * 0.2);
            cacheExtra = `1_${notchW.toFixed(1)}_${notchD.toFixed(1)}`;
            shape.moveTo(-w / 2, -d / 2);
            shape.lineTo(w / 2, -d / 2);
            shape.lineTo(w / 2, d / 2 - notchD);
            shape.lineTo(w / 2 - notchW, d / 2 - notchD);
            shape.lineTo(w / 2 - notchW, d / 2);
            shape.lineTo(-w / 2, d / 2);
            shape.closePath();
        } else {
            // Notched/stepped — inset on one side
            const insetW = w * (0.2 + seededRandom(cx, cz, seed + 3) * 0.15);
            const insetD = d * (0.25 + seededRandom(cx, cz, seed + 4) * 0.2);
            cacheExtra = `2_${insetW.toFixed(1)}_${insetD.toFixed(1)}`;
            shape.moveTo(-w / 2, -d / 2);
            shape.lineTo(w / 2, -d / 2);
            shape.lineTo(w / 2, -d / 2 + insetD);
            shape.lineTo(w / 2 - insetW, -d / 2 + insetD);
            shape.lineTo(w / 2 - insetW, d / 2);
            shape.lineTo(-w / 2, d / 2);
            shape.closePath();
        }

        const cacheKey = `${w.toFixed(1)}_${h.toFixed(1)}_${d.toFixed(1)}_${cacheExtra}`;
        const cached = this._geoCache.get(cacheKey);
        if (cached) return cached;

        const geo = new ExtrudeGeometry(shape, {
            depth: h,
            bevelEnabled: false,
        });
        // Extrude goes along Z — rotate so it goes along Y (upward)
        geo.rotateX(-Math.PI / 2);
        // Center vertically so geometry spans -h/2 to h/2 (like BoxGeometry)
        geo.translate(0, -h / 2, 0);
        this._geoCache.set(cacheKey, geo);
        return geo;
    }

    /* ── Texture cache helper ── */
    _getCachedClone(tex, repeatX, repeatY, offsetX = 0, offsetY = 0) {
        const id = tex.id !== undefined ? tex.id : tex.uuid;
        const key = `${id}_${repeatX}_${repeatY}_${offsetX}_${offsetY}`;
        let cached = this._texCache.get(key);
        if (cached) return cached;
        cached = tex.clone();
        cached.wrapS = RepeatWrapping;
        cached.wrapT = RepeatWrapping;
        cached.repeat.set(repeatX, repeatY);
        if (offsetX || offsetY) cached.offset.set(offsetX, offsetY);
        cached.needsUpdate = true;
        this._texCache.set(key, cached);
        return cached;
    }

    /* ── Material factories (Layer 1 texture support) ── */

    _createBuildingMaterial(cx, cz, seedOffset, w, h) {
        const seed = seededRandom(cx, cz, 50 + seedOffset);
        const color = new Color().setHSL(
            0.55 + seed * 0.35,
            0.15 + seededRandom(cx, cz, 55 + seedOffset) * 0.25,
            0.14 + seededRandom(cx, cz, 60 + seedOffset) * 0.16
        );
        const mat = new MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.2 });

        // Try loaded textures first, fall back to procedural
        let hasMap = false;
        if (this.textureManager) {
            const tex = this.textureManager.getRandomFacade(seededRandom(cx, cz, 70 + seedOffset));
            if (tex) {
                mat.map = this._getCachedClone(tex, w / 8, h / 8);
                hasMap = true;
            }
        }
        if (!hasMap) {
            const procTex = this.proceduralTextures.getFacade(
                seededRandom(cx, cz, 75 + seedOffset),
                _activePalette
            );
            mat.map = this._getCachedClone(procTex, w / 10, h / 10);
        }
        return mat;
    }

    _createRoadMaterial(cx, cz) {
        const mat = new MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.5, metalness: 0.15 });
        let hasMap = false;
        if (this.textureManager) {
            const tex = this.textureManager.getRoadTexture();
            if (tex) {
                mat.map = this._getCachedClone(tex, CHUNK_SIZE / 16, CHUNK_SIZE / 16);
                hasMap = true;
            }
        }
        if (!hasMap) {
            const seed = cx !== undefined ? seededRandom(cx, cz, 500) : Math.random();
            const procTex = this.proceduralTextures.getRoad(seed);
            mat.map = this._getCachedClone(procTex, CHUNK_SIZE / 12, CHUNK_SIZE / 12);
        }
        return mat;
    }

    _createGroundMaterial(cx, cz) {
        const mat = new MeshStandardMaterial({ color: 0x2a2a44, roughness: 0.85 });
        let hasMap = false;
        if (this.textureManager) {
            const tex = this.textureManager.getGroundTexture();
            if (tex) {
                mat.map = this._getCachedClone(tex, CHUNK_SIZE / 12, CHUNK_SIZE / 12);
                hasMap = true;
            }
        }
        if (!hasMap) {
            const seed = cx !== undefined ? seededRandom(cx, cz, 510) : Math.random();
            const procTex = this.proceduralTextures.getGround(seed);
            mat.map = this._getCachedClone(procTex, CHUNK_SIZE / 10, CHUNK_SIZE / 10);
        }
        return mat;
    }

    _createBillboardMaterial(cx, cz, idx) {
        const mat = new MeshBasicMaterial({
            color: randomNeon(), transparent: true, opacity: 0.8,
        });
        mat._isNeon = true;

        if (this.textureManager) {
            const tex = this.textureManager.getBillboardTexture();
            if (tex) {
                const cellIdx = Math.abs(Math.floor(seededRandom(cx, cz, 750 + idx) * 8)) % 8;
                const uvs = this.textureManager.getBillboardUVs(cellIdx);
                mat.map = this._getCachedClone(tex, uvs.repeat.x, uvs.repeat.y, uvs.offset.x, uvs.offset.y);
            }
        }
        return mat;
    }

    _buildSideBuildings(group, meshes, chunkSigns, wx, wz, dir, cx, cz, collidables) {
        const numPerSide = 2 + Math.floor(seededRandom(cx, cz, 10) * 3);
        for (const side of [-1, 1]) {
            for (let i = 0; i < numPerSide; i++) {
                const r = seededRandom(cx, cz, 20 + side * 10 + i);
                const w = 5 + r * 10;
                const h = 12 + seededRandom(cx, cz, 30 + side * 10 + i) * 55;
                const d = 5 + seededRandom(cx, cz, 40 + side * 10 + i) * 8;

                const bGeo = this._createBuildingGeo(w, h, d, cx, cz, 900 + side * 10 + i);
                const bMat = this._createBuildingMaterial(cx, cz, i, w, h);
                const b = new Mesh(bGeo, bMat);

                const offset = ROAD_WIDTH / 2 + 5 + seededRandom(cx, cz, 70 + i) * 12;
                if (dir === 'ns') {
                    b.position.set(wx + side * offset, h / 2, wz + (seededRandom(cx, cz, 80 + i) - 0.5) * CHUNK_SIZE * 0.7);
                } else {
                    b.position.set(wx + (seededRandom(cx, cz, 80 + i) - 0.5) * CHUNK_SIZE * 0.7, h / 2, wz + side * offset);
                }
                this.scene.add(b);
                meshes.push(b);

                // Track building as collidable
                const box = new Box3().setFromCenterAndSize(
                    b.position,
                    new Vector3(w, h, d)
                );
                collidables.push({ box, mesh: b, type: 'building' });

                // Neon edges & windows
                this._buildingDetails(b, w, h, d, meshes, chunkSigns, dir === 'ns' ? side : 0, cx, cz, i);
            }
        }
    }

    _buildCornerBuildings(group, meshes, chunkSigns, wx, wz, cx, cz, collidables) {
        for (let qi = 0; qi < 4; qi++) {
            const sx = qi < 2 ? -1 : 1;
            const sz = qi % 2 === 0 ? -1 : 1;
            const numB = 1 + Math.floor(seededRandom(cx, cz, 100 + qi) * 2);
            for (let i = 0; i < numB; i++) {
                const w = 5 + seededRandom(cx, cz, 110 + qi * 5 + i) * 8;
                const h = 15 + seededRandom(cx, cz, 120 + qi * 5 + i) * 50;
                const d = 5 + seededRandom(cx, cz, 130 + qi * 5 + i) * 8;

                const bGeo = this._createBuildingGeo(w, h, d, cx, cz, 950 + qi * 5 + i);
                const bMat = this._createBuildingMaterial(cx, cz, qi * 5 + i, w, h);
                const b = new Mesh(bGeo, bMat);
                b.position.set(
                    wx + sx * (ROAD_WIDTH / 2 + 6 + i * 8),
                    h / 2,
                    wz + sz * (ROAD_WIDTH / 2 + 6 + seededRandom(cx, cz, 160 + qi + i) * 8)
                );
                this.scene.add(b);
                meshes.push(b);

                const box = new Box3().setFromCenterAndSize(
                    b.position,
                    new Vector3(w, h, d)
                );
                collidables.push({ box, mesh: b, type: 'building' });

                this._buildingDetails(b, w, h, d, meshes, chunkSigns, sx, cx, cz, qi * 3 + i);
            }
        }
    }

    _buildBlockBuildings(group, meshes, chunkSigns, wx, wz, cx, cz, collidables) {
        const num = 3 + Math.floor(seededRandom(cx, cz, 200) * 4);
        for (let i = 0; i < num; i++) {
            const w = 5 + seededRandom(cx, cz, 210 + i) * 12;
            const h = 10 + seededRandom(cx, cz, 220 + i) * 60;
            const d = 5 + seededRandom(cx, cz, 230 + i) * 12;

            const bGeo = this._createBuildingGeo(w, h, d, cx, cz, 980 + i);
            const bMat = this._createBuildingMaterial(cx, cz, 200 + i, w, h);
            const b = new Mesh(bGeo, bMat);
            b.position.set(
                wx + (seededRandom(cx, cz, 260 + i) - 0.5) * CHUNK_SIZE * 0.7,
                h / 2,
                wz + (seededRandom(cx, cz, 270 + i) - 0.5) * CHUNK_SIZE * 0.7
            );
            this.scene.add(b);
            meshes.push(b);

            const box = new Box3().setFromCenterAndSize(
                b.position,
                new Vector3(w, h, d)
            );
            collidables.push({ box, mesh: b, type: 'building' });

            this._buildingDetails(b, w, h, d, meshes, chunkSigns, 1, cx, cz, i);
        }
    }

    _buildingDetails(building, w, h, d, meshes, chunkSigns, faceSide, cx, cz, idx) {
        // Neon edge lines
        const color = randomNeon();
        for (const ey of [h / 2, -h / 2 + 0.5]) {
            if (seededRandom(cx, cz, 300 + idx + ey) < 0.4) continue;
            const geo = new BoxGeometry(w + 0.1, 0.06, 0.06);
            const mat = new MeshBasicMaterial({ color });
            mat._isNeon = true;
            const line = new Mesh(geo, mat);
            line.position.set(building.position.x, building.position.y + ey, building.position.z);
            this.scene.add(line);
            meshes.push(line);
        }

        // Neon building edge outline (toggleable via /edges setting)
        const edgeGeo = new EdgesGeometry(new BoxGeometry(w + 0.1, h + 0.1, d + 0.1));
        const edgeMat = new LineBasicMaterial({ color });
        const edgeMesh = new LineSegments(edgeGeo, edgeMat);
        edgeMesh.position.copy(building.position);
        edgeMesh.visible = this._buildingEdgesEnabled;
        this.scene.add(edgeMesh);
        meshes.push(edgeMesh);
        if (this._chunkEdgeMeshes) this._chunkEdgeMeshes.push(edgeMesh);

        // Windows — InstancedMesh with per-instance color
        const cols = Math.min(Math.floor(w / 1.5), 6);
        const rows = Math.min(Math.floor(h / 2), 12);
        const faceX = building.position.x + (faceSide < 0 ? 1 : -1) * (w / 2 + 0.01);
        const rotY = faceSide < 0 ? Math.PI / 2 : -Math.PI / 2;

        // First pass: collect positions and colors
        const winPositions = [];
        const winColors = [];
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (seededRandom(cx, cz, 400 + idx * 100 + r * 10 + c) < 0.35) continue;
                const lit = seededRandom(cx, cz, 500 + idx * 100 + r * 10 + c) < 0.65;
                const wc = lit
                    ? new Color().setHSL(seededRandom(cx, cz, 600 + idx * 100 + r * 10 + c) * 0.25, 0.6, 0.5)
                    : new Color(0x121225);
                winPositions.push(
                    faceX,
                    building.position.y - h / 2 + 2 + r * 2,
                    building.position.z - w / 2 + 1.5 + c * 1.5
                );
                winColors.push(wc.r, wc.g, wc.b);
            }
        }

        if (winPositions.length > 0) {
            const count = winPositions.length / 3;
            const winMat = new MeshBasicMaterial();
            const winIM = new InstancedMesh(this._winGeo, winMat, count);
            const _m4 = new Matrix4();
            const _rotM = new Matrix4().makeRotationY(rotY);
            const colorAttr = new Float32Array(count * 3);
            for (let i = 0; i < count; i++) {
                _m4.makeTranslation(winPositions[i * 3], winPositions[i * 3 + 1], winPositions[i * 3 + 2]).multiply(_rotM);
                winIM.setMatrixAt(i, _m4);
                colorAttr[i * 3] = winColors[i * 3];
                colorAttr[i * 3 + 1] = winColors[i * 3 + 1];
                colorAttr[i * 3 + 2] = winColors[i * 3 + 2];
            }
            winIM.instanceMatrix.needsUpdate = true;
            winIM.instanceColor = new InstancedBufferAttribute(colorAttr, 3);
            this.scene.add(winIM);
            meshes.push(winIM);
        }

        // Billboard (occasional)
        if (seededRandom(cx, cz, 700 + idx) < 0.3) {
            const bbW = 3 + seededRandom(cx, cz, 710 + idx) * 4;
            const bbH = 2 + seededRandom(cx, cz, 720 + idx) * 3;
            const bbGeo = new PlaneGeometry(bbW, bbH);
            const bbMat = this._createBillboardMaterial(cx, cz, idx);
            const bb = new Mesh(bbGeo, bbMat);
            bb.position.set(faceX, building.position.y + seededRandom(cx, cz, 730 + idx) * h * 0.2, building.position.z);
            bb.rotation.y = faceSide < 0 ? Math.PI / 2 : -Math.PI / 2;
            this.scene.add(bb);
            meshes.push(bb);

            // Neon border frame (always glowing)
            const borderMat = new MeshBasicMaterial({ color: randomNeon() });
            const hBar = new BoxGeometry(bbW + 0.12, 0.08, 0.06);
            const vBar = new BoxGeometry(0.08, bbH + 0.12, 0.06);
            for (const dy of [-bbH / 2, bbH / 2]) {
                const bar = new Mesh(hBar, borderMat);
                bar.position.set(0, dy, 0.02);
                bb.add(bar);
            }
            for (const dx of [-bbW / 2, bbW / 2]) {
                const bar = new Mesh(vBar, borderMat);
                bar.position.set(dx, 0, 0.02);
                bb.add(bar);
            }

            const signObj = { mesh: bb, baseOpacity: bbMat.opacity, phase: seededRandom(cx, cz, 740 + idx) * Math.PI * 2 };
            this.signs.push(signObj);
            chunkSigns.push(signObj);
        }

        // Rooftop billboard (on tall buildings, 20% chance)
        if (h > 18 && seededRandom(cx, cz, 750 + idx) < 0.2) {
            this._addRooftopBillboard(building, w, h, d, meshes, chunkSigns, cx, cz, idx);
        }
    }

    /* ── Rooftop billboards ── */

    _addRooftopBillboard(building, w, h, d, meshes, chunkSigns, cx, cz, idx) {
        const bbW = 4 + seededRandom(cx, cz, 760 + idx) * 4;
        const bbH = 3 + seededRandom(cx, cz, 770 + idx) * 3;
        const roofY = building.position.y + h / 2;

        // Support pole
        const poleMat = new MeshStandardMaterial({ color: 0x444444, metalness: 0.6, roughness: 0.4, emissive: 0x222222, emissiveIntensity: 0.5 });
        const pole = new Mesh(new CylinderGeometry(0.15, 0.15, 3, 6), poleMat);
        pole.position.set(building.position.x, roofY + 1.5, building.position.z);
        this.scene.add(pole);
        meshes.push(pole);

        // Frame — neon glowing border
        const frameMat = new MeshBasicMaterial({ color: randomNeon() });
        const frame = new Mesh(new BoxGeometry(bbW + 0.4, bbH + 0.4, 0.15), frameMat);
        frame.position.set(building.position.x, roofY + 3 + bbH / 2, building.position.z);
        this.scene.add(frame);
        meshes.push(frame);

        // Determine billboard type
        const typeR = seededRandom(cx, cz, 780 + idx);
        let rbEntry;

        if (typeR < 0.4) {
            // Type 1: Scrolling text
            rbEntry = this._createScrollBillboard(building, bbW, bbH, roofY, meshes, cx, cz, idx);
        } else if (typeR < 0.7) {
            // Type 2: Color cycling shader
            rbEntry = this._createColorBillboard(building, bbW, bbH, roofY, meshes);
        } else {
            // Type 3: Eye (surveillance)
            rbEntry = this._createEyeBillboard(building, bbW, bbH, roofY, meshes);
        }

        if (rbEntry && this._chunkRBs) this._chunkRBs.push(rbEntry);
    }

    _createScrollBillboard(building, bbW, bbH, roofY, meshes, cx, cz, idx) {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 128;
        const ctx2d = canvas.getContext('2d');

        const phrases = [
            '新上海 — 未来属于我们', 'NEURODRIVE', '量子引擎 v2.0',
            '赛博空间', '神经网络在线', 'SYSTEM ONLINE', '意识上传',
            '阿拉萨卡科技', 'NEON CITY', '数据链路激活',
        ];
        const text = phrases[Math.floor(seededRandom(cx, cz, 790 + idx) * phrases.length)];
        const neonColor = _activePalette.neons[Math.floor(seededRandom(cx, cz, 795 + idx) * _activePalette.neons.length)];
        const colorStr = '#' + new Color(neonColor).getHexString();

        ctx2d.fillStyle = '#0a0a15';
        ctx2d.fillRect(0, 0, 256, 128);
        ctx2d.font = 'bold 36px monospace';
        ctx2d.fillStyle = colorStr;
        ctx2d.textBaseline = 'middle';
        // Draw text twice for seamless scrolling
        ctx2d.fillText(text + '   ' + text, 10, 64);

        const texture = new CanvasTexture(canvas);
        texture.wrapS = RepeatWrapping;

        const mat = new MeshBasicMaterial({ map: texture, transparent: true, opacity: 0.9 });
        const screen = new Mesh(new PlaneGeometry(bbW, bbH), mat);
        screen.position.set(building.position.x, roofY + 3 + bbH / 2, building.position.z + 0.08);
        this.scene.add(screen);
        meshes.push(screen);

        return { mesh: screen, type: 'scroll', texture };
    }

    _createColorBillboard(building, bbW, bbH, roofY, meshes) {
        const mat = new ShaderMaterial({
            uniforms: { time: { value: 0 } },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform float time;
                varying vec2 vUv;
                void main() {
                    float hue = mod(time * 0.2 + vUv.x * 2.0, 1.0);
                    vec3 col = vec3(
                        abs(hue * 6.0 - 3.0) - 1.0,
                        2.0 - abs(hue * 6.0 - 2.0),
                        2.0 - abs(hue * 6.0 - 4.0)
                    );
                    gl_FragColor = vec4(clamp(col, 0.0, 1.0) * 0.8, 1.0);
                }
            `,
        });
        const screen = new Mesh(new PlaneGeometry(bbW, bbH), mat);
        screen.position.set(building.position.x, roofY + 3 + bbH / 2, building.position.z + 0.08);
        this.scene.add(screen);
        meshes.push(screen);

        return { mesh: screen, type: 'color' };
    }

    _createEyeBillboard(building, bbW, bbH, roofY, meshes) {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx2d = canvas.getContext('2d');

        this._drawEye(ctx2d, canvas, 0, 0);

        const texture = new CanvasTexture(canvas);
        const mat = new MeshBasicMaterial({ map: texture });
        const size = Math.min(bbW, bbH);
        const screen = new Mesh(new PlaneGeometry(size, size), mat);
        screen.position.set(building.position.x, roofY + 3 + bbH / 2, building.position.z + 0.08);
        this.scene.add(screen);
        meshes.push(screen);

        return { mesh: screen, type: 'eye', texture, canvas, ctx: ctx2d };
    }

    _drawEye(ctx, canvas, px, py) {
        const w = canvas.width, h = canvas.height;
        const cx = w / 2, cy = h / 2;

        ctx.fillStyle = '#0a0a15';
        ctx.fillRect(0, 0, w, h);

        // Sclera
        ctx.beginPath();
        ctx.ellipse(cx, cy, w * 0.4, h * 0.35, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#e8e8e8';
        ctx.fill();

        // Iris
        const irisR = h * 0.22;
        const irisX = cx + px * w * 0.15;
        const irisY = cy + py * h * 0.1;
        ctx.beginPath();
        ctx.arc(irisX, irisY, irisR, 0, Math.PI * 2);
        ctx.fillStyle = '#00ccff';
        ctx.fill();

        // Pupil
        ctx.beginPath();
        ctx.arc(irisX, irisY, irisR * 0.45, 0, Math.PI * 2);
        ctx.fillStyle = '#000';
        ctx.fill();

        // Glint
        ctx.beginPath();
        ctx.arc(irisX - irisR * 0.2, irisY - irisR * 0.2, irisR * 0.12, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
    }

    /* ── Obstacles ── */

    _buildObstacles(group, meshes, wx, wz, dir, cx, cz, collidables) {
        const r = seededRandom(cx, cz, 800);

        // Roadblock barrier (15% chance)
        if (r < 0.15) {
            this._addRoadblock(group, meshes, wx, wz, dir, cx, cz, collidables);
        }

        // Oncoming traffic (25% chance)
        if (seededRandom(cx, cz, 810) < 0.25) {
            this._addOncomingTraffic(wx, wz, dir, cx, cz);
        }
    }

    _addRoadblock(group, meshes, wx, wz, dir, cx, cz, collidables) {
        // Which lane to block
        const lane = seededRandom(cx, cz, 820) < 0.5 ? -1 : 1;
        const laneOffset = lane * 7;
        const alongOffset = (seededRandom(cx, cz, 830) - 0.5) * CHUNK_SIZE * 0.5;

        // Barrier — striped black/yellow box
        const bw = dir === 'ns' ? 4 : 0.5;
        const bh = 1.2;
        const bd = dir === 'ns' ? 0.5 : 4;
        const barrierGeo = new BoxGeometry(bw, bh, bd);
        const barrierMat = new MeshStandardMaterial({
            color: 0xffaa00, roughness: 0.6,
            emissive: 0xffaa00, emissiveIntensity: 0.7,
        });
        const barrier = new Mesh(barrierGeo, barrierMat);
        if (dir === 'ns') {
            barrier.position.set(wx + laneOffset, 0.6, wz + alongOffset);
        } else {
            barrier.position.set(wx + alongOffset, 0.6, wz + laneOffset);
        }
        group.add(barrier);

        const barrierBox = new Box3().setFromCenterAndSize(
            barrier.position,
            new Vector3(bw, bh, bd)
        );
        collidables.push({ box: barrierBox, mesh: barrier, type: 'barrier' });

        // Warning stripes
        const stripeGeo = new BoxGeometry(dir === 'ns' ? 4.02 : 0.52, 0.3, dir === 'ns' ? 0.52 : 4.02);
        const stripeMat = new MeshBasicMaterial({ color: 0x000000 });
        for (let i = 0; i < 3; i++) {
            const stripe = new Mesh(stripeGeo, stripeMat);
            stripe.position.copy(barrier.position);
            stripe.position.y = 0.3 + i * 0.4;
            group.add(stripe);
        }

        // Flashing warning light on top
        const lightGeo = new SphereGeometry(0.15, 8, 8);
        const lightMat = new MeshBasicMaterial({ color: 0xff0000 });
        const light = new Mesh(lightGeo, lightMat);
        light.position.copy(barrier.position);
        light.position.y = 1.4;
        group.add(light);

        // Neon glow strip along the top of the barrier
        const glowStripGeo = new BoxGeometry(
            dir === 'ns' ? bw + 0.05 : 0.08,
            0.06,
            dir === 'ns' ? 0.08 : bd + 0.05
        );
        const glowStripMat = new MeshBasicMaterial({ color: 0xffdd00 });
        const glowStrip = new Mesh(glowStripGeo, glowStripMat);
        glowStrip.position.copy(barrier.position);
        glowStrip.position.y = barrier.position.y + bh / 2 + 0.03;
        group.add(glowStrip);

        // Cones on either side
        const coneGeo = new ConeGeometry(0.2, 0.6, 8);
        const coneMat = new MeshStandardMaterial({
            color: 0xff6600,
            emissive: 0xff4400, emissiveIntensity: 0.8,
        });
        for (const cOffset of [-2.5, 2.5]) {
            const cone = new Mesh(coneGeo, coneMat);
            if (dir === 'ns') {
                cone.position.set(wx + laneOffset + cOffset, 0.3, wz + alongOffset);
            } else {
                cone.position.set(wx + alongOffset, 0.3, wz + laneOffset + cOffset);
            }
            group.add(cone);

            const coneBox = new Box3().setFromCenterAndSize(
                cone.position,
                new Vector3(0.4, 0.6, 0.4)
            );
            collidables.push({ box: coneBox, mesh: cone, type: 'cone' });
        }
    }

    _addOncomingTraffic(wx, wz, dir, cx, cz) {
        const key = `${cx},${cz}`;
        // Simple box car driving in opposite lane
        const carGeo = new BoxGeometry(1.8, 0.7, 3.5);
        const carColors = [0xcc0000, 0x0044cc, 0x008800, 0xcccc00, 0xff6600];
        const pickedCarColor = carColors[Math.floor(seededRandom(cx, cz, 850) * carColors.length)];
        const carMat = new MeshStandardMaterial({
            color: pickedCarColor,
            roughness: 0.4, metalness: 0.5,
            emissive: pickedCarColor, emissiveIntensity: 0.35,
        });
        const car = new Mesh(carGeo, carMat);

        // Headlights
        for (const s of [-0.6, 0.6]) {
            const hlGeo = new BoxGeometry(0.2, 0.12, 0.05);
            const hlMat = new MeshBasicMaterial({ color: 0xffffcc });
            const hl = new Mesh(hlGeo, hlMat);
            if (dir === 'ns') {
                hl.position.set(s, 0, 1.78);
            } else {
                hl.position.set(1.78, 0, s);
                hl.rotation.y = Math.PI / 2;
            }
            car.add(hl);
        }

        // Tail lights
        for (const s of [-0.7, 0.7]) {
            const tlGeo = new BoxGeometry(0.2, 0.1, 0.05);
            const tlMat = new MeshBasicMaterial({ color: 0xff0022 });
            const tl = new Mesh(tlGeo, tlMat);
            if (dir === 'ns') {
                tl.position.set(s, 0, -1.78);
            } else {
                tl.position.set(-1.78, 0, s);
                tl.rotation.y = Math.PI / 2;
            }
            car.add(tl);
        }

        // Neon underglow
        const ugGeo = new PlaneGeometry(2, 4);
        const neonCol = randomNeon();
        const ugMat = new MeshBasicMaterial({ color: neonCol, transparent: true, opacity: 0.35, side: DoubleSide });
        const ug = new Mesh(ugGeo, ugMat);
        ug.rotation.x = -Math.PI / 2;
        ug.position.y = -0.3;
        car.add(ug);

        // Neon side accent strips (always-visible neon trim)
        const accentMat = new MeshBasicMaterial({ color: neonCol });
        for (const sx of [-0.91, 0.91]) {
            const stripGeo = new BoxGeometry(0.04, 0.04, 3.4);
            const strip = new Mesh(stripGeo, accentMat);
            strip.position.set(sx, 0.05, 0);
            car.add(strip);
        }

        const lane = 7; // oncoming lane
        const startZ = (seededRandom(cx, cz, 860) - 0.5) * CHUNK_SIZE * 0.8;

        if (dir === 'ns') {
            car.position.set(wx - lane, 0.55, wz + startZ);
            car.rotation.y = Math.PI; // facing opposite
        } else {
            car.position.set(wx + startZ, 0.55, wz - lane);
            car.rotation.y = Math.PI / 2;
        }

        this.scene.add(car);
        const speed = 8 + seededRandom(cx, cz, 870) * 12;
        this.trafficVehicles.push({
            mesh: car, dir, speed, _chunkKey: key,
            originX: wx, originZ: wz,
        });
    }

    _buildTrafficLights(group, meshes, wx, wz, cx, cz, collidables) {
        const positions = [
            { x: wx - ROAD_WIDTH / 2 - 1, z: wz - ROAD_WIDTH / 2 - 1, ry: 0 },
            { x: wx + ROAD_WIDTH / 2 + 1, z: wz + ROAD_WIDTH / 2 + 1, ry: Math.PI },
            { x: wx + ROAD_WIDTH / 2 + 1, z: wz - ROAD_WIDTH / 2 - 1, ry: -Math.PI / 2 },
            { x: wx - ROAD_WIDTH / 2 - 1, z: wz + ROAD_WIDTH / 2 + 1, ry: Math.PI / 2 },
        ];

        const poleMat = new MeshStandardMaterial({ color: 0x444444, metalness: 0.7, roughness: 0.3 });
        for (const p of positions) {
            // Pole
            const pole = new Mesh(new CylinderGeometry(0.07, 0.07, 5, 6), poleMat);
            pole.position.set(p.x, 2.5, p.z);
            group.add(pole);

            const poleBox = new Box3().setFromCenterAndSize(
                new Vector3(p.x, 2.5, p.z),
                new Vector3(0.5, 5, 0.5)
            );
            collidables.push({ box: poleBox, mesh: pole, type: 'pole' });

            // Light housing
            const houseGeo = new BoxGeometry(0.5, 1.5, 0.3);
            const houseMat = new MeshStandardMaterial({ color: 0x222222, metalness: 0.5, emissive: 0x111111, emissiveIntensity: 0.6 });
            const house = new Mesh(houseGeo, houseMat);
            house.position.set(p.x, 5.3, p.z);
            house.rotation.y = p.ry;
            group.add(house);

            // Neon housing frame (child of house so it inherits rotation)
            const neonColor = randomNeon();
            const frameGeo = new EdgesGeometry(new BoxGeometry(0.54, 1.54, 0.34));
            const frameMat = new LineBasicMaterial({ color: neonColor });
            const frame = new LineSegments(frameGeo, frameMat);
            house.add(frame);

            // Neon visor hood above housing
            const visorMat = new MeshBasicMaterial({ color: neonColor });
            const visor = new Mesh(new BoxGeometry(0.58, 0.05, 0.2), visorMat);
            visor.position.set(0, 0.8, -0.22); // sticks out from front face
            house.add(visor);

            // Three lights: red, yellow, green
            const lightColors = [0xff0000, 0xffaa00, 0x00ff00];
            const phase = hashChunk(cx, cz) % 3;
            for (let i = 0; i < 3; i++) {
                const active = i === phase;
                const lg = new Mesh(
                    new SphereGeometry(0.12, 8, 8),
                    new MeshBasicMaterial({
                        color: lightColors[i],
                        transparent: !active,
                        opacity: active ? 1 : 0.15,
                    })
                );
                lg.position.set(p.x, 5.7 - i * 0.45, p.z);
                group.add(lg);
            }
        }
    }

    /* ── Rain (GPU-driven) ── */
    _buildRain() {
        const COUNT = 10000;
        const geo = new BufferGeometry();
        const initialPos = new Float32Array(COUNT * 3);
        const vel = new Float32Array(COUNT);
        for (let i = 0; i < COUNT; i++) {
            initialPos[i * 3] = (Math.random() - 0.5) * 200;
            initialPos[i * 3 + 1] = Math.random() * 60;
            initialPos[i * 3 + 2] = (Math.random() - 0.5) * 200;
            vel[i] = 0.4 + Math.random() * 0.6;
        }
        geo.setAttribute('position', new BufferAttribute(initialPos, 3));
        geo.setAttribute('initialPos', new BufferAttribute(initialPos.slice(), 3));
        geo.setAttribute('velocity', new BufferAttribute(vel, 1));

        const mat = new ShaderMaterial({
            uniforms: {
                time: { value: 0 },
                vehiclePosition: { value: new Vector3() },
                color: { value: new Color(0x8888cc) },
                size: { value: 0.08 },
                opacity: { value: 0.5 },
            },
            vertexShader: `
                attribute vec3 initialPos;
                attribute float velocity;
                uniform float time;
                uniform vec3 vehiclePosition;
                uniform float size;
                void main() {
                    vec3 pos = initialPos;
                    // Drop rain: y wraps around 0..61
                    pos.y = mod(initialPos.y - velocity * time * 60.0, 61.0) - 1.0;
                    // Center around vehicle
                    pos.x = mod(initialPos.x - vehiclePosition.x + 100.0, 200.0) - 100.0 + vehiclePosition.x;
                    pos.z = mod(initialPos.z - vehiclePosition.z + 100.0, 200.0) - 100.0 + vehiclePosition.z;
                    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
                    gl_PointSize = size * (300.0 / -mvPosition.z);
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                uniform vec3 color;
                uniform float opacity;
                void main() {
                    gl_FragColor = vec4(color, opacity);
                }
            `,
            transparent: true,
            depthWrite: false,
        });
        this.rainDrops = new Points(geo, mat);
        this.scene.add(this.rainDrops);
    }

    /* ── Skybox ── */
    _buildSkybox() {
        const p = _activePalette;
        const geo = new SphereGeometry(600, 32, 32);
        this._skyUniforms = {
            skyLo: { value: new Vector3(...p.skyLo) },
            skyHi: { value: new Vector3(...p.skyHi) },
            skyGlow: { value: new Vector3(...p.skyGlow) },
        };
        const mat = new ShaderMaterial({
            side: BackSide,
            uniforms: this._skyUniforms,
            vertexShader: `varying vec3 vWP; void main(){ vWP=(modelMatrix*vec4(position,1.0)).xyz; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
            fragmentShader: `
        uniform vec3 skyLo; uniform vec3 skyHi; uniform vec3 skyGlow;
        varying vec3 vWP; void main(){
        float h=normalize(vWP).y;
        vec3 c=mix(skyLo,skyHi,smoothstep(-0.1,0.5,h));
        float g=exp(-abs(h)*8.0)*0.35; c+=skyGlow*g;
        gl_FragColor=vec4(c,1.0);
      }`,
        });
        this.scene.add(new Mesh(geo, mat));
    }

    /* ── Post-processing ── */
    _initPostProcessing() {
        this.composer = new EffectComposer(this.renderer);
        this.composer.addPass(new RenderPass(this.scene, this.camera));
        this.composer.addPass(new UnrealBloomPass(new Vector2(window.innerWidth, window.innerHeight), 0.8, 0.4, 0.85));

        // FXAA instead of SMAA (cheaper)
        this._fxaaPass = new ShaderPass(FXAAShader);
        const pixelRatio = this.renderer.getPixelRatio();
        this._fxaaPass.material.uniforms.resolution.value.set(
            1 / (window.innerWidth * pixelRatio),
            1 / (window.innerHeight * pixelRatio)
        );
        this.composer.addPass(this._fxaaPass);

        this.retroPass = new ShaderPass(RetroShader);
        this.composer.addPass(this.retroPass);

        // LiveBlendShader — Layer 2 screen-space stylization overlay
        this.liveBlendPass = new ShaderPass(LiveBlendShader);
        this.liveBlendPass.uniforms.blendFactor.value = 0.0;
        this.liveBlendPass.enabled = false;
        this.composer.addPass(this.liveBlendPass);
    }

    _onResize() {
        const w = window.innerWidth, h = window.innerHeight;
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h);
        this.composer.setSize(w, h);
        // Update FXAA resolution
        if (this._fxaaPass) {
            const pixelRatio = this.renderer.getPixelRatio();
            this._fxaaPass.material.uniforms.resolution.value.set(
                1 / (w * pixelRatio),
                1 / (h * pixelRatio)
            );
        }
    }

    /* ── Collision helpers ── */

    getCollidables(vehiclePos, radius) {
        const result = [];
        const rSq = radius * radius;

        // Static collidables from nearby chunks
        for (const [, chunk] of this.chunks) {
            const cx = chunk.cx * CHUNK_SIZE;
            const cz = chunk.cz * CHUNK_SIZE;
            const dx = vehiclePos.x - cx;
            const dz = vehiclePos.z - cz;
            if (dx * dx + dz * dz > (radius + CHUNK_SIZE) * (radius + CHUNK_SIZE)) continue;

            for (const c of chunk.collidables) {
                result.push(c);
            }
        }

        // Traffic vehicles (dynamic — recompute boxes from current position)
        for (const tv of this.trafficVehicles) {
            const pos = tv.mesh.position;
            const dx = vehiclePos.x - pos.x;
            const dz = vehiclePos.z - pos.z;
            if (dx * dx + dz * dz > rSq) continue;

            const box = new Box3().setFromCenterAndSize(pos, this._trafficSize);
            result.push({ box, mesh: tv.mesh, type: 'traffic' });
        }

        return result;
    }

    /** Get ground height at a world XZ position (for vehicle Y) */
    getGroundHeight(x, z) {
        const cx = Math.round(x / CHUNK_SIZE);
        const cz = Math.round(z / CHUNK_SIZE);
        const key = `${cx},${cz}`;
        const chunk = this.chunks.get(key);
        if (!chunk) return 0;

        const H = HIGHWAY_HEIGHT;
        const localX = x - cx * CHUNK_SIZE; // -CHUNK_SIZE/2 to CHUNK_SIZE/2
        const localZ = z - cz * CHUNK_SIZE;

        // Check if vehicle is within the highway/ramp footprint width
        const W = HIGHWAY_WIDTH;
        const isOnDeck = (dir) => {
            if (dir === 'ns') return Math.abs(localX) < W / 2 + 0.5;
            return Math.abs(localZ) < W / 2 + 0.5;
        };

        switch (chunk.type) {
            case CHUNK_HIGHWAY_NS:
                return isOnDeck('ns') ? H : 0;
            case CHUNK_HIGHWAY_EW:
                return isOnDeck('ew') ? H : 0;
            case CHUNK_RAMP_UP_NS: {
                if (!isOnDeck('ns')) return 0;
                const t = (localZ + CHUNK_SIZE / 2) / CHUNK_SIZE;
                return t * H;
            }
            case CHUNK_RAMP_DOWN_NS: {
                if (!isOnDeck('ns')) return 0;
                const t = (localZ + CHUNK_SIZE / 2) / CHUNK_SIZE;
                return (1 - t) * H;
            }
            case CHUNK_RAMP_UP_EW: {
                if (!isOnDeck('ew')) return 0;
                const t = (localX + CHUNK_SIZE / 2) / CHUNK_SIZE;
                return t * H;
            }
            case CHUNK_RAMP_DOWN_EW: {
                if (!isOnDeck('ew')) return 0;
                const t = (localX + CHUNK_SIZE / 2) / CHUNK_SIZE;
                return (1 - t) * H;
            }
            default:
                return 0;
        }
    }

    /* ── Palette cycling ── */

    _applyPalette(palette) {
        _activePalette = palette;

        // Fog
        this.scene.fog.color.set(palette.fog);

        // Vehicle-following lights
        this._vehicleLight.color.set(palette.vehicleLight);
        this._fillLight.color.set(palette.fillLight);

        // Rain
        if (this.rainDrops) {
            this.rainDrops.material.uniforms.color.value.set(palette.rain);
        }

        // Skybox uniforms
        if (this._skyUniforms) {
            this._skyUniforms.skyLo.value.set(...palette.skyLo);
            this._skyUniforms.skyHi.value.set(...palette.skyHi);
            this._skyUniforms.skyGlow.value.set(...palette.skyGlow);
        }

        // Recolor all neon-tagged materials in loaded chunks
        const recolorMat = (mat) => {
            if (mat && mat._isNeon) {
                mat.color.set(palette.neons[Math.floor(Math.random() * palette.neons.length)]);
            }
        };

        for (const [, chunk] of this.chunks) {
            chunk.group.traverse(child => {
                if (child.material) {
                    if (Array.isArray(child.material)) child.material.forEach(recolorMat);
                    else recolorMat(child.material);
                }
            });
            for (const m of chunk.meshes) {
                if (m.material) recolorMat(m.material);
            }
        }
    }

    nextPalette() {
        this._paletteTimer = 0;
        const pool = this._palettePool;
        const curPos = pool.indexOf(this._paletteIndex);
        const nextPos = (curPos + 1) % pool.length;
        this._paletteIndex = pool[nextPos];
        this._applyPalette(PALETTES[this._paletteIndex]);
    }

    setPalette(index) {
        if (index < 0 || index >= PALETTES.length) return;
        this._paletteTimer = 0;
        this._paletteIndex = index;
        this._applyPalette(PALETTES[index]);
    }

    setPalettePool(mode) {
        if (mode === 'dark') this._palettePool = DARK_PALETTES;
        else if (mode === 'light') this._palettePool = LIGHT_PALETTES;
        else this._palettePool = ALL_PALETTES;
        // If current palette isn't in the new pool, jump to the first one
        if (!this._palettePool.includes(this._paletteIndex)) {
            this._paletteIndex = this._palettePool[0];
            this._applyPalette(PALETTES[this._paletteIndex]);
        }
    }

    setPaletteLock(locked) {
        this._paletteLocked = !!locked;
    }

    setEdgesVisible(enabled) {
        this._buildingEdgesEnabled = enabled;
        for (const m of this._allEdgeMeshes) m.visible = enabled;
    }

    /* ═══════════════════════════════════════
       UPDATE — called every frame
       ═══════════════════════════════════════ */

    update(vehiclePos, vehicleRot, dt) {
        const elapsed = this.clock.getElapsedTime();

        // Palette cycling — swap every 10 seconds (skip if locked)
        if (!this._paletteLocked) {
            this._paletteTimer += dt;
            if (this._paletteTimer >= 10) {
                this._paletteTimer = 0;
                const pool = this._palettePool;
                const curPos = pool.indexOf(this._paletteIndex);
                const nextPos = (curPos + 1) % pool.length;
                this._paletteIndex = pool[nextPos];
                this._applyPalette(PALETTES[this._paletteIndex]);
            }
        }

        // Chunk management
        this._updateChunks(vehiclePos.x, vehiclePos.z);

        // Shader time
        this.retroPass.uniforms.time.value = elapsed;

        // Vehicle lights follow (track vehicle elevation)
        this._vehicleLight.position.set(vehiclePos.x, vehiclePos.y + 8, vehiclePos.z - 5);
        this._fillLight.position.set(vehiclePos.x + 5, vehiclePos.y + 12, vehiclePos.z - 15);

        // Rain — GPU-driven, just update uniforms
        if (this.rainDrops) {
            this.rainDrops.material.uniforms.time.value = elapsed;
            this.rainDrops.material.uniforms.vehiclePosition.value.copy(vehiclePos);
        }

        // Neon sign flicker
        for (const s of this.signs) {
            s.mesh.material.opacity = s.baseOpacity * (0.5 + 0.5 * Math.sin(elapsed * 3 + s.phase));
        }

        // Animate rooftop billboards
        for (const [, chunk] of this.chunks) {
            if (!chunk.rooftopBillboards) continue;
            for (const rb of chunk.rooftopBillboards) {
                if (rb.type === 'scroll') {
                    rb.texture.offset.x += dt * 0.3;
                } else if (rb.type === 'color' && rb.mesh.material.uniforms) {
                    rb.mesh.material.uniforms.time.value = elapsed;
                } else if (rb.type === 'eye') {
                    // Only update if within 100 units
                    const dx = vehiclePos.x - rb.mesh.position.x;
                    const dz = vehiclePos.z - rb.mesh.position.z;
                    if (dx * dx + dz * dz < 10000) {
                        const angle = Math.atan2(dx, dz);
                        this._drawEye(rb.ctx, rb.canvas, Math.sin(angle) * 0.25, 0);
                        rb.texture.needsUpdate = true;
                    }
                }
            }
        }

        // Update spark time uniforms
        if (this._sparkMeshes) {
            for (const spark of this._sparkMeshes) {
                if (spark.material.uniforms) spark.material.uniforms.time.value = elapsed;
            }
        }

        // Animate oncoming traffic
        for (const tv of this.trafficVehicles) {
            if (tv.dir === 'ns') {
                tv.mesh.position.z += tv.speed * dt;
                if (tv.mesh.position.z > tv.originZ + CHUNK_SIZE) tv.mesh.position.z = tv.originZ - CHUNK_SIZE;
            } else {
                tv.mesh.position.x += tv.speed * dt;
                if (tv.mesh.position.x > tv.originX + CHUNK_SIZE) tv.mesh.position.x = tv.originX - CHUNK_SIZE;
            }
        }

        // Camera — chase behind vehicle, accounting for vehicle elevation
        const camDist = this.camDist;
        const camHeight = this.camHeight;
        const maxCamLag = 3;
        const behindX = vehiclePos.x + Math.sin(vehicleRot.y) * camDist;
        const behindZ = vehiclePos.z + Math.cos(vehicleRot.y) * camDist;
        this._camTarget.set(behindX, vehiclePos.y + camHeight, behindZ);

        // Smooth exponential follow (frame-rate independent)
        const smoothing = 1 - Math.exp(-8 * dt);
        this.camera.position.lerp(this._camTarget, smoothing);

        // Clamp camera distance so it never drifts too far from target
        this._camOffset.copy(this.camera.position).sub(this._camTarget);
        if (this._camOffset.length() > maxCamLag) {
            this._camOffset.setLength(maxCamLag);
            this.camera.position.copy(this._camTarget).add(this._camOffset);
        }

        this._lookTarget.set(
            vehiclePos.x - Math.sin(vehicleRot.y) * 12,
            vehiclePos.y + 1.0,
            vehiclePos.z - Math.cos(vehicleRot.y) * 12
        );
        this.camera.lookAt(this._lookTarget);

        // Frustum culling — hide chunks behind camera
        this.camera.updateMatrixWorld();
        this._projScreenMatrix.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
        this._frustum.setFromProjectionMatrix(this._projScreenMatrix);
        for (const [, chunk] of this.chunks) {
            const cx = chunk.cx * CHUNK_SIZE;
            const cz = chunk.cz * CHUNK_SIZE;
            this._chunkBox.min.set(cx - CHUNK_SIZE / 2, -5, cz - CHUNK_SIZE / 2);
            this._chunkBox.max.set(cx + CHUNK_SIZE / 2, 80, cz + CHUNK_SIZE / 2);
            const visible = this._frustum.intersectsBox(this._chunkBox);
            chunk.group.visible = visible;
            for (const m of chunk.meshes) {
                m.visible = visible;
            }
        }

        // Update live stream overlay (Layer 2)
        if (this.liveStreamClient) {
            this.liveStreamClient.update(dt);
            const blendFactor = this.liveStreamClient.blendFactor;
            this.liveBlendPass.uniforms.blendFactor.value = blendFactor;
            this.liveBlendPass.uniforms.tLiveStream.value = this.liveStreamClient.outputTexture;
            this.liveBlendPass.enabled = (blendFactor > 0.01);
        }

        this.composer.render();
    }

    renderClean() { this.renderer.render(this.scene, this.camera); }
    getRenderer() { return this.renderer; }
}
