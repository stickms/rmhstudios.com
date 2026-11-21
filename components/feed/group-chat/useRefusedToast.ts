import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';

/** Tell the owner how many people a create or add left out: a count, never a reason. */
export function useRefusedToast(): (
  refused: number,
) => void {
  const {
    t,
  } =
    useTranslation(
      'group-chat-admin',
    );
  return (
    refused,
  ) => {
    if (
      refused <=
      0
    )
      return;
    toast.info(
      t(
        'refused-count',
        {
          count:
            refused,
          defaultValue_one:
            '{{count}} person could not be added',
          defaultValue_other:
            '{{count}} people could not be added',
        },
      ),
    );
  };
}
