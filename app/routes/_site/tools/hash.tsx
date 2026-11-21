import { createFileRoute } from '@tanstack/react-router';
import { definePage } from '@/lib/route/define-page';
import { HashTool } from '@/components/toolbox/hash/HashTool';

export const Route = createFileRoute('/_site/tools/hash')({
  head: definePage({
    path: '/tools/hash',
    title: 'Hash Generator and Checksum Verifier | RMH Studios',
    description:
      'MD5, SHA-1, SHA-256, SHA-384 and SHA-512 of text or a file, computed on your device, and a checksum check.',
  }),
  component: HashTool,
});
