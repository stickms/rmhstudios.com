import { AppError } from '@/lib/errors/codes';

/**
 * The model answered, and what it answered cannot be read as JSON (prose, or JSON cut off at the token limit). An
 * `AI_UNAVAILABLE` with the code's fixed message and nothing from the reply: the parser's own error quotes the text it
 * choked on, which for the import is the model's echo of a member's file.
 */
export class UnreadableReplyError extends AppError {
  constructor() {
    super('AI_UNAVAILABLE');
    this.name = 'UnreadableReplyError';
  }
}
