import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { prisma } from '@/lib/prisma';

// Built-in templates seeded on first request
const BUILTIN_TEMPLATES = [
  {
    name: '📋 Meeting Notes',
    content: JSON.stringify({
      type: 'doc', content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Meeting Notes' }] },
        { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Date:' }, { type: 'text', text: ' ' }] },
        { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Attendees:' }, { type: 'text', text: ' ' }] },
        { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Agenda' }] },
        { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Item 1' }] }] }] },
        { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Discussion' }] },
        { type: 'paragraph', content: [{ type: 'text', text: '' }] },
        { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Action Items' }] },
        { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Action item 1' }] }] }] },
      ]
    }),
  },
  {
    name: '📓 Daily Journal',
    content: JSON.stringify({
      type: 'doc', content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '📅 Daily Journal' }] },
        { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Mood:' }, { type: 'text', text: ' 😊' }] },
        { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Gratitude' }] },
        { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'I\'m grateful for...' }] }] }] },
        { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Today\'s Focus' }] },
        { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Main task' }] }] }] },
        { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Reflection' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'What went well today...' }] },
      ]
    }),
  },
  {
    name: '🚀 Project Brief',
    content: JSON.stringify({
      type: 'doc', content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Project Brief' }] },
        { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Overview' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Describe the project...' }] },
        { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Goals' }] },
        { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Goal 1' }] }] }] },
        { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Milestones' }] },
        { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Milestone 1' }] }] }] },
        { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Notes' }] },
        { type: 'paragraph', content: [{ type: 'text', text: '' }] },
      ]
    }),
  },
  {
    name: '✅ Todo List',
    content: JSON.stringify({
      type: 'doc', content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '✅ Todo List' }] },
        { type: 'taskList', content: [
          { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Task 1' }] }] },
          { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Task 2' }] }] },
          { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Task 3' }] }] },
        ] },
      ]
    }),
  },
  {
    name: '💡 Idea Dump',
    content: JSON.stringify({
      type: 'doc', content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '💡 Idea Dump' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Stream of consciousness — no filters, just ideas:' }] },
        { type: 'paragraph', content: [{ type: 'text', text: '' }] },
      ]
    }),
  },
];

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Seed built-ins if not present
  const builtinCount = await prisma.noteTemplate.count({ where: { isBuiltin: true } });
  if (builtinCount === 0) {
    await prisma.noteTemplate.createMany({
      data: BUILTIN_TEMPLATES.map((t) => ({ ...t, isBuiltin: true })),
      skipDuplicates: true,
    });
  }

  const templates = await prisma.noteTemplate.findMany({
    where: { OR: [{ userId: session.user.id }, { isBuiltin: true }] },
    orderBy: [{ isBuiltin: 'desc' }, { name: 'asc' }],
  });

  return NextResponse.json({ templates });
}

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { name?: string; content?: string } = {};
  try { body = await req.json(); } catch { /* empty */ }

  if (!body.name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 });

  const template = await prisma.noteTemplate.create({
    data: {
      userId: session.user.id,
      name: body.name.trim(),
      content: body.content ?? '{"type":"doc","content":[{"type":"paragraph"}]}',
    },
  });

  return NextResponse.json({ template }, { status: 201 });
}
