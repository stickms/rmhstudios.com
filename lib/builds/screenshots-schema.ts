import { z } from 'zod';
import {
  MAX_SCREENSHOTS,
  SCREENSHOT_DESCRIPTION_MAX,
  SCREENSHOT_DIMENSION_MAX,
  SCREENSHOT_URL_MAX,
} from '@/lib/builds/screenshots';

/**
 * The ordered list of a build's screenshots, replaced whole by one PUT. A description may arrive empty so the server
 * can answer `DESCRIPTION_REQUIRED` with the index (the form never sends one); length and shape are checked here.
 */
export const screenshotItem = z.object({
  url: z.string().trim().min(1).max(SCREENSHOT_URL_MAX),
  width: z.number().int().min(1).max(SCREENSHOT_DIMENSION_MAX),
  height: z.number().int().min(1).max(SCREENSHOT_DIMENSION_MAX),
  description: z.string().max(SCREENSHOT_DESCRIPTION_MAX),
});

export const saveScreenshotsBody = z.object({
  // One over the cap parses, so the server can say TOO_MANY itself instead of a generic validation error.
  screenshots: z.array(screenshotItem).max(MAX_SCREENSHOTS + 1),
});

export type SaveScreenshotsInput = z.infer<typeof saveScreenshotsBody>;
