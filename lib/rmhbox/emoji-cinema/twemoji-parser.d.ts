declare module 'twemoji-parser' {
  interface TwemojiEntity {
    url: string;
    indices: [number, number];
    text: string;
    type: string;
  }
  export function parse(text: string, options?: { assetType?: string; buildUrl?: (codepoints: string, assetType: string) => string }): TwemojiEntity[];
  export function toCodePoints(unicodeSurrogates: string): string[];
}
