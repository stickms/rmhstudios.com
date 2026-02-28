import katex from 'katex';

/**
 * Pre-render a LaTeX formula to an HTML string using KaTeX.
 * Called at module-evaluation time so the HTML is baked into SSR output — no flicker.
 */
function render(formula: string, displayMode: boolean): string {
  return katex.renderToString(formula, { displayMode, throwOnError: false });
}

/** Inline math: renders inside a <span>. */
export function Tex({ math }: { math: string }) {
  return <span dangerouslySetInnerHTML={{ __html: render(math, false) }} />;
}

/** Display (block) math: renders inside a centered <div>. */
export function TexBlock({ math }: { math: string }) {
  return (
    <div
      className="my-4 overflow-x-auto text-center"
      dangerouslySetInnerHTML={{ __html: render(math, true) }}
    />
  );
}
