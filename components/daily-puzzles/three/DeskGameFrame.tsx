// components/daily-puzzles/three/DeskGameFrame.tsx
'use client';

import { Html } from '@react-three/drei';
import { useTranslation } from 'react-i18next';
import { Button3D } from './ui3d/Button3D';
import { PAGE_H } from './Newspaper';
import '../desk-newsprint.css';

export function DeskGameFrame({ children, onBack }: { children: React.ReactNode; onBack: () => void }) {
  const { t } = useTranslation('c-daily-puzzles');
  return (
    <group>
      {/* Game UI mapped onto the page surface, lying flat (face up). */}
      <group rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <Html
          transform
          occlude
          distanceFactor={6}
          position={[0, -0.3, 0.03]}
          style={{ pointerEvents: 'auto' }}
        >
          <div className="desk-newsprint">{children}</div>
        </Html>
      </group>
      {/* 3D back button floating above the page's top edge (billboarded). */}
      <Button3D
        label={t('back-to-front-page', { defaultValue: '← Front page' })}
        onClick={onBack}
        width={2}
        height={0.5}
        fontSize={34}
        color="#8fb0dc"
        position={[0, 0.4, PAGE_H / 2 + 0.6]}
      />
    </group>
  );
}
