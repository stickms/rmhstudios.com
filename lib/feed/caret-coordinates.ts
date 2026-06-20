/**
 * Compute the pixel coordinates of the caret inside a <textarea>, relative to
 * the textarea's own box. Used to anchor the mention/hashtag autocomplete popup
 * right under the token the user is typing.
 *
 * Works by rendering an invisible "mirror" div that copies every style that
 * affects text layout, slicing the value at the caret, and measuring a marker
 * span placed at the split point. Adapted from the well-known
 * textarea-caret-position technique (component/textarea-caret-position).
 */

const MIRRORED_PROPERTIES = [
  'boxSizing',
  'width',
  'height',
  'overflowX',
  'overflowY',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'borderStyle',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'fontStyle',
  'fontVariant',
  'fontWeight',
  'fontStretch',
  'fontSize',
  'fontSizeAdjust',
  'lineHeight',
  'fontFamily',
  'textAlign',
  'textTransform',
  'textIndent',
  'textDecoration',
  'letterSpacing',
  'wordSpacing',
  'tabSize',
  'whiteSpace',
  'wordWrap',
  'wordBreak',
] as const;

export interface CaretCoordinates {
  top: number;
  left: number;
  height: number;
}

export function getCaretCoordinates(element: HTMLTextAreaElement, position: number): CaretCoordinates {
  const div = document.createElement('div');
  div.id = '__mention-caret-mirror__';
  document.body.appendChild(div);

  const style = div.style;
  const computed = window.getComputedStyle(element);

  style.whiteSpace = 'pre-wrap';
  style.wordWrap = 'break-word';
  style.position = 'absolute';
  style.visibility = 'hidden';

  const writableStyle = style as unknown as Record<string, string>;
  for (const prop of MIRRORED_PROPERTIES) {
    writableStyle[prop] = computed.getPropertyValue(
      prop.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`),
    );
  }

  // Account for the scrollbar gutter on the real element.
  style.overflow = 'hidden';

  div.textContent = element.value.substring(0, position);

  const span = document.createElement('span');
  // A trailing zero-width character ensures the span has measurable height even
  // when the caret sits at the very end of the value.
  span.textContent = element.value.substring(position) || '.';
  div.appendChild(span);

  const coordinates: CaretCoordinates = {
    top: span.offsetTop + parseInt(computed.borderTopWidth, 10) - element.scrollTop,
    left: span.offsetLeft + parseInt(computed.borderLeftWidth, 10) - element.scrollLeft,
    height: parseInt(computed.lineHeight, 10) || parseInt(computed.fontSize, 10),
  };

  document.body.removeChild(div);
  return coordinates;
}
