/**
 * Average the low-frequency (bass) bins of an FFT magnitude array into 0..1.
 * @param freq frequency-domain byte data from an AnalyserNode (0..255 per bin)
 * @param bassBins how many of the lowest bins count as "bass" (default 16)
 */
export function computeBeatEnergy(freq: Uint8Array<ArrayBufferLike>, bassBins = 16): number {
  const n = Math.min(bassBins, freq.length);
  if (n === 0) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += freq[i];
  return sum / n / 255;
}
