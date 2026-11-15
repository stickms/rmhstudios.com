/**
 * The path template a route file under `app/routes/api` answers (TanStack's file-name
 * rules: `.` separates segments, `[.]` is a literal dot, `index` is the directory).
 * Pure, so the server (`internal-dispatch.server.ts`) and the tooling
 * (`route-sources.ts`) share one spelling.
 *
 * `/app/routes/api/tf2-hud/$id.download.ts` -> `/api/tf2-hud/$id/download`.
 */
export function templateOfRouteFile(
  file: string,
): string {
  // An escaped literal dot (`races[.]csv`) is not a path separator: split around it.
  return file
    .replace(
      /^\/?app\/routes/,
      '',
    )
    .replace(
      /\.ts$/,
      '',
    )
    .split(
      '[.]',
    )
    .map(
      (
        part,
      ) =>
        part.replace(
          /\./g,
          '/',
        ),
    )
    .join(
      '.',
    )
    .replace(
      /\/index$/,
      '',
    );
}
