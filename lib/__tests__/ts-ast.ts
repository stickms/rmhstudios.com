/**
 * The TypeScript syntax-tree API the ratchet tests and a few scripts walk files with.
 *
 * `typescript` is 7.x (the native compiler), whose package has no JS compiler API. 7.1 added one in the
 * `typescript/sync` and `typescript/ast` entry points; it is installed as `typescript-js` (package.json), not as
 * `typescript`, so the compiler the repo type-checks with does not move with it. This module gives that API the
 * shape the tests were written against (`createSourceFile`, `forEachChild`, the `isX` guards, `SyntaxKind`), so a
 * test reads `import * as ts from './ts-ast'` and its AST walk is unchanged.
 *
 * Parsing happens in a helper process (typescript-go) that this module starts on the first call and shuts down when
 * the worker exits. `createSourceFile` is synchronous, so a test needs no `await`.
 */
import { API } from 'typescript-js/sync';
import * as ast from 'typescript-js/ast';

export * from 'typescript-js/ast';

type SourceFile = ast.SourceFile;
type Node = ast.Node;

let api: API | undefined;

function client(): API {
  if (!api) {
    api = new API({ cwd: process.cwd() });
    const stop = () => {
      api?.close();
      api = undefined;
    };
    process.once('exit', stop);
    process.once('beforeExit', stop);
  }
  return api;
}

/**
 * Parse `text` as `fileName` (the extension picks .ts / .tsx / .js). The arguments after `text` are the old
 * `createSourceFile(name, text, target, setParentNodes, scriptKind)` ones; they are accepted and ignored because the
 * parser always sets parents, targets the latest syntax and reads the script kind from the file name.
 */
export function createSourceFile(fileName: string, text: string, ..._legacy: unknown[]): SourceFile {
  return client().createSourceFile(fileName, text).sourceFile;
}

/** `ts.forEachChild(node, visit)`: visit each child, stopping at (and returning) the first truthy result. */
export function forEachChild<T>(node: Node, visit: (child: Node) => T | undefined): T | undefined {
  return node.forEachChild(visit as (child: Node) => T | undefined);
}

/** Missing from `typescript/ast`: a string literal, or a template literal with no substitutions. */
export function isStringLiteralLike(node: Node): node is ast.StringLiteral | ast.NoSubstitutionTemplateLiteral {
  return ast.isStringLiteral(node) || ast.isNoSubstitutionTemplateLiteral(node);
}

/** Called `isParameterDeclaration` in `typescript/ast`. */
export const isParameter = ast.isParameterDeclaration;
