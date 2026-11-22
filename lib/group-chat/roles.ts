/**
 * Group chat roles (s07-04): the rules that need no database. Client-safe.
 *
 * One role, admin, stored as `ChatMember.role`. The owner is `Chat.ownerId` and sits above every admin; an owner is
 * never also an admin row. The server (`roles.server.ts`, `manage.server.ts`) applies these under the group's lock.
 */

/** A group holds at most this many admins besides its owner. */
export const MAX_GROUP_ADMINS = 5;

export type GroupRole = 'member' | 'admin';

/** Who may do an action: the owner alone, or an admin as well. */
export type ManagerNeed = 'owner' | 'admin';

export const GROUP_ACTIONS = {
  rename: 'admin',
  add: 'admin',
  remove: 'admin',
  'invite-create': 'admin',
  'invite-list': 'admin',
  'invite-revoke': 'admin',
  'set-admin': 'owner',
  transfer: 'owner',
  'remove-admin': 'owner',
  delete: 'owner',
} as const satisfies Record<string, ManagerNeed>;

export type GroupAction = keyof typeof GROUP_ACTIONS;

/** The standing an action asks for. */
export function needFor(action: GroupAction): ManagerNeed {
  return GROUP_ACTIONS[action];
}

/** True for an action an admin may take as well as the owner. */
export function isManagerAction(action: GroupAction): boolean {
  return GROUP_ACTIONS[action] === 'admin';
}

/** A stored role string as a role: anything but `admin` is an ordinary member. */
export function asRole(role: string | null | undefined): GroupRole {
  return role === 'admin' ? 'admin' : 'member';
}

/** Whether `userId`, holding `role`, may take an action that needs `need`. The owner may take any. */
export function canManage(
  ownerId: string | null | undefined,
  role: string | null | undefined,
  userId: string,
  need: ManagerNeed,
): boolean {
  if (!!ownerId && ownerId === userId) return true;
  return need === 'admin' && asRole(role) === 'admin';
}

/**
 * Whether the actor may remove the target. The owner removes anyone else; an admin removes only ordinary members,
 * never the owner or another admin.
 */
export function canRemoveMember(
  ownerId: string | null | undefined,
  actorId: string,
  target: {
    userId: string;
    role: string | null | undefined;
  },
): boolean {
  if (target.userId === actorId) return false;
  if (!!ownerId && target.userId === ownerId) return false;
  if (!!ownerId && ownerId === actorId) return true;
  return asRole(target.role) === 'member';
}

/**
 * The member who inherits a group the owner leaves: the earliest-joined admin, else the earliest-joined member,
 * ties broken by id. `members` is read under the group lock with the leaver already gone.
 */
export function pickSuccessor(
  members: readonly {
    userId: string;
    joinedAt: Date;
    role?: string | null;
  }[],
  leavingId: string,
): {
  userId: string;
  wasAdmin: boolean;
} | null {
  const rest = members
    .filter((m) => m.userId !== leavingId)
    .sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime() || (a.userId < b.userId ? -1 : 1));
  const admin = rest.find((m) => asRole(m.role) === 'admin');
  const heir = admin ?? rest[0];
  return heir
    ? {
        userId: heir.userId,
        wasAdmin: !!admin,
      }
    : null;
}

/** Whether another admin fits. `current` is the admin count under the lock. */
export function adminSeatLeft(current: number): boolean {
  return current < MAX_GROUP_ADMINS;
}
