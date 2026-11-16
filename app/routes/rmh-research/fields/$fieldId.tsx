import { createFileRoute, notFound } from '@tanstack/react-router';
import FieldPage from '@/components/rmh-research/FieldPage';
import { getField, isFieldId } from '@/lib/rmh-research/fields';
import { buildMeta, buildCanonical } from '@/lib/seo';

export const Route = createFileRoute('/rmh-research/fields/$fieldId')({
  loader: ({ params }) => {
    if (!isFieldId(params.fieldId)) throw notFound();
  },
  head: ({ params }) => {
    const path = `/rmh-research/fields/${params.fieldId}`;
    if (!isFieldId(params.fieldId)) return { meta: [{ title: 'Fields — RMH Research' }] };
    const field = getField(params.fieldId);
    return {
      meta: buildMeta({
        title: `${field.name} — RMH Research`,
        description: `${field.name} at RMH Research: the papers, the people and the field's most resonant work.`,
        path,
      }),
      links: [buildCanonical(path)],
    };
  },
  component: FieldPage,
});
