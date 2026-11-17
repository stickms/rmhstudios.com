import { createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import FieldPage from '@/components/rmh-research/FieldPage';
import { fieldMeta } from '@/lib/rmh-research/meta.server';
import { researchCardPath } from '@/lib/rmh-research/og';
import { buildMeta, buildCanonical } from '@/lib/seo';

// The field's name comes from the server: the field table would otherwise sit in
// the client entry for every page (lib/rmh-research/meta.server.ts).
const fetchFieldMeta = createServerFn({ method: 'GET' })
  .validator((id: string) => id)
  .handler(({ data }) => {
    const meta = fieldMeta(data);
    if (!meta) throw notFound();
    return meta;
  });

export const Route = createFileRoute('/rmh-research/fields/$fieldId')({
  // `loader` before `head`, so `head` sees its type.
  loader: ({ params }) => fetchFieldMeta({ data: params.fieldId }),
  head: ({ params, loaderData }) => {
    if (!loaderData) return { meta: [{ title: 'Fields — RMH Research' }] };
    const path = `/rmh-research/fields/${params.fieldId}`;
    return {
      meta: buildMeta({
        title: `${loaderData.title} — RMH Research`,
        description: loaderData.description,
        path,
        image: researchCardPath('field', params.fieldId),
      }),
      links: [buildCanonical(path)],
    };
  },
  component: FieldPage,
});
