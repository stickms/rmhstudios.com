import { useTranslation } from 'react-i18next';
import { CardPicture } from '@/components/study/CardPicture';
import { OcclusionAnnouncement, OcclusionPicture } from '@/components/study/OcclusionReview';
import type { CardImage } from '@/lib/study/card-images';
import type { OcclusionReviewData } from '@/lib/study/occlusion';

/**
 * The picture of a practice-test question: an ordinary card picture, or (for an occlusion card) the picture with the
 * asked mask covered, and for a screen reader which part is covered (s09-03).
 */
export function PromptPicture({ image, occlusion }: { image: CardImage; occlusion?: OcclusionReviewData | undefined }) {
  if (!occlusion) return <CardPicture image={image} eager />;
  return (
    <div className="flex flex-col items-center gap-1">
      <OcclusionPicture image={image} data={occlusion} reveal={false} />
      <OcclusionAnnouncement data={occlusion} />
    </div>
  );
}

/** The prompt text of a question: an occlusion card with no prompt of its own asks "Name the covered part". */
export function useQuestionPrompt(question: {
  prompt: string;
  promptOcclusion?: OcclusionReviewData | undefined;
}): string {
  const { t } = useTranslation('occlusion-cards');
  return question.promptOcclusion && question.prompt.trim() === ''
    ? t('default-prompt', { defaultValue: 'Name the covered part' })
    : question.prompt;
}
