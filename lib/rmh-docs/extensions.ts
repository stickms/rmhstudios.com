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
import Collaboration from '@tiptap/extension-collaboration';
import { common, createLowlight } from 'lowlight';
import type * as Y from 'yjs';
import type { WebsocketProvider } from 'y-websocket';
import type { AnyExtension } from '@tiptap/react';

const lowlight = createLowlight(common);

interface CreateExtensionsOptions {
  yDoc: Y.Doc;
  provider: WebsocketProvider | null;
  userName: string;
  userColor: string;
  placeholder?: string;
}

export function createDocsExtensions({
  yDoc,
  provider,
  userName,
  userColor,
  placeholder = 'Start typing your document...',
}: CreateExtensionsOptions): AnyExtension[] {
  const extensions: AnyExtension[] = [
    StarterKit.configure({
      codeBlock: false, // We use CodeBlockLowlight instead
      undoRedo: false, // Collaboration extension handles undo/redo
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
    // Always include Collaboration — it uses Y.Doc directly and handles sync + undo/redo.
    // The Y.Doc is always available; the WebSocket provider syncs it when connected.
    Collaboration.configure({
      document: yDoc,
    }),
  ];

  // Set awareness state for cursor display when provider is connected
  if (provider) {
    provider.awareness.setLocalStateField('user', {
      name: userName,
      color: userColor,
    });
  }

  return extensions;
}
