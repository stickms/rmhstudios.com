"use client";

import { MouseProvider } from "@/contexts/MouseContext";
import { ReactNode } from "react";

interface ProvidersProps {
  children: ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  return <MouseProvider>{children}</MouseProvider>;
}
