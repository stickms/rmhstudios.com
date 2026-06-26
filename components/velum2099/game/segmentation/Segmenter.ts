// @ts-nocheck
/* ═══════════════════════════════════════════
   NEURODRIVE — Scene Segmenter
   Color-based semantic segmentation using
   OpenCV.js — labels road, buildings, sky,
   neon signs, and vehicles
   ═══════════════════════════════════════════ */

/*
  Segmentation approach:
  Since we control the 3D scene, we use color-range thresholding on the
  rendered frame to approximate semantic classes. This is practical for
  synthetic data and produces clean, consistent masks.

  Classes (matching ADE20K / Cityscapes conventions):
    - Road:      dark grays          → label color #804080 (purple)
    - Building:  dark blues/purples  → label color #808080 (gray)
    - Sky:       very dark upper     → label color #4080c0 (blue)
    - Neon/Sign: bright saturated    → label color #c0c000 (yellow)
    - Vehicle:   near-black metallic → label color #00c0c0 (cyan)
    - Other:     everything else     → label color #000000 (black)
*/

/** Inject the OpenCV.js script once, lazily (only when data collection runs). */
let _opencvLoading = false;
function loadOpenCV() {
    if (_opencvLoading || typeof document === 'undefined') return;
    if (document.querySelector('script[data-opencv]')) { _opencvLoading = true; return; }
    _opencvLoading = true;
    const script = document.createElement('script');
    script.src = 'https://docs.opencv.org/4.10.0/opencv.js';
    script.async = true;
    script.setAttribute('data-opencv', '1');
    document.head.appendChild(script);
}

export class Segmenter {
    constructor() {
        this.ready = false;
        this.offscreenCanvas = document.createElement('canvas');
        this.offscreenCtx = this.offscreenCanvas.getContext('2d', { willReadFrequently: true });
        this.segCanvas = document.createElement('canvas');
        this.segCtx = this.segCanvas.getContext('2d');

        // Downscale factor for performance
        this.scale = 0.25;

        // Frame skip — segment every N frames
        this.frameSkip = 5;
        this._frameCount = 0;
        this._lastMask = null;
    }

    async init() {
        // OpenCV.js is heavy (~8MB) and only needed for data-collection mode, so
        // it is loaded on demand the first time the segmenter is initialised
        // rather than eagerly on every page visit.
        if (typeof cv === 'undefined') loadOpenCV();

        // Wait for it to be ready
        if (typeof cv !== 'undefined' && cv.Mat) {
            this.ready = true;
            return;
        }

        return new Promise((resolve) => {
            const check = () => {
                if (typeof cv !== 'undefined' && cv.Mat) {
                    this.ready = true;
                    resolve();
                } else {
                    setTimeout(check, 200);
                }
            };
            check();

            // Timeout after 15s — run without OpenCV
            setTimeout(() => {
                if (!this.ready) {
                    console.warn('[Segmenter] OpenCV.js 未能加载，使用回退分割方法');
                    this.ready = true;
                    this._fallback = true;
                    resolve();
                }
            }, 15000);
        });
    }

    /**
     * Process a frame from the renderer canvas.
     * Returns a segmentation mask as a base64 PNG string, or null if skipped.
     */
    processFrame(sourceCanvas) {
        this._frameCount++;
        if (this._frameCount % this.frameSkip !== 0) {
            return this._lastMask; // return cached
        }

        const sw = Math.floor(sourceCanvas.width * this.scale);
        const sh = Math.floor(sourceCanvas.height * this.scale);

        this.offscreenCanvas.width = sw;
        this.offscreenCanvas.height = sh;
        this.segCanvas.width = sw;
        this.segCanvas.height = sh;

        // Draw downscaled frame
        this.offscreenCtx.drawImage(sourceCanvas, 0, 0, sw, sh);

        if (this._fallback || typeof cv === 'undefined' || !cv.Mat) {
            return this._fallbackSegment(sw, sh);
        }

        return this._opencvSegment(sw, sh);
    }

    _opencvSegment(w, h) {
        let src, hsv, mask;
        try {
            src = cv.imread(this.offscreenCanvas);
            hsv = new cv.Mat();
            cv.cvtColor(src, hsv, cv.COLOR_RGBA2RGB);
            const rgbMat = hsv.clone();
            cv.cvtColor(rgbMat, hsv, cv.COLOR_RGB2HSV);
            rgbMat.delete();

            // Output mask
            mask = new cv.Mat(h, w, cv.CV_8UC4);

            const srcData = src.data;
            const hsvData = hsv.data;
            const maskData = mask.data;

            for (let i = 0; i < w * h; i++) {
                const ri = i * 4;
                const hi = i * 3;

                const r = srcData[ri];
                const g = srcData[ri + 1];
                const b = srcData[ri + 2];

                const hue = hsvData[hi];
                const sat = hsvData[hi + 1];
                const val = hsvData[hi + 2];

                let lr, lg, lb;

                const brightness = (r + g + b) / 3;

                if (sat > 100 && val > 100) {
                    // Bright saturated → Neon/Sign
                    lr = 192; lg = 192; lb = 0;
                } else if (brightness < 25 && sat < 40) {
                    // Very dark low-sat → Sky (upper region check)
                    const y = Math.floor(i / w);
                    if (y < h * 0.4) {
                        lr = 64; lg = 128; lb = 192;
                    } else {
                        // Road or building
                        if (brightness < 15) {
                            lr = 128; lg = 64; lb = 128; // Road
                        } else {
                            lr = 128; lg = 128; lb = 128; // Building
                        }
                    }
                } else if (brightness < 40 && sat < 60) {
                    // Dark, low saturation → Road
                    lr = 128; lg = 64; lb = 128;
                } else if (brightness < 80 && sat < 80) {
                    // Medium dark → Building
                    lr = 128; lg = 128; lb = 128;
                } else if (val < 50 && sat < 30) {
                    // Dark metallic → Vehicle
                    lr = 0; lg = 192; lb = 192;
                } else {
                    // Other
                    lr = 0; lg = 0; lb = 0;
                }

                maskData[ri] = lr;
                maskData[ri + 1] = lg;
                maskData[ri + 2] = lb;
                maskData[ri + 3] = 255;
            }

            cv.imshow(this.segCanvas, mask);

            this._lastMask = this.segCtx.getImageData(0, 0, w, h);
            return this._lastMask;
        } catch (err) {
            console.error('[Segmenter] OpenCV 分割错误:', err);
            return this._fallbackSegment(w, h);
        } finally {
            if (src) src.delete();
            if (hsv) hsv.delete();
            if (mask) mask.delete();
        }
    }

    _fallbackSegment(w, h) {
        // Pure JS fallback (no OpenCV)
        const imgData = this.offscreenCtx.getImageData(0, 0, w, h);
        const data = imgData.data;
        const outData = this.segCtx.createImageData(w, h);
        const out = outData.data;

        for (let i = 0; i < w * h; i++) {
            const ri = i * 4;
            const r = data[ri], g = data[ri + 1], b = data[ri + 2];
            const brightness = (r + g + b) / 3;
            const maxC = Math.max(r, g, b);
            const minC = Math.min(r, g, b);
            const saturation = maxC > 0 ? (maxC - minC) / maxC * 255 : 0;

            let lr, lg, lb;

            if (saturation > 100 && maxC > 100) {
                lr = 192; lg = 192; lb = 0; // Neon
            } else if (brightness < 25) {
                const y = Math.floor(i / w);
                if (y < h * 0.4) {
                    lr = 64; lg = 128; lb = 192; // Sky
                } else {
                    lr = 128; lg = 64; lb = 128; // Road
                }
            } else if (brightness < 50) {
                lr = 128; lg = 128; lb = 128; // Building
            } else {
                lr = 0; lg = 0; lb = 0; // Other
            }

            out[ri] = lr;
            out[ri + 1] = lg;
            out[ri + 2] = lb;
            out[ri + 3] = 255;
        }

        this.segCtx.putImageData(outData, 0, 0);
        this._lastMask = outData;
        return this._lastMask;
    }

    getLastMask() {
        return this._lastMask;
    }
}
