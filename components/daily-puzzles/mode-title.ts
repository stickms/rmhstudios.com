import { useTranslation } from 'react-i18next';

/** The translated name of a daily puzzle, by mode id (one literal `t()` per mode for the extractor). */
export function useModeTitle(): (
  id: string,
) => string {
  const {
    t,
  } =
    useTranslation(
      'daily-stats',
    );
  return (
    id,
  ) => {
    switch (
      id
    ) {
      case 'lights-out':
        return t(
          'mode-lights-out',
          {
            defaultValue:
              'Lights Out',
          },
        );
      case 'alibi':
        return t(
          'mode-alibi',
          {
            defaultValue:
              'Alibi',
          },
        );
      case 'spectrum':
        return t(
          'mode-spectrum',
          {
            defaultValue:
              'Spectrum',
          },
        );
      case 'outcast':
        return t(
          'mode-outcast',
          {
            defaultValue:
              'Outcast',
          },
        );
      case 'chainlink':
        return t(
          'mode-chainlink',
          {
            defaultValue:
              'Chainlink',
          },
        );
      case 'impostor':
        return t(
          'mode-impostor',
          {
            defaultValue:
              'Impostor',
          },
        );
      case 'globeset':
        return t(
          'mode-globeset',
          {
            defaultValue:
              'GlobeSet',
          },
        );
      default:
        return id;
    }
  };
}
