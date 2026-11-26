import { useTranslation } from 'react-i18next';

/** The line under a discussion composer that says `@` mentions a member; the field points at it by `id`. */
export function MentionHint({ id }: { id: string }) {
  const { t } = useTranslation('thread-mentions');
  return (
    <p id={id} className="stm-muted">
      {t('composer-hint', { defaultValue: 'Type @ to mention a member. They are told once.' })}
    </p>
  );
}
