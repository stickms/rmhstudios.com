import path from 'path';
import fs from 'fs/promises';
import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';
import { EmbedBuilder, type Attachment } from 'discord.js';
import type OpenAI from 'openai';

import { deepseek, TOOLS, SYSTEM_PROMPT } from './deepseek';
import {
  sessions,
  makeBranchName,
  isSessionLocked,
  type ConversationState,
} from './conversation';
import {
  REPO_PATH,
  createWorktree,
  stageAll,
  commit,
  pushBranch,
  hasUncommittedChanges,
  runTypecheck,
} from './git-ops';
import { checkWriteSafety, checkDeleteSafety } from './safety';
import { ProgressReporter, type ReplierInteraction, type ActionEntry } from './progress-reporter';
import { logger } from './logger';

const execFile = promisify(execFileCb);

const MAX_FILE_SIZE_BYTES =
  (Number(process.env.RMHBOT_MAX_FILE_SIZE_MB) || 10) * 1024 * 1024;
const AGENT_TIMEOUT_MS = 2 * 60_000;
const MAX_TOOL_ROUNDS = 40;
const MAX_TOOL_RESULT_LEN = 8000;

// ─── Path helpers ────────────────────────────────────────────────

function safePath(basePath: string, userPath: string): string {
  const normalized = userPath.replace(/^[/\\]+/, '');
  const full = path.resolve(basePath, normalized);
  if (!full.startsWith(path.normalize(basePath) + path.sep) && full !== basePath) {
    throw new Error(`Path traversal detected: ${userPath}`);
  }
  return full;
}

// ─── Tool execution ──────────────────────────────────────────────

async function executeTool(
  name: string,
  args: Record<string, unknown>,
  state: ConversationState,
  changedFiles: string[],
): Promise<string> {
  const wt = state.worktreePath;

  switch (name) {
    case 'read_file': {
      const filePath = safePath(wt, String(args.path));
      try {
        const stat = await fs.stat(filePath);
        if (stat.size > MAX_FILE_SIZE_BYTES) {
          return `File too large (${Math.round(stat.size / 1024)}KB).`;
        }
        return await fs.readFile(filePath, 'utf8');
      } catch (err: any) {
        return `Error: ${err.message}`;
      }
    }

    case 'list_directory': {
      const dirPath = safePath(wt, String(args.path));
      try {
        if (args.recursive) {
          const { stdout } = await execFile(
            'find',
            [
              dirPath,
              '-not', '-path', '*/node_modules/*',
              '-not', '-path', '*/.git/*',
              '-not', '-path', '*/dist-server/*',
              '-not', '-path', '*/.output/*',
              '-type', 'f',
            ],
            { cwd: wt },
          );
          return (
            stdout.split('\n').filter(Boolean).map(p => path.relative(wt, p)).join('\n') || '(empty)'
          );
        }
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        return entries.map(e => (e.isDirectory() ? `${e.name}/` : e.name)).join('\n') || '(empty)';
      } catch (err: any) {
        return `Error: ${err.message}`;
      }
    }

    case 'write_file': {
      const content = String(args.content);
      const safety = checkWriteSafety(String(args.path), content);
      if (!safety.allowed) return `Blocked: ${safety.reason}`;
      const filePath = safePath(wt, String(args.path));
      try {
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, content, 'utf8');
        const rel = path.relative(wt, filePath);
        if (!changedFiles.includes(rel)) changedFiles.push(rel);
        return 'OK';
      } catch (err: any) {
        return `Error: ${err.message}`;
      }
    }

    case 'delete_file': {
      const safety = checkDeleteSafety(String(args.path), state.deletedFilesThisSession);
      if (!safety.allowed) return `Blocked: ${safety.reason}`;
      const filePath = safePath(wt, String(args.path));
      try {
        await fs.unlink(filePath);
        state.deletedFilesThisSession.push(String(args.path));
        const rel = path.relative(wt, filePath);
        if (!changedFiles.includes(`(deleted) ${rel}`)) changedFiles.push(`(deleted) ${rel}`);
        return 'OK';
      } catch (err: any) {
        return `Error: ${err.message}`;
      }
    }

    case 'run_typecheck': {
      const result = await runTypecheck();
      const out = result.output.slice(0, MAX_TOOL_RESULT_LEN);
      return result.success ? `Typecheck passed ✓\n${out}`.trim() : `Typecheck failed:\n${out}`;
    }

    case 'search_code': {
      try {
        const { stdout } = await execFile(
          'grep',
          [
            '-r', '-n',
            '--exclude-dir', 'node_modules',
            '--exclude-dir', '.git',
            '--exclude-dir', 'dist-server',
            '--exclude-dir', '.output',
            ...(args.glob ? ['--include', String(args.glob)] : []),
            String(args.query),
            '.',
          ],
          { cwd: wt },
        );
        const lines = stdout.split('\n').filter(Boolean).slice(0, 100);
        return lines.join('\n') || 'No matches found';
      } catch (err: any) {
        if (err.code === 1) return 'No matches found';
        return `Error: ${err.message}`;
      }
    }

    default:
      return `Unknown tool: ${name}`;
  }
}

function getArgDisplay(toolName: string, args: Record<string, unknown>): string {
  if (['read_file', 'write_file', 'delete_file', 'list_directory'].includes(toolName)) {
    return String(args.path ?? '');
  }
  if (toolName === 'search_code') return String(args.query ?? '');
  return '';
}

// ─── Agent loop ──────────────────────────────────────────────────

async function runAgentLoop(
  state: ConversationState,
  reporter: ProgressReporter,
  userMessage: OpenAI.Chat.ChatCompletionContentPart[],
): Promise<{ summary: string; changedFiles: string[] }> {
  const changedFiles: string[] = [];
  const actions: ActionEntry[] = [];
  let thoughtBuffer = '';

  state.history.push({
    role: 'user',
    content:
      userMessage.length === 1 && userMessage[0].type === 'text'
        ? userMessage[0].text
        : userMessage,
  });

  let summary = '';

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const streamPromise = deepseek.chat.completions.create({
      model: 'deepseek-v4-flash',
      messages: state.history,
      tools: TOOLS,
      stream: true,
      // DeepSeek-specific: enable thinking mode with high reasoning effort
      ...({ thinking: { type: 'enabled', budget_tokens: 8000 } } as object),
    } as Parameters<typeof deepseek.chat.completions.create>[0]) as Promise<AsyncIterable<OpenAI.Chat.ChatCompletionChunk>>;

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('DeepSeek API timeout (>2 min)')), AGENT_TIMEOUT_MS),
    );

    const stream = await Promise.race([streamPromise, timeoutPromise]);

    let contentBuffer = '';
    const pendingCalls: Record<number, { id: string; name: string; argsBuffer: string }> = {};
    let finishReason: string | null = null;

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta as (typeof chunk.choices[0]['delta']) & {
        reasoning_content?: string;
      };
      if (!delta) continue;

      if (delta.reasoning_content) {
        thoughtBuffer += delta.reasoning_content;
        reporter.update(thoughtBuffer, actions);
      }

      if (delta.content) contentBuffer += delta.content;

      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index ?? 0;
          if (!pendingCalls[idx]) {
            pendingCalls[idx] = { id: tc.id ?? '', name: tc.function?.name ?? '', argsBuffer: '' };
          }
          if (tc.id) pendingCalls[idx].id = tc.id;
          if (tc.function?.name) pendingCalls[idx].name = tc.function.name;
          pendingCalls[idx].argsBuffer += tc.function?.arguments ?? '';
        }
      }

      const fr = chunk.choices[0]?.finish_reason;
      if (fr) finishReason = fr;
    }

    const toolCalls = Object.values(pendingCalls).filter(tc => tc.name);

    if ((finishReason === 'tool_calls' || toolCalls.length > 0) && toolCalls.length > 0) {
      state.history.push({
        role: 'assistant',
        content: contentBuffer || null,
        tool_calls: toolCalls.map(tc => ({
          id: tc.id,
          type: 'function' as const,
          function: { name: tc.name, arguments: tc.argsBuffer },
        })),
      });

      for (const tc of toolCalls) {
        const actionEntry: ActionEntry = { tool: tc.name, arg: '', status: 'pending' };
        actions.push(actionEntry);
        reporter.update(thoughtBuffer, actions);

        let result: string;
        try {
          const parsedArgs = JSON.parse(tc.argsBuffer || '{}') as Record<string, unknown>;
          actionEntry.arg = getArgDisplay(tc.name, parsedArgs);
          result = await executeTool(tc.name, parsedArgs, state, changedFiles);
          actionEntry.status =
            result.startsWith('Blocked:') || result.startsWith('Error:') ? 'error' : 'done';
        } catch (err: any) {
          result = `Error: ${err.message}`;
          actionEntry.status = 'error';
        }

        reporter.update(thoughtBuffer, actions);

        state.history.push({
          role: 'tool',
          tool_call_id: tc.id,
          content:
            result.length > MAX_TOOL_RESULT_LEN
              ? result.slice(0, MAX_TOOL_RESULT_LEN) + '\n[truncated]'
              : result,
        });
      }
    } else {
      summary = contentBuffer;
      state.history.push({ role: 'assistant', content: contentBuffer });
      break;
    }
  }

  return { summary, changedFiles };
}

// ─── Attachment handling ─────────────────────────────────────────

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const TEXT_EXTENSIONS = new Set([
  '.ts', '.tsx', '.css', '.md', '.json', '.txt', '.html', '.js', '.jsx',
]);

async function buildUserContent(
  request: string,
  attachment: Attachment | null,
  interaction: ReplierInteraction,
): Promise<OpenAI.Chat.ChatCompletionContentPart[]> {
  const parts: OpenAI.Chat.ChatCompletionContentPart[] = [];

  if (attachment) {
    if (attachment.size > MAX_FILE_SIZE_BYTES) {
      await interaction
        .followUp({
          content: `Attachment \`${attachment.name}\` exceeds the size limit and was ignored.`,
        })
        .catch(() => {});
    } else if (IMAGE_TYPES.has(attachment.contentType ?? '')) {
      const buf = await fetch(attachment.url).then(r => r.arrayBuffer());
      const base64 = Buffer.from(buf).toString('base64');
      parts.push({
        type: 'image_url',
        image_url: { url: `data:${attachment.contentType};base64,${base64}` },
      });
    } else if (TEXT_EXTENSIONS.has(path.extname(attachment.name ?? '').toLowerCase())) {
      const text = await fetch(attachment.url).then(r => r.text());
      const ext = path.extname(attachment.name ?? '').slice(1);
      parts.push({
        type: 'text',
        text: `Attached file \`${attachment.name}\`:\n\`\`\`${ext}\n${text}\n\`\`\``,
      });
    } else {
      await interaction
        .followUp({
          content: `Attachment \`${attachment.name}\` is not a supported type and was ignored.`,
        })
        .catch(() => {});
    }
  }

  parts.push({ type: 'text', text: request });
  return parts;
}

// ─── Channel guard ───────────────────────────────────────────────

function isAllowedChannel(channelId: string): boolean {
  const allowed = process.env.RMHBOT_ALLOWED_CHANNEL_IDS;
  if (!allowed || allowed === '*') return true;
  return allowed.split(',').map(s => s.trim()).includes(channelId);
}

// ─── Main handler ────────────────────────────────────────────────

export interface HandleCommandOptions {
  isNew: boolean;
  request: string;
  attachment?: Attachment | null;
}

export async function handleCommand(
  interaction: ReplierInteraction,
  options: HandleCommandOptions,
): Promise<void> {
  const { isNew, request } = options;
  const attachment = options.attachment ?? null;
  const userId = interaction.user.id;
  const username = interaction.user.username;

  if (!isAllowedChannel(interaction.channelId ?? '')) {
    await interaction.reply({ content: 'RMHBot is not available in this channel.' });
    return;
  }

  let state = sessions.get(userId);

  if (!isNew && !state) {
    await interaction.reply({ content: 'No active session — use `/rmhbot` to start one.' });
    return;
  }

  if (state && isSessionLocked(state)) {
    await interaction.reply({ content: 'Still working on your last request — please wait.' });
    return;
  }

  await interaction.deferReply();

  if (isNew) {
    const branchName = makeBranchName(username);
    const worktreePath = await createWorktree(branchName).catch(async (err: unknown) => {
      await interaction.editReply({ content: `❌ Failed to create git worktree: ${String(err)}` });
      return null;
    });
    if (!worktreePath) return;

    state = {
      branchName,
      worktreePath,
      discordUserId: userId,
      discordUsername: username,
      channelId: interaction.channelId ?? '',
      history: [{ role: 'system', content: SYSTEM_PROMPT }],
      deletedFilesThisSession: [],
      lockedAt: null,
    };
    sessions.set(userId, state);
  }

  const currentState = state!;

  // Initial working embed
  const initialEmbed = new EmbedBuilder()
    .setColor(0xf59e0b)
    .setTitle('⚙️ Working...')
    .setDescription(`Branch: \`${currentState.branchName}\``)
    .addFields(
      { name: '📝 Request', value: request.slice(0, 1024), inline: false },
      { name: '💭 Thinking', value: '*Starting...*', inline: false },
      { name: '⚡ Actions', value: '*No actions yet*', inline: false },
    );
  await interaction.editReply({ embeds: [initialEmbed], components: [] });

  currentState.lockedAt = Date.now();
  const reporter = new ProgressReporter(interaction, currentState.branchName, userId, request);

  try {
    const userContent = await buildUserContent(request, attachment, interaction);
    const { summary, changedFiles } = await runAgentLoop(currentState, reporter, userContent);

    await reporter.flushPending();

    if (changedFiles.length > 0) {
      await stageAll(currentState.worktreePath);

      if (await hasUncommittedChanges(currentState.worktreePath)) {
        const sha = await commit(
          request.slice(0, 72),
          { name: username, email: `discord-${userId}@rmhstudios.com` },
          currentState.worktreePath,
        );
        await pushBranch(currentState.branchName, currentState.worktreePath).catch(() => {});
        await reporter.finalize(sha, changedFiles, summary);
        logger.info({ event: 'rmhbot_done', userId, branch: currentState.branchName, sha });
      } else {
        await reporter.finalizeNoChanges(summary);
      }
    } else {
      await reporter.finalizeNoChanges(summary);
    }
  } catch (err: any) {
    logger.error({ event: 'rmhbot_error', userId, error: String(err) });
    await reporter.error(String(err));
  } finally {
    currentState.lockedAt = null;
  }
}
