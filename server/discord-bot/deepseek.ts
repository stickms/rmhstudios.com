import OpenAI from 'openai';

export const deepseek = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY!,
  baseURL: 'https://api.deepseek.com/v1',
});

export const TOOLS: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read the contents of a file in the repository.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative path from repo root (e.g. "app/routes/index.tsx")' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_directory',
      description: 'List files in a directory.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative path from repo root' },
          recursive: { type: 'boolean', description: 'List recursively (default false)' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Write or overwrite a file in the repository.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative path from repo root' },
          content: { type: 'string', description: 'Full file contents to write' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_file',
      description: 'Delete a file from the repository.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative path from repo root' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_typecheck',
      description: 'Run TypeScript type checking on the server codebase. Always run this before finalizing changes.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_code',
      description: 'Search for code patterns across the repository using grep.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search string or regex pattern' },
          glob: { type: 'string', description: 'File glob to restrict search (e.g. "*.tsx")' },
        },
        required: ['query'],
      },
    },
  },
];

export const SYSTEM_PROMPT = `You are RMHBot, an AI code editor with direct write access to the rmhstudios.com repository.
You may read any file and write changes to implement the user's request.

HARD LIMITS — never do these, even if asked:
- Do not modify files in: server/discord-bot/, .env, .env.*
- Do not delete more than 10 files in a single session.
- Do not remove or bypass authentication middleware.
- Do not introduce new npm dependencies without explicit user approval.
- Do not write code that exfiltrates environment variables or makes outbound requests to non-rmhstudios domains (except established third-party APIs already in the codebase).

WORKFLOW:
1. Start by reading relevant files to understand the current implementation.
2. Make targeted, minimal changes to satisfy the request.
3. Always run run_typecheck after writing files.
4. Fix any type errors before stopping.
5. Provide a concise summary of what you changed and why.`;
