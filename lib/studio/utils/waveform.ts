/**
 * Generate peak data from an AudioBuffer for waveform rendering.
 * Returns normalized min/max pairs for each segment.
 */
export function generatePeaks(
  buffer: AudioBuffer,
  numPeaks: number,
): { min: Float32Array; max: Float32Array } {
  const channelData = buffer.getChannelData(0);
  const samplesPerPeak = Math.floor(channelData.length / numPeaks);
  const min = new Float32Array(numPeaks);
  const max = new Float32Array(numPeaks);

  for (let i = 0; i < numPeaks; i++) {
    let lo = Infinity;
    let hi = -Infinity;
    const start = i * samplesPerPeak;
    const end = Math.min(start + samplesPerPeak, channelData.length);

    for (let j = start; j < end; j++) {
      const val = channelData[j];
      if (val < lo) lo = val;
      if (val > hi) hi = val;
    }

    min[i] = lo === Infinity ? 0 : lo;
    max[i] = hi === -Infinity ? 0 : hi;
  }

  return { min, max };
}

/**
 * Draw a waveform onto a canvas context.
 */
export function drawWaveform(
  ctx: CanvasRenderingContext2D,
  peaks: { min: Float32Array; max: Float32Array },
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
): void {
  const midY = y + height / 2;
  const halfHeight = height / 2;
  const step = width / peaks.min.length;

  ctx.fillStyle = color;
  ctx.globalAlpha = 0.7;

  for (let i = 0; i < peaks.min.length; i++) {
    const px = x + i * step;
    const minVal = peaks.min[i] * halfHeight;
    const maxVal = peaks.max[i] * halfHeight;
    const barY = midY - maxVal;
    const barH = maxVal - minVal;
    ctx.fillRect(px, barY, Math.max(step - 0.5, 1), Math.max(barH, 1));
  }

  ctx.globalAlpha = 1;
}
