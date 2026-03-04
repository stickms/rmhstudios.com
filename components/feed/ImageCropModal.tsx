'use client';

import { useCallback, useState } from 'react';
import Cropper from 'react-easy-crop';
import type { Area } from 'react-easy-crop';
import { FlipHorizontal, FlipVertical, RotateCcw, RotateCw, X, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ImageCropModalProps {
  imageSrc: string;
  onCropDone: (croppedBlob: Blob) => void;
  onCancel: () => void;
  aspect?: number;
  cropShape?: 'rect' | 'round';
}

export function ImageCropModal({ imageSrc, onCropDone, onCancel, aspect = 1, cropShape = 'round' }: ImageCropModalProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [minZoom, setMinZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);

  const onCropComplete = useCallback((_: Area, croppedPixels: Area) => {
    setCroppedAreaPixels(croppedPixels);
  }, []);

  // Compute minZoom so the full image can fit within the square crop area
  const onMediaLoaded = useCallback((mediaSize: { naturalWidth: number; naturalHeight: number }) => {
    const { naturalWidth, naturalHeight } = mediaSize;
    if (naturalWidth && naturalHeight) {
      const min = Math.min(naturalWidth, naturalHeight);
      const max = Math.max(naturalWidth, naturalHeight);
      setMinZoom(min / max);
    }
  }, []);

  // Compose flip into the transform AFTER translate/rotate/scale so that
  // drag interactions stay non-inverted (drag right = image moves right)
  // while the image content visually mirrors.
  const flipTransform = (flipH || flipV)
    ? `translate(${crop.x}px, ${crop.y}px) rotate(${rotation}deg) scale(${zoom})${flipH ? ' scaleX(-1)' : ''}${flipV ? ' scaleY(-1)' : ''}`
    : undefined;

  const handleSave = async () => {
    if (!croppedAreaPixels) return;
    setSaving(true);
    try {
      const blob = await getCroppedImg(imageSrc, croppedAreaPixels, rotation, flipH, flipV);
      if (blob) onCropDone(blob);
    } catch (e) {
      console.error('Crop failed:', e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div
        className="relative bg-site-bg border border-site-border rounded-2xl shadow-xl w-full max-w-lg flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-site-border shrink-0">
          <h2 className="font-bold text-site-text">Crop Image</h2>
          <button
            onClick={onCancel}
            className="p-1.5 rounded-lg text-site-text-muted hover:text-site-text hover:bg-site-surface transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Crop area */}
        <div className="relative w-full h-64 sm:h-80 bg-black/90 shrink-0">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            minZoom={minZoom}
            maxZoom={3}
            rotation={rotation}
            aspect={aspect}
            cropShape={cropShape}
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onRotationChange={setRotation}
            onCropComplete={onCropComplete}
            onMediaLoaded={onMediaLoaded}
            transform={flipTransform}
          />
        </div>

        {/* Controls */}
        <div className="px-4 py-3 space-y-3 border-t border-site-border shrink-0">
          {/* Zoom slider */}
          <div className="flex items-center gap-3">
            <ZoomOut className="w-4 h-4 text-site-text-dim shrink-0" />
            <input
              type="range"
              min={minZoom}
              max={3}
              step={0.05}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="flex-1 accent-site-accent"
            />
            <ZoomIn className="w-4 h-4 text-site-text-dim shrink-0" />
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-center gap-1 sm:gap-2">
            <button
              type="button"
              onClick={() => setRotation((r) => r - 90)}
              className="p-2 rounded-lg text-site-text-muted hover:text-site-text hover:bg-site-surface transition-colors"
              title="Rotate left"
            >
              <RotateCcw className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => setRotation((r) => r + 90)}
              className="p-2 rounded-lg text-site-text-muted hover:text-site-text hover:bg-site-surface transition-colors"
              title="Rotate right"
            >
              <RotateCw className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => setFlipH((f) => !f)}
              className={`p-2 rounded-lg transition-colors ${flipH ? 'text-site-accent bg-site-accent/10' : 'text-site-text-muted hover:text-site-text hover:bg-site-surface'}`}
              title="Flip horizontal"
            >
              <FlipHorizontal className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => setFlipV((f) => !f)}
              className={`p-2 rounded-lg transition-colors ${flipV ? 'text-site-accent bg-site-accent/10' : 'text-site-text-muted hover:text-site-text hover:bg-site-surface'}`}
              title="Flip vertical"
            >
              <FlipVertical className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-site-border shrink-0">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="accent" size="sm" disabled={saving} onClick={handleSave}>
            {saving ? 'Applying...' : 'Apply'}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Canvas-based image cropping with rotation and flip support. */
async function getCroppedImg(
  imageSrc: string,
  pixelCrop: Area,
  rotation: number,
  flipH: boolean,
  flipV: boolean,
): Promise<Blob | null> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const rotRad = (rotation * Math.PI) / 180;

  // Compute bounding box of rotated image
  const { width: bBoxWidth, height: bBoxHeight } = getRotatedSize(image.width, image.height, rotation);

  canvas.width = bBoxWidth;
  canvas.height = bBoxHeight;

  ctx.translate(bBoxWidth / 2, bBoxHeight / 2);
  ctx.rotate(rotRad);
  ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
  ctx.translate(-image.width / 2, -image.height / 2);
  ctx.drawImage(image, 0, 0);

  // Extract cropped area
  const croppedCanvas = document.createElement('canvas');
  const croppedCtx = croppedCanvas.getContext('2d');
  if (!croppedCtx) return null;

  croppedCanvas.width = pixelCrop.width;
  croppedCanvas.height = pixelCrop.height;

  croppedCtx.drawImage(
    canvas,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height,
  );

  return new Promise((resolve) => {
    croppedCanvas.toBlob(
      (blob) => resolve(blob),
      'image/png',
      1,
    );
  });
}

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', (error) => reject(error));
    image.src = url;
  });
}

function getRotatedSize(width: number, height: number, rotation: number) {
  const rotRad = (rotation * Math.PI) / 180;
  return {
    width: Math.abs(Math.cos(rotRad) * width) + Math.abs(Math.sin(rotRad) * height),
    height: Math.abs(Math.sin(rotRad) * width) + Math.abs(Math.cos(rotRad) * height),
  };
}
