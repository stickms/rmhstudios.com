// @ts-nocheck
/* ═══════════════════════════════════════════
   NEURODRIVE — Data Collector
   Records per-frame driving data for
   autonomous vehicle training
   ═══════════════════════════════════════════ */

export class DataCollector {
    constructor() {
        this.frames = [];
        this.recording = false;
        this.mode = 'manual'; // 'manual' | 'continuous'
        this.continuousInterval = 5; // capture every N frames
        this._frameCount = 0;
        this._startTime = 0;
        this._captureCanvas = document.createElement('canvas');
        this._captureCtx = this._captureCanvas.getContext('2d');
    }

    startSession() {
        this.frames = [];
        this.recording = true;
        this._startTime = performance.now();
        this._frameCount = 0;
        console.log('[数据采集] 会话已开始');
    }

    stopSession() {
        this.recording = false;
        console.log(`[数据采集] 会话结束 — 共采集 ${this.frames.length} 帧`);
    }

    /**
     * Call every frame. In manual mode, only captures when captureNow=true.
     * In continuous mode, captures every N frames.
     */
    tick(sourceCanvas, vehicle, segmentationMask, captureNow = false) {
        if (!this.recording) return;
        this._frameCount++;

        let shouldCapture = false;
        if (this.mode === 'manual') {
            shouldCapture = captureNow;
        } else {
            shouldCapture = (this._frameCount % this.continuousInterval === 0);
        }

        if (!shouldCapture) return;

        // Downscale the frame for storage
        const targetW = 320;
        const targetH = 180;
        this._captureCanvas.width = targetW;
        this._captureCanvas.height = targetH;
        this._captureCtx.drawImage(sourceCanvas, 0, 0, targetW, targetH);
        const frameData = this._captureCanvas.toDataURL('image/jpeg', 0.7);

        const entry = {
            timestamp: Math.round(performance.now() - this._startTime),
            frameIndex: this.frames.length,
            frame: frameData,
            segmentation_mask: segmentationMask || null,
            steering_angle: parseFloat(vehicle.getSteeringNormalized().toFixed(4)),
            throttle: parseFloat(vehicle.getThrottle().toFixed(2)),
            brake: parseFloat(vehicle.getBrake().toFixed(2)),
            speed_kmh: parseFloat(vehicle.getSpeed().toFixed(2)),
            position: vehicle.getPosition(),
            rotation: vehicle.getRotation(),
        };

        this.frames.push(entry);
    }

    getFrameCount() {
        return this.frames.length;
    }

    getData() {
        return this.frames;
    }

    setMode(mode) {
        this.mode = mode;
        console.log(`[数据采集] 模式切换为: ${mode === 'continuous' ? '连续采集' : '手动采集'}`);
    }

    clear() {
        this.frames = [];
        this._frameCount = 0;
    }
}
