'use client';

import type { ReactNode } from 'react';

export function PaperFigure({
  number,
  caption,
  children,
}: {
  number: number;
  caption: string;
  children: ReactNode;
}) {
  return (
    <div className="my-8">
      <div className="border border-gray-200 rounded p-4 bg-gray-50">
        {children}
      </div>
      <p className="text-center mt-2" style={{ fontSize: '10pt', fontStyle: 'italic', color: '#4b5563' }}>
        <strong>Figure {number}.</strong> {caption}
      </p>
    </div>
  );
}
