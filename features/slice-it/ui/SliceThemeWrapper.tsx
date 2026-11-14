/**
 * Puts Slice It!'s theme tokens on a subtree.
 *
 * The game has one theme (`slice-it.css`): there is no light mode and nothing to
 * toggle, so this is only the scope that `--slice-*` and the Tailwind palette
 * overrides hang off. `contents` keeps it out of the layout.
 */
export function SliceThemeWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="slice-theme contents">
      {
        children
      }
    </div>
  );
}
