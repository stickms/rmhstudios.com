/**
 * The calls the Group info dialog makes (s04-10): the owner's four writes and the
 * people search for "Add people". Client-safe: contracts only. Kept here so the
 * dialog holds no endpoint calls of its own (redesign audit B4).
 */
import { api } from '@/lib/contract/client';
import { searchUsersApi } from '@/lib/discovery/explore.contract';
import {
  addGroupMembersApi,
  removeGroupMemberApi,
  renameGroupApi,
  transferGroupOwnerApi,
} from '@/lib/group-chat/manage.contract';
import { setGroupAdminApi } from '@/lib/group-chat/roles.contract';

export const renameGroup = (groupId: string, name: string) =>
  api(renameGroupApi, { params: { id: groupId }, body: { name } });

export const removeGroupMember = (groupId: string, userId: string) =>
  api(removeGroupMemberApi, { params: { id: groupId, userId } });

export const transferGroupOwner = (groupId: string, userId: string) =>
  api(transferGroupOwnerApi, { params: { id: groupId }, body: { userId } });

export const addGroupMembers = (groupId: string, memberIds: string[]) =>
  api(addGroupMembersApi, { params: { id: groupId }, body: { members: memberIds } });

/** People matching a search term, for the "Add people" picker. */
export const searchPeople = (q: string) => api(searchUsersApi, { query: { q } });

/** Owner only (s07-04): make a member an admin, or take it back. 409 `ADMIN_LIMIT` past five admins. */
export const setGroupAdmin = (groupId: string, userId: string, admin: boolean) =>
  api(setGroupAdminApi, { params: { id: groupId, userId }, body: { admin } });
