'use client';

import { useCallback, useEffect, useState } from'react';
import { useTranslation } from'react-i18next';
import Cropper from'react-easy-crop';
import type { Area } from'react-easy-crop';
import {
 FlipHorizontal,
 FlipVertical,
 RotateCcw,
 RotateCw,
 X,
 ZoomIn,
 ZoomOut,
} from'lucide-react';
import { Button } from'@/components/ui/button';

interface ImageCropModalProps {
 imageSrc: string;
 onCropDone: (croppedBlob: Blob) => void;
 onCancel: () => void;
 aspect?: number;
 cropShape?:'rect'|'round';
}

export function ImageCropModal({
 imageSrc,
 onCropDone,
 onCancel,
 aspect = 1,
 cropShape ='round',
}: ImageCropModalProps) {
 const [crop, setCrop] = useState({ x: 0, y: 0 });
 const [zoom, setZoom] = useState(1);
 const [minZoom, setMinZoom] = useState(1);
 const [rotation, setRotation] = useState(0);
 const [flipH, setFlipH] = useState(false);
 const [flipV, setFlipV] = useState(false);
 const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
 const [saving, setSaving] = useState(false);
 const { t } = useTranslation('feed');

 // Close on Escape — the modal can already be dismissed by clicking the
 // backdrop, but keyboard users need a way out too.
 useEffect(() => {
 const onKey = (e: KeyboardEvent) => {
 if (e.key ==='Escape') onCancel();
 };
 window.addEventListener('keydown', onKey);
 return () => window.removeEventListener('keydown', onKey);
 }, [onCancel]);

 const onCropComplete = useCallback((_: Area, croppedPixels: Area) => {
 setCroppedAreaPixels(croppedPixels);
 }, []);

 // Compute minZoom so the full image can fit within the square crop area
 const onMediaLoaded = useCallback(
 (mediaSize: { naturalWidth: number; naturalHeight: number }) => {
 const { naturalWidth, naturalHeight } = mediaSize;
 if (naturalWidth && naturalHeight) {
 const min = Math.min(naturalWidth, naturalHeight);
 const max = Math.max(naturalWidth, naturalHeight);
 setMinZoom(min / max);
 }
 },
 [],
 );

 // Compose flip into the transform AFTER translate/rotate/scale so that
 // drag interactions stay non-inverted (drag right = image moves right)
 // while the image content visually mirrors.
 const flipTransform =
 flipH || flipV
 ? `translate(${crop.x}px, ${crop.y}px) rotate(${rotation}deg) scale(${zoom})${flipH ?'scaleX(-1)':''}${flipV ?'scaleY(-1)':''}`
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
 <div className="fixed inset-0 z-[300] flex items-center justify-center p-0 sm:p-4">
 <button
 type="button"
 tabIndex={-1}
 className="absolute inset-0 bg-black/60"
 onClick={onCancel}
 aria-label={t('close-crop-modal', { defaultValue:'Close crop modal'})}
 />

 <div
 data-mobile-fullscreen="true"
 role="dialog"
 aria-modal="true"
 aria-labelledby="image-crop-title"
 className="bg-site-surface border border-site-border shadow-xs relative flex h-dvh w-dvw max-w-none flex-col overflow-y-auto rounded-none pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] sm:h-auto sm:max-h-[90dvh] sm:w-full sm:max-w-lg sm:rounded-site sm:p-0"
 >
 {/* Header */}
 <div className="flex items-center justify-between px-4 py-3 border-b border-site-border shrink-0">
 <h2 id="image-crop-title"className="font-bold text-site-text">
 {t('crop-image', { defaultValue:'Crop Image'})}
 </h2>
 <button
 type="button"
 onClick={onCancel}
 className="p-2.5 rounded-site-sm text-site-text-muted hover:text-site-text hover:bg-site-surface transition-colors"
 aria-label={t('close-crop-modal', { defaultValue:'Close crop modal'})}
 >
 <X className="w-5 h-5"aria-hidden />
 </button>
 </div>

 {/* Crop area */}
 <div className="relative min-h-64 w-full flex-1 bg-black/90 sm:h-80 sm:flex-none">
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
 <ZoomOut className="w-4 h-4 text-site-text-dim shrink-0"/>
 <input
 type="range"
 min={minZoom}
 max={3}
 step={0.05}
 value={zoom}
 onChange={(e) => setZoom(Number(e.target.value))}
 className="flex-1 accent-site-accent"
 />
 <ZoomIn className="w-4 h-4 text-site-text-dim shrink-0"/>
 </div>

 {/* Action buttons */}
 <div className="flex items-center justify-center gap-2">
 <button
 type="button"
 onClick={() => setRotation((r) => r - 90)}
 className="p-3 rounded-site-sm text-site-text-muted hover:text-site-text hover:bg-site-surface transition-colors"
 title={t('rotate-left', { defaultValue:'Rotate left'})}
 aria-label={t('rotate-left', { defaultValue:'Rotate left'})}
 >
 <RotateCcw className="w-5 h-5"/>
 </button>
 <button
 type="button"
 onClick={() => setRotation((r) => r + 90)}
 className="p-3 rounded-site-sm text-site-text-muted hover:text-site-text hover:bg-site-surface transition-colors"
 title={t('rotate-right', { defaultValue:'Rotate right'})}
 aria-label={t('rotate-right', { defaultValue:'Rotate right'})}
 >
 <RotateCw className="w-5 h-5"/>
 </button>
 <button
 type="button"
 onClick={() => setFlipH((f) => !f)}
 className={`p-3 rounded-site-sm transition-colors ${flipH ?'text-site-accent bg-site-accent/10':'text-site-text-muted hover:text-site-text hover:bg-site-surface'}`}
 title={t('flip-horizontal', { defaultValue:'Flip horizontal'})}
 aria-label={t('flip-horizontal', { defaultValue:'Flip horizontal'})}
 >
 <FlipHorizontal className="w-5 h-5"/>
 </button>
 <button
 type="button"
 onClick={() => setFlipV((f) => !f)}
 className={`p-3 rounded-site-sm transition-colors ${flipV ?'text-site-accent bg-site-accent/10':'text-site-text-muted hover:text-site-text hover:bg-site-surface'}`}
 title={t('flip-vertical', { defaultValue:'Flip vertical'})}
 aria-label={t('flip-vertical', { defaultValue:'Flip vertical'})}
 >
 <FlipVertical className="w-5 h-5"/>
 </button>
 </div>
 </div>

 {/* Actions */}
 <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-site-border shrink-0">
 <Button variant="ghost"onClick={onCancel}>
 {t('cancel', { defaultValue:'Cancel'})}
 </Button>
 <Button variant="accent"disabled={saving} onClick={handleSave}>
 {saving
 ? t('applying', { defaultValue:'Applying...'})
 : t('apply', { defaultValue:'Apply'})}
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
 const { width: bBoxWidth, height: bBoxHeight } = getRotatedSize(
 image.width,
 image.height,
 rotation,
 );

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
 croppedCanvas.toBlob((blob) => resolve(blob),'image/png', 1);
 });
}

function createImage(url: string): Promise<HTMLImageElement> {
 return new Promise((resolve, reject) => {
 const image = new Image();
 image.addEventListener('load', () => resolve(image));
 image.addEventListener('error', (error) => reject(error));
 if (!url.startsWith('blob:')) {
 image.crossOrigin ='anonymous';
 }
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
