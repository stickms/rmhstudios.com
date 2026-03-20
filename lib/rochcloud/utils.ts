export function formatDuration(ms: number | null | undefined): string {
  if (!ms) return '0:00';
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function getArtworkUrl(url: string | null, size: 'small' | 'medium' | 'large' = 'medium'): string {
  if (!url) return '';
  const sizeMap = { small: 't67x67', medium: 't200x200', large: 't500x500' };
  return url.replace('-large', `-${sizeMap[size]}`);
}
