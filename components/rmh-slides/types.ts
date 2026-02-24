export type ShapeType = 'rectangle' | 'circle' | 'triangle' | 'arrow' | 'line' | 'star';

export type TransitionType = 'none' | 'fade' | 'slide-left' | 'slide-right' | 'slide-up' | 'zoom';

export interface SlideElementStyle {
  fontSize?: number;
  fontFamily?: string;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  textAlign?: 'left' | 'center' | 'right';
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  borderRadius?: number;
  objectFit?: 'cover' | 'contain' | 'fill';
  opacity?: number;
}

export interface SlideElement {
  id: string;
  type: 'text' | 'image' | 'shape';
  x: number;       // percentage 0-100
  y: number;       // percentage 0-100
  width: number;   // percentage 0-100
  height: number;  // percentage 0-100
  rotation: number; // degrees
  content: string;  // text content (TipTap JSON string for text), image URL, or shape type
  zIndex: number;
  style: SlideElementStyle;
}

export interface SlideData {
  id: string;
  elements: SlideElement[];
  background: string;
  transition: TransitionType;
  notes: string;
  layout: string;
}

export interface SlideTheme {
  name: string;
  colors: {
    bg: string;
    text: string;
    accent: string;
    surface: string;
  };
  fontFamily: string;
}
