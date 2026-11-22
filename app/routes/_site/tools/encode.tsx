import { createFileRoute } from '@tanstack/react-router';
import { definePage } from '@/lib/route/define-page';
import { EncodeTool } from '@/components/toolbox/encode/EncodeTool';

export const Route = createFileRoute('/_site/tools/encode')({
  head: definePage({
    path: '/tools/encode',
    title: 'Base64, URL and HTML Encoder and Decoder | RMH Studios',
    description:
      'Encode and decode Base64, URL-safe Base64, percent-encoding, HTML entities and hex, as UTF-8, in your browser.',
  }),
  component: EncodeTool,
});
