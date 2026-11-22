/**
 * The element Studio dialogs portal into. The `--app-*` tokens are defined on the app root, so an overlay portalled to
 * `<body>` would lose them; this keeps it inside. Undefined (the default, `<body>`) before the page has mounted.
 */
export function appRoot(): HTMLElement | undefined {
  if (typeof document === 'undefined') return undefined;
  return document.querySelector<HTMLElement>('.app-theme') ?? undefined;
}
