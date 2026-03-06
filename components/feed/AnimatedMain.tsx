import { DEFAULT_WIDTH } from '@/lib/layout-width';

interface AnimatedMainProps {
  children: React.ReactNode;
  className?: string;
  targetWidth?: number;
}

export function AnimatedMain({ children, className, targetWidth = DEFAULT_WIDTH }: AnimatedMainProps) {
  return (
    <main
      className={className}
      style={{ maxWidth: targetWidth }}
    >
      {children}
    </main>
  );
}
