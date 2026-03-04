const ESC = '\x1b';

export const color = {
  green: (s: string) => `${ESC}[32m${s}${ESC}[0m`,
  red: (s: string) => `${ESC}[31m${s}${ESC}[0m`,
  yellow: (s: string) => `${ESC}[33m${s}${ESC}[0m`,
  cyan: (s: string) => `${ESC}[36m${s}${ESC}[0m`,
  dim: (s: string) => `${ESC}[2m${s}${ESC}[0m`,
  bold: (s: string) => `${ESC}[1m${s}${ESC}[0m`,
  violet: (s: string) => `${ESC}[35m${s}${ESC}[0m`,
};

export function success(msg: string): void {
  console.log(color.green(`✓ ${msg}`));
}

export function error(msg: string): void {
  console.error(color.red(`✗ ${msg}`));
}

export function info(msg: string): void {
  console.log(color.cyan(`→ ${msg}`));
}

export function padEnd(str: string, len: number): string {
  return str.length >= len ? str.slice(0, len) : str + ' '.repeat(len - str.length);
}
