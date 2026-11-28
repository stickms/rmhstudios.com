import path from 'node:path';
import { FRAMER_MOTION_INTERNALS } from './framer-motion-internals.mjs';
import { I18N_RUNTIME_ALIASES } from './i18n-runtime-aliases.mjs';

export const workspaceAliases = {
  '@': import.meta.dirname,
  '@features': path.join(import.meta.dirname, 'features'),
};

export const uiTestAliases = {
  ...FRAMER_MOTION_INTERNALS,
  ...I18N_RUNTIME_ALIASES,
  ...workspaceAliases,
};
