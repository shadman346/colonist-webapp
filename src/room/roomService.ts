import * as local from "./localRoom";
import * as hosted from "./supabaseRoom";
import type { LocalIdentity, RoomView } from "./localRoom";

export const isLocalPreview = false;
export const getIdentity = local.getIdentity;
export const normalizeCode = local.normalizeCode;
export const roomLink = local.roomLink;
export const canStart = local.canStart;
export const signInWithPassword = hosted.signInWithPassword;
export const createAccount = hosted.createAccount;
export const signOut = hosted.signOut;

export function resolveIdentity(): Promise<LocalIdentity> {
  return hosted.resolveIdentity();
}

export function saveIdentity(name: string): Promise<LocalIdentity> {
  return hosted.saveIdentity(name);
}

export function readRoom(code: string): Promise<RoomView | null> {
  return hosted.readRoom(code);
}

export function createRoom(identity: LocalIdentity): Promise<RoomView> {
  return hosted.createRoom(identity);
}

export function joinRoom(code: string, identity: LocalIdentity): Promise<RoomView> {
  return hosted.joinRoom(code, identity);
}

export function updateSeats(room: RoomView, maxPlayers: 3 | 4 | 5 | 6): Promise<RoomView> {
  return hosted.updateSeats(room, maxPlayers);
}

export function updateTurnTimer(room: RoomView, seconds: 60 | 90 | 120 | 180): Promise<RoomView> {
  return hosted.updateTurnTimer(room, seconds);
}

export function setReady(room: RoomView, ready: boolean): Promise<RoomView> {
  return hosted.setReady(room, ready);
}

export function startRoom(room: RoomView): Promise<RoomView> {
  return hosted.startRoom(room);
}

export function leaveRoom(room: RoomView): Promise<RoomView> {
  return hosted.leaveRoom(room);
}

export function sendChat(room: RoomView, message: string): Promise<RoomView> {
  return hosted.sendChat(room, message);
}

export function kickMember(room: RoomView, userId: string): Promise<RoomView> {
  return hosted.kickMember(room, userId);
}

export function onRoomChange(code: string, callback: () => void): () => void {
  return hosted.onRoomChange(code, callback);
}

export type {
  ChatLine,
  LocalIdentity,
  PlayerColor,
  RoomPlayer,
  RoomSettings,
  RoomStatus,
  RoomView,
} from "./localRoom";
