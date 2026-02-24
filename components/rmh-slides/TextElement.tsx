'use client';

import { useEffect, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import TiptapColor from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';
import Placeholder from '@tiptap/extension-placeholder';
import type { SlideElement } from './types';

interface Props {
  element: SlideElement;
  isEditing: boolean;
  onContentChange: (content: string) => void;
}

export default function TextElement({ element, isEditing, onContentChange }: Props) {
  const contentRef = useRef(element.content);
  const ignoreUpdateRef = useRef(false);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        codeBlock: false,
        code: false,
        horizontalRule: false,
        blockquote: false,
      }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TextStyle,
      TiptapColor,
      Placeholder.configure({ placeholder: 'Click to add text' }),
    ],
    content: element.content || '<p>Click to add text</p>',
    editable: isEditing,
    onUpdate: ({ editor }) => {
      if (ignoreUpdateRef.current) return;
      const html = editor.getHTML();
      contentRef.current = html;
      onContentChange(html);
    },
  });

  // Toggle editable state
  useEffect(() => {
    if (editor) {
      editor.setEditable(isEditing);
      if (isEditing) {
        setTimeout(() => editor.commands.focus('end'), 10);
      }
    }
  }, [isEditing, editor]);

  // Sync external content changes (from Y.js)
  useEffect(() => {
    if (!editor) return;
    if (element.content !== contentRef.current && !isEditing) {
      ignoreUpdateRef.current = true;
      editor.commands.setContent(element.content || '<p>Click to add text</p>', { emitUpdate: false });
      contentRef.current = element.content;
      setTimeout(() => { ignoreUpdateRef.current = false; }, 50);
    }
  }, [element.content, editor, isEditing]);

  const style = element.style;

  return (
    <div
      className="slides-tiptap-editor"
      style={{
        width: '100%',
        height: '100%',
        fontSize: style.fontSize ? `${style.fontSize}px` : '20px',
        fontFamily: style.fontFamily || 'inherit',
        color: style.color || '#ffffff',
        fontWeight: style.bold ? 700 : undefined,
        fontStyle: style.italic ? 'italic' : undefined,
        textAlign: style.textAlign || 'left',
        overflow: 'hidden',
        padding: '4px 8px',
        boxSizing: 'border-box',
      }}
    >
      {editor ? (
        <EditorContent editor={editor} />
      ) : (
        <div dangerouslySetInnerHTML={{ __html: element.content || '<p>Click to add text</p>' }} />
      )}
    </div>
  );
}
