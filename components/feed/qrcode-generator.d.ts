declare module'qrcode-generator'{
 interface QRCode {
 addData(data: string, mode?: string): void;
 make(): void;
 getModuleCount(): number;
 isDark(row: number, col: number): boolean;
 createDataURL(cellSize?: number, margin?: number): string;
 createSvgTag(opts?: { cellSize?: number; margin?: number; scalable?: boolean }): string;
 }
 type ErrorCorrectionLevel ='L'|'M'|'Q'|'H';
 function qrcode(typeNumber: number, errorCorrectionLevel: ErrorCorrectionLevel): QRCode;
 export default qrcode;
}
