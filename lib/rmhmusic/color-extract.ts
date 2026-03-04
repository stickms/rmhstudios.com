'use client';

export async function extractDominantColors(imageUrl: string): Promise<[number, number, number][]> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve([[155, 122, 216]]); return; }

      ctx.drawImage(img, 0, 0, 64, 64);
      const data = ctx.getImageData(0, 0, 64, 64).data;

      const samples: [number, number, number][] = [];
      for (let i = 0; i < data.length; i += 16) {
        samples.push([data[i], data[i + 1], data[i + 2]]);
      }

      samples.sort((a, b) => (a[0] + a[1] + a[2]) - (b[0] + b[1] + b[2]));
      const len = samples.length;
      resolve([
        samples[Math.floor(len * 0.2)],
        samples[Math.floor(len * 0.5)],
        samples[Math.floor(len * 0.8)],
      ]);
    };
    img.onerror = () => resolve([[155, 122, 216]]);
    img.src = imageUrl;
  });
}
