import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import Highlight from '@tiptap/extension-highlight';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import CharacterCount from '@tiptap/extension-character-count';
import Image from '@tiptap/extension-image';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import { common, createLowlight } from 'lowlight';
import type { AnyExtension } from '@tiptap/react';

const lowlight = createLowlight(common);

interface CreateExtensionsOptions {
  placeholder?: string;
}

export function createDocsExtensions({
  placeholder = 'Start typing your document...',
}: CreateExtensionsOptions = {}): AnyExtension[] {
  const extensions: AnyExtension[] = [
    StarterKit.configure({
      codeBlock: false, // We use CodeBlockLowlight instead
      // history is enabled by default in StarterKit (undo/redo)
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Table.configure({ resizable: true }),
    TableRow,
    TableCell,
    TableHeader,
    Highlight.configure({ multicolor: true }),
    TextStyle,
    Color,
    Underline,
    TextAlign.configure({
      types: ['heading', 'paragraph'],
    }),
    Link.configure({ openOnClick: false }),
    Image,
    CharacterCount,
    CodeBlockLowlight.configure({ lowlight }),
    Placeholder.configure({ placeholder }),
  ];

  return extensions;
}
