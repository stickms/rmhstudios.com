/**
 * The rule behind `field-names.test.ts`: which form fields have an accessible name, read from the syntax tree.
 *
 * A field is NAMED when, by syntax and never by text search, one of these holds:
 *  - it has a non-empty `aria-label`, or an `aria-labelledby` that names an `id` that exists in the same file (a
 *    literal token, or the same expression text as an `id={...}`): a dangling reference names nothing;
 *  - it has an `id` that a `<label htmlFor>` / `<Label htmlFor>` in the same file names (the same literal, or the
 *    same expression text);
 *  - it sits inside a `<label>` or `<Label>` element in the same JSX tree;
 *  - it sits inside a component that renders a `<label>` around its children (a "label wrapper", found in the same
 *    file or listed in `SHARED_LABEL_MODULES`), or a component that renders `<label htmlFor>` is given the same
 *    `htmlFor` as the field's `id` (a "label component");
 *  - it is a primitive given a `label` prop the primitive renders as its name (see `LABEL_PROP_PRIMITIVES`);
 *  - it is `type="hidden"`, `submit`, `button` or `reset`, or is a `type="file"` input no reader reaches (`hidden` or
 *    `aria-hidden`: the file inputs a visible button opens). `aria-hidden` on any other field leaves it focusable and
 *    unnamed, so it does not count.
 *
 * A placeholder, a `title`, a comment and a label in another file do not name a field.
 */
import { readFileSync } from 'node:fs';
import * as ts from './ts-ast';

/** Native elements that are form fields. */
const NATIVE_FIELDS = new Set(['input', 'textarea', 'select']);

/** The site's field primitives (`components/ui/`), checked at their call sites. */
const PRIMITIVE_FIELDS = new Set(['Input', 'Textarea', 'Select', 'SearchField', 'Switch', 'Slider', 'Checkbox']);

/**
 * Components outside `components/ui/` that are a field with its props passed straight through (a native field that
 * spreads `{...props}` / `{...rest}` is their definition and is exempt, like a primitive), so their call sites are
 * checked instead.
 */
export const PASS_THROUGH_FIELDS = [
  'MentionTextarea',
  'GhostTextArea',
  'HandleInput',
  'TextField',
  'SelectField',
  // RMH Med Schools controls (features/medschools/ui/controls).
  'MedInput',
  'MedSearch',
  'MedSelect',
  'MedTextarea',
];

/**
 * Primitives whose `label` prop is rendered as the field's name, each with the line that renders it. None of the
 * current primitives does: a call site names the field with `aria-label`, `aria-labelledby` or a `Label`.
 */
export const LABEL_PROP_PRIMITIVES: Record<string, string> = {};

/**
 * Modules whose exported components are label wrappers or label components, used by fields in other files. The test
 * proves each one still renders a label (`discoverLabelComponents` must find something in it).
 */
export const SHARED_LABEL_MODULES: Record<string, string> = {
  'features/rmhcharacters/ui/controls': 'features/rmhcharacters/ui/controls.tsx',
  'components/feed/profile-edit/FieldHeader': 'components/feed/profile-edit/FieldHeader.tsx',
};

/**
 * Components that render the `id` they are given as a prop on a heading (a field in their children is named by it with
 * `aria-labelledby`), each with the prop and the file whose test-proved line renders it.
 */
export const ID_PROPS: Record<string, string> = { SettingsSection: 'titleId' };
export const ID_PROP_FILES: Record<string, string> = { SettingsSection: 'components/settings/SettingsSection.tsx' };

const NO_NAME_INPUT_TYPES = new Set(['hidden', 'submit', 'button', 'reset', 'image']);

export interface UnnamedField {
  tag: string;
  line: number;
}

type Opening = ts.JsxOpeningElement | ts.JsxSelfClosingElement;

function tagName(node: Opening): string {
  return node.tagName.getText();
}

function attrs(node: Opening): ts.JsxAttributeLike[] {
  return [...node.attributes.properties];
}

function findAttr(node: Opening, name: string): ts.JsxAttribute | undefined {
  for (const a of attrs(node)) if (ts.isJsxAttribute(a) && a.name.getText() === name) return a;
  return undefined;
}

/** The text of an attribute's value: the literal's text, or the expression's source text. `null` when absent. */
function attrValueText(attr: ts.JsxAttribute | undefined): { literal: boolean; text: string } | null {
  if (!attr?.initializer) return null;
  const init = attr.initializer;
  if (ts.isStringLiteral(init)) return { literal: true, text: init.text };
  if (ts.isJsxExpression(init) && init.expression) {
    const e = init.expression;
    if (ts.isStringLiteralLike(e)) return { literal: true, text: e.text };
    return { literal: false, text: e.getText() };
  }
  return null;
}

/** A non-empty name: not absent, not an empty literal, not `undefined` / `null` / `false`. */
function hasText(attr: ts.JsxAttribute | undefined): boolean {
  const v = attrValueText(attr);
  if (!v) return false;
  if (v.literal) return v.text.trim() !== '';
  return !['undefined', 'null', 'false', "''", '""', '``'].includes(v.text.trim());
}

function isLabelTag(name: string): boolean {
  return name === 'label' || name === 'Label';
}

function inLabel(node: ts.Node, wrappers: Set<string>): boolean {
  for (let p = node.parent; p; p = p.parent) {
    if (ts.isJsxElement(p)) {
      const t = tagName(p.openingElement);
      if (isLabelTag(t) || wrappers.has(t)) return true;
    }
    // A field passed as a prop (`control={<select />}`) to a wrapper.
    if (ts.isJsxOpeningElement(p) || ts.isJsxSelfClosingElement(p)) {
      if (wrappers.has(tagName(p))) return true;
    }
  }
  return false;
}

/** The `id` of a field, normalised so a literal and an expression compare by their own text. */
function key(v: { literal: boolean; text: string }): string {
  return `${v.literal ? 'lit' : 'expr'}:${v.text}`;
}

export interface LabelComponents {
  /** Components that render a `<label>` around `{children}` / `{control}`: a field inside one is named. */
  wrappers: Set<string>;
  /** Components that render `<label htmlFor>`: given the field's `id` as `htmlFor`, they name it. */
  labels: Set<string>;
}

function isComponentName(n: string | undefined): n is string {
  return !!n && /^[A-Z]/.test(n);
}

function labelHasChildrenSlot(label: ts.JsxElement): boolean {
  let found = false;
  const walk = (n: ts.Node): void => {
    if (ts.isJsxExpression(n) && n.expression) {
      const text = n.expression.getText();
      if (/^(props\.)?(children|control)$/.test(text)) found = true;
    }
    ts.forEachChild(n, walk);
  };
  label.children.forEach(walk);
  return found;
}

/** The components a file defines that render a label: by syntax, from the file's own component bodies. */
export function discoverLabelComponents(source: string, fileName = 'file.tsx'): LabelComponents {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const wrappers = new Set<string>();
  const labels = new Set<string>();
  const scanBody = (name: string, body: ts.Node): void => {
    const walk = (n: ts.Node): void => {
      if (ts.isJsxElement(n) && isLabelTag(tagName(n.openingElement))) {
        if (findAttr(n.openingElement, 'htmlFor')) labels.add(name);
        if (labelHasChildrenSlot(n)) wrappers.add(name);
      } else if (ts.isJsxSelfClosingElement(n) && isLabelTag(tagName(n)) && findAttr(n, 'htmlFor')) {
        labels.add(name);
      }
      ts.forEachChild(n, walk);
    };
    walk(body);
  };
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && isComponentName(node.name?.text) && node.body) {
      scanBody(node.name.text, node.body);
    } else if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      isComponentName(node.name.text) &&
      node.initializer &&
      (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
    ) {
      scanBody(node.name.text, node.initializer);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return { wrappers, labels };
}

/** Which names this file imports from a listed shared label module (alias or relative specifier). */
function importedLabelComponents(file: ts.SourceFile, fileName: string): LabelComponents {
  const wrappers = new Set<string>();
  const labels = new Set<string>();
  for (const stmt of file.statements) {
    if (!ts.isImportDeclaration(stmt) || !ts.isStringLiteral(stmt.moduleSpecifier)) continue;
    const spec = stmt.moduleSpecifier.text;
    let resolved = spec;
    if (spec.startsWith('@features/')) resolved = `features/${spec.slice('@features/'.length)}`;
    else if (spec.startsWith('@/')) resolved = spec.slice(2);
    else if (spec.startsWith('.')) {
      const dir = fileName.split('/').slice(0, -1);
      for (const part of spec.split('/')) {
        if (part === '..') dir.pop();
        else if (part !== '.') dir.push(part);
      }
      resolved = dir.join('/');
    }
    const target = SHARED_LABEL_MODULES[resolved];
    if (!target) continue;
    const found = discoverLabelComponents(readFileSync(target, 'utf8'), target);
    const bindings = stmt.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const el of bindings.elements) {
      const exported = (el.propertyName ?? el.name).text;
      if (found.wrappers.has(exported)) wrappers.add(el.name.text);
      if (found.labels.has(exported)) labels.add(el.name.text);
    }
  }
  return { wrappers, labels };
}

export function findUnnamedFields(source: string, fileName = 'file.tsx'): UnnamedField[] {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  const local = discoverLabelComponents(source, fileName);
  const imported = importedLabelComponents(file, fileName);
  const wrappers = new Set([...local.wrappers, ...imported.wrappers]);
  const labelComponents = new Set([...local.labels, ...imported.labels]);

  // Pass 1: every `htmlFor` a label or label component in this file names.
  const labelled = new Set<string>();
  const collect = (node: ts.Node): void => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      if (isLabelTag(tagName(node)) || labelComponents.has(tagName(node))) {
        const v = attrValueText(findAttr(node, 'htmlFor'));
        if (v && (v.literal ? v.text !== '' : true)) labelled.add(key(v));
      }
    }
    ts.forEachChild(node, collect);
  };
  collect(file);

  // Every `id` in the file: an `aria-labelledby` only names a field when it points at one of these.
  const ids = new Set<string>();
  const collectIds = (node: ts.Node): void => {
    if (ts.isJsxAttribute(node)) {
      const attrName = node.name.getText();
      const owner = ts.isJsxAttributes(node.parent) ? (node.parent.parent as Opening) : undefined;
      const isIdProp = !!owner && ID_PROPS[tagName(owner)] === attrName;
      if (attrName === 'id' || isIdProp) {
        const v = attrValueText(node);
        if (v) ids.add(key(v));
      }
    }
    ts.forEachChild(node, collectIds);
  };
  collectIds(file);
  const referencesExistingId = (attr: ts.JsxAttribute | undefined): boolean => {
    const v = attrValueText(attr);
    if (!v || !hasText(attr)) return false;
    if (v.literal)
      return v.text.split(/\s+/).some((token) => token !== '' && ids.has(key({ literal: true, text: token })));
    return ids.has(key(v));
  };

  const out: UnnamedField[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = tagName(node);
      const native = NATIVE_FIELDS.has(tag);
      if (native || PRIMITIVE_FIELDS.has(tag) || PASS_THROUGH_FIELDS.includes(tag)) {
        if (!isNamed(node, tag, native)) {
          out.push({ tag, line: file.getLineAndCharacterOfPosition(node.getStart()).line + 1 });
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  const isNamed = (node: Opening, tag: string, native: boolean): boolean => {
    if (tag === 'input' || tag === 'Input') {
      const type = attrValueText(findAttr(node, 'type'));
      if (type?.literal && NO_NAME_INPUT_TYPES.has(type.text)) return true;
    }
    const hiddenAttr = findAttr(node, 'hidden');
    if (hiddenAttr && attrValueText(hiddenAttr)?.text !== 'false') return true;
    // A native field or a field primitive that spreads its own props is a definition: the call site names it.
    if (
      (native || PRIMITIVE_FIELDS.has(tag)) &&
      attrs(node).some((a) => ts.isJsxSpreadAttribute(a) && /^(props|rest|inputProps)$/.test(a.expression.getText()))
    ) {
      return true;
    }
    const ariaHidden = attrValueText(findAttr(node, 'aria-hidden'));
    const fileType = attrValueText(findAttr(node, 'type'));
    if (
      findAttr(node, 'aria-hidden') &&
      (!ariaHidden || ariaHidden.text !== 'false') &&
      fileType?.literal &&
      fileType.text === 'file'
    ) {
      return true;
    }
    if (hasText(findAttr(node, 'aria-label'))) return true;
    if (referencesExistingId(findAttr(node, 'aria-labelledby'))) return true;
    const id = attrValueText(findAttr(node, 'id'));
    if (id && labelled.has(key(id))) return true;
    if (inLabel(node, wrappers)) return true;
    if (!native && LABEL_PROP_PRIMITIVES[tag] && hasText(findAttr(node, 'label'))) return true;
    return false;
  };

  visit(file);
  return out;
}

/**
 * The components a file defines that render a native field or a field primitive with their own props spread onto it
 * (`<input {...rest} />`, `<Select {...rest} />`). The scan treats that spread as the definition and checks the component's call sites
 * instead, which only works for names listed in `PASS_THROUGH_FIELDS`; the test compares the two.
 */
export function findPassThroughDefinitions(source: string, fileName = 'file.tsx'): string[] {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const names = new Set<string>();
  const owner = (node: ts.Node): string | undefined => {
    for (let p = node.parent; p; p = p.parent) {
      if (ts.isFunctionDeclaration(p) && isComponentName(p.name?.text)) return p.name?.text;
      if (ts.isVariableDeclaration(p) && ts.isIdentifier(p.name) && isComponentName(p.name.text)) return p.name.text;
    }
    return undefined;
  };
  const visit = (node: ts.Node): void => {
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      (NATIVE_FIELDS.has(tagName(node)) || PRIMITIVE_FIELDS.has(tagName(node)))
    ) {
      const spreads = attrs(node).some(
        (a) => ts.isJsxSpreadAttribute(a) && /^(props|rest|inputProps)$/.test(a.expression.getText()),
      );
      const name = spreads ? owner(node) : undefined;
      if (name) names.add(name);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return [...names];
}
