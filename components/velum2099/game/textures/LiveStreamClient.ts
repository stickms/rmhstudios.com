// @ts-nocheck
/* ═══════════════════════════════════════════
   NEURODRIVE — Live Stream Client (Layer 2)
   WebSocket client for real-time StreamDiffusion
   screen-space stylization
   ═══════════════════════════════════════════ */

import { Texture, LinearFilter, SRGBColorSpace } from 'three';

const DEFAULT_SERVER = 'ws://localhost:8765/ws';
const CAPTURE_SIZE = 512;

export class LiveStreamClient {
    /**
     * @param {WebGLRenderer} renderer
     * @param {Scene} scene
     * @param {Camera} camera
     */
    constructor(renderer, scene, camera) {
        this.renderer = renderer;
        this.scene = scene;
        this.camera = camera;

        this.ws = null;
        this.connected = false;
        this.active = false;
        this._pending = false; // waiting for server response

        // Offscreen capture canvas
        this._captureCanvas = document.createElement('canvas');
        this._captureCanvas.width = CAPTURE_SIZE;
        this._captureCanvas.height = CAPTURE_SIZE;
        this._captureCtx = this._captureCanvas.getContext('2d');

        // Output texture (updated with stylized frames from server)
        this.outputTexture = new Texture();
        this.outputTexture.minFilter = LinearFilter;
        this.outputTexture.magFilter = LinearFilter;
        this.outputTexture.colorSpace = SRGBColorSpace;

        // Blend factor: 0 = passthrough, 0.5-0.7 = stylized
        this.blendFactor = 0.0;
        this._targetBlend = 0.0;

        this._lastFrameTime = 0;
    }

    /**
     * Connect to the StreamDiffusion server.
     * @param {string} url - WebSocket URL
     */
    connect(url = DEFAULT_SERVER) {
        if (this.ws) this.disconnect();

        console.log(`[LiveStream] Connecting to ${url}...`);

        this.ws = new WebSocket(url);
        this.ws.binaryType = 'arraybuffer';

        this.ws.onopen = () => {
            this.connected = true;
            this.active = true;
            this._targetBlend = 0.6;
            console.log('[LiveStream] Connected');
        };

        this.ws.onmessage = (event) => {
            this._pending = false;
            this._decodeFrame(event.data);
        };

        this.ws.onclose = () => {
            this.connected = false;
            this.active = false;
            this._targetBlend = 0.0;
            this._pending = false;
            console.log('[LiveStream] Disconnected');
        };

        this.ws.onerror = (err) => {
            console.warn('[LiveStream] Connection error:', err);
            this.disconnect();
        };
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.connected = false;
        this.active = false;
        this._targetBlend = 0.0;
        this._pending = false;
    }

    /**
     * Toggle live mode on/off.
     * @param {string} url - Server URL
     * @returns {boolean} New active state
     */
    toggle(url = DEFAULT_SERVER) {
        if (this.connected) {
            this.disconnect();
            return false;
        } else {
            this.connect(url);
            return true;
        }
    }

    /**
     * Called each frame. Captures the scene and sends to server if ready.
     * Smoothly interpolates blend factor.
     * @param {number} dt - Delta time in seconds
     */
    update(dt) {
        // Smooth blend interpolation
        const speed = 2.0; // fade speed
        if (this.blendFactor < this._targetBlend) {
            this.blendFactor = Math.min(this.blendFactor + dt * speed, this._targetBlend);
        } else if (this.blendFactor > this._targetBlend) {
            this.blendFactor = Math.max(this.blendFactor - dt * speed, this._targetBlend);
        }

        // Only send when connected, active, and not waiting for previous response
        if (!this.connected || !this.active || this._pending) return;

        this._captureAndSend();
    }

    _captureAndSend() {
        // Render scene to the main renderer's canvas (already done by composer)
        // Just grab the current canvas pixels
        const canvas = this.renderer.domElement;

        // Draw scaled-down version to capture canvas
        this._captureCtx.drawImage(canvas, 0, 0, CAPTURE_SIZE, CAPTURE_SIZE);

        // Convert to JPEG blob and send
        this._captureCanvas.toBlob(
            (blob) => {
                if (!blob || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
                this._pending = true;
                blob.arrayBuffer().then(buf => {
                    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                        this.ws.send(buf);
                    }
                });
            },
            'image/jpeg',
            0.7
        );
    }

    _decodeFrame(arrayBuffer) {
        const blob = new Blob([arrayBuffer], { type: 'image/jpeg' });
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
            this.outputTexture.image = img;
            this.outputTexture.needsUpdate = true;
            URL.revokeObjectURL(url);
        };
        img.src = url;
    }

    dispose() {
        this.disconnect();
        if (this.outputTexture) {
            this.outputTexture.dispose();
        }
    }
}
