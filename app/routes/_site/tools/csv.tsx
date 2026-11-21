import { createFileRoute } from '@tanstack/react-router';
import { definePage } from '@/lib/route/define-page';
import { CsvTool } from '@/components/toolbox/csv/CsvTool';

export const Route = createFileRoute('/_site/tools/csv')({
  head: definePage({
    path: '/tools/csv',
    title: 'CSV to JSON Converter | RMH Studios',
    description:
      'Convert CSV to JSON and JSON to CSV in your browser, with quoted fields, any delimiter and a table preview.',
  }),
  component: CsvTool,
});
