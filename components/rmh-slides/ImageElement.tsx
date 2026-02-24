'use client';

import { Image as ImageIcon } from 'lucide-react';
import type { SlideElement } from './types';

interface Props {
  element: SlideElement;
}

export default function ImageElement({ element }: Props) {
  const url = element.content;
  const objectFit = element.style.objectFit || 'cover';

  if (!url) {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: 'rgba(255,255,255,0.05)',
          border: '2px dashed rgba(255,255,255,0.15)',
          borderRadius: element.style.borderRadius ? `${element.style.borderRadius}px` : '4px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          color: 'rgba(255,255,255,0.3)',
        }}
      >
        <ImageIcon size={32} />
        <span style={{ fontSize: '13px' }}>No image</span>
      </div>
    );
  }

  return (
    <img
      src={url}
      alt=""
      draggable={false}
      style={{
        width: '100%',
        height: '100%',
        objectFit,
        borderRadius: element.style.borderRadius ? `${element.style.borderRadius}px` : '0',
        opacity: element.style.opacity !== undefined ? element.style.opacity : 1,
        display: 'block',
      }}
    />
  );
}
