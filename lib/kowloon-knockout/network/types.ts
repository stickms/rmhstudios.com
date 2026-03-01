// ============================================================
// Network Message Types — Multiplayer Protocol
// ============================================================

import type { FighterClass, GameState } from '@/lib/kowloon-knockout/game/fighters/types';

export interface RemoteInputState {
    left: boolean;
    right: boolean;
    block: boolean;
    jabPressed: boolean;
    crossPressed: boolean;
    hookPressed: boolean;
    uppercutPressed: boolean;
}

export interface CreateRoomMsg {
    type: 'create_room';
    fighterClass: FighterClass;
}

export interface JoinRoomMsg {
    type: 'join_room';
    code: string;
    fighterClass: FighterClass;
}

export interface InputMsg {
    type: 'input';
    data: RemoteInputState;
}

export interface GameStateMsg {
    type: 'game_state';
    data: GameState;
}

export interface LeaveMsg {
    type: 'leave';
}

export type ClientMessage = CreateRoomMsg | JoinRoomMsg | InputMsg | GameStateMsg | LeaveMsg;

export interface RoomCreatedMsg {
    type: 'room_created';
    code: string;
}

export interface RoomJoinedMsg {
    type: 'room_joined';
    hostClass: FighterClass;
    guestClass: FighterClass;
    isHost: boolean;
}

export interface OpponentDisconnectedMsg {
    type: 'opponent_disconnected';
}

export interface ErrorMsg {
    type: 'error';
    message: string;
}

export type ServerMessage =
    | RoomCreatedMsg
    | RoomJoinedMsg
    | InputMsg
    | GameStateMsg
    | OpponentDisconnectedMsg
    | ErrorMsg;
