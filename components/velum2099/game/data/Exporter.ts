// @ts-nocheck
/* ═══════════════════════════════════════════
   NEURODRIVE — Data Exporter
   Exports collected driving data as a
   downloadable ZIP archive
   ═══════════════════════════════════════════ */

import JSZip from 'jszip';

export class Exporter {
    /**
     * @param {Array} frames — array of frame data from DataCollector
     */
    static async exportZip(frames) {
        if (!frames || frames.length === 0) {
            console.warn('[导出] 没有可导出的数据');
            alert('没有数据可以导出。请先在模拟中采集数据（按 C 键采集）。');
            return;
        }

        console.log(`[导出] 正在打包 ${frames.length} 帧数据...`);

        // JSZip is loaded via CDN as a global
        const zip = new JSZip();

        // Manifest — all numeric data (without embedded images)
        const manifest = frames.map((f, i) => ({
            frameIndex: i,
            timestamp: f.timestamp,
            steering_angle: f.steering_angle,
            throttle: f.throttle,
            brake: f.brake,
            speed_kmh: f.speed_kmh,
            position: f.position,
            rotation: f.rotation,
            frame_file: `frames/frame_${String(i).padStart(5, '0')}.jpg`,
            mask_file: f.segmentation_mask ? `masks/mask_${String(i).padStart(5, '0')}.png` : null,
        }));

        zip.file('manifest.json', JSON.stringify(manifest, null, 2));

        // README
        zip.file('README.txt',
            '神经驾驶 NEURODRIVE — 自动驾驶数据集\n' +
            '==========================================\n\n' +
            `帧数: ${frames.length}\n` +
            `导出时间: ${new Date().toISOString()}\n\n` +
            '文件结构:\n' +
            '  manifest.json — 每帧的数值数据（转向、速度、位置等）\n' +
            '  frames/       — 渲染帧 (JPEG)\n' +
            '  masks/        — 语义分割掩码 (PNG)\n\n' +
            '标签颜色:\n' +
            '  紫色 #804080 — 道路\n' +
            '  灰色 #808080 — 建筑\n' +
            '  蓝色 #4080c0 — 天空\n' +
            '  黄色 #c0c000 — 霓虹灯/标志\n' +
            '  青色 #00c0c0 — 车辆\n'
        );

        // Frames folder
        const framesFolder = zip.folder('frames');
        const masksFolder = zip.folder('masks');

        for (let i = 0; i < frames.length; i++) {
            const f = frames[i];
            const paddedIdx = String(i).padStart(5, '0');

            // Frame image
            if (f.frame) {
                const imgData = f.frame.split(',')[1]; // strip data:image/jpeg;base64,
                framesFolder.file(`frame_${paddedIdx}.jpg`, imgData, { base64: true });
            }

            // Segmentation mask (ImageData or legacy base64 string)
            if (f.segmentation_mask) {
                if (f.segmentation_mask instanceof ImageData) {
                    const tmpCanvas = document.createElement('canvas');
                    tmpCanvas.width = f.segmentation_mask.width;
                    tmpCanvas.height = f.segmentation_mask.height;
                    tmpCanvas.getContext('2d').putImageData(f.segmentation_mask, 0, 0);
                    const maskData = tmpCanvas.toDataURL('image/png').split(',')[1];
                    masksFolder.file(`mask_${paddedIdx}.png`, maskData, { base64: true });
                } else {
                    const maskData = f.segmentation_mask.split(',')[1];
                    masksFolder.file(`mask_${paddedIdx}.png`, maskData, { base64: true });
                }
            }
        }

        // Generate and download
        try {
            const blob = await zip.generateAsync({
                type: 'blob',
                compression: 'DEFLATE',
                compressionOptions: { level: 6 },
            });

            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `neurodrive_data_${Date.now()}.zip`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            console.log(`[导出] 完成 — 文件大小: ${(blob.size / 1024 / 1024).toFixed(2)} MB`);
        } catch (err) {
            console.error('[导出] 打包失败:', err);
            alert('导出失败: ' + err.message);
        }
    }
}
