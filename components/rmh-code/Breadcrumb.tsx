'use client';

import type { FileMeta, ProjectMeta } from './utils';

interface BreadcrumbProps {
  project: ProjectMeta | null;
  file: FileMeta | null;
  isLocal?: boolean;
  localDirName?: string;
}

export default function Breadcrumb({ project, file, isLocal, localDirName }: BreadcrumbProps) {
  if (!file) return null;

  const segments = file.path.split('/');
  const rootLabel = isLocal ? localDirName : project?.name;

  return (
    <div className="flex items-center h-6 px-3 bg-[#1e1e1e] border-b border-[#252526] text-[11px] select-none shrink-0 overflow-x-auto scrollbar-none">
      {rootLabel && (
        <>
          <span className="text-[#cccccc] whitespace-nowrap">{rootLabel}</span>
          <span className="mx-1 text-[#555]">›</span>
        </>
      )}
      {segments.map((seg, i) => {
        const isLast = i === segments.length - 1;
        return (
          <span key={i} className="flex items-center shrink-0">
            <span className={isLast ? 'text-[#cccccc]' : 'text-[#858585]'}>
              {seg}
            </span>
            {!isLast && <span className="mx-1 text-[#555]">›</span>}
          </span>
        );
      })}
    </div>
  );
}
