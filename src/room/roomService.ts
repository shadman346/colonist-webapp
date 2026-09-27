// The same UI uses a browser-only fixture until public Supabase credentials are
// supplied. A configured deployment always uses authenticated server commands.
import * as local from "./localRoom";
import * as hosted from "./supabaseRoom";
import type { LocalIdentity, RoomView } from "./localRoom";

const configured = Boolean(
  import.meta.env.VITE_SUPABASE_URL || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
);

export const isLocalPreview = !configured;
export const getIdentity = local.getIdentity;
export const normalizeCode = local.normalizeCode;
export const roomLink = local.roomLink;
export const canStart = local.canStart;

export function resolveIdentity(): Promise<LocalIdentity> {
  return configured ? hosted.resolveIdentity() : Promise.resolve(local.getIdentity());
}

export function saveIdentity(name: string): Promise<LocalIdentity> {
  return configured ? hosted.saveIdentity(name) : Promise.resolve(local.saveIdentity(name));
}

export function readRoom(code: string): Promise<RoomView | null> {
  return configured ? hosted.readRoom(code) : Promise.resolve(local.readRoom(code));
}

export function createRoom(identity: LocalIdentity): Promise<RoomView> {
  return configured ? hosted.createRoom(identity) : Promise.resolve(local.createRoom(identity));
}

export function joinRoom(code: string, identity: LocalIdentity): Promise<RoomView> {
  return configured
    ? hosted.joinRoom(code, identity)
    : Promise.resolve(local.joinRoom(code, identity));
}

export function updateSeats(room: RoomView, maxPlayers: 3 | 4): Promise<RoomView> {
  return configured
    ? hosted.updateSeats(room, maxPlayers)
    : Promise.resolve(local.updateSeats(room.code, local.getIdentity().id, maxPlayers));
}

export function setReady(room: RoomView, ready: boolean): Promise<RoomView> {
  return configured
    ? hosted.setReady(room, ready)
    : Promise.resolve(local.setReady(room.code, local.getIdentity().id, ready));
}

export function startRoom(room: RoomView): Promise<RoomView> {
  return configured
    ? hosted.startRoom(room)
    : Promise.resolve(local.startRoom(room.code, local.getIdentity().id));
}

export function leaveRoom(room: RoomView): Promise<RoomView> {
  return configured
    ? hosted.leaveRoom(room)
    : Promise.resolve(local.leaveRoom(room.code, local.getIdentity().id));
}

export function sendChat(room: RoomView, message: string): Promise<RoomView> {
  return configured
    ? hosted.sendChat(room, message)
    : Promise.resolve(local.sendChat(room.code, local.getIdentity().id, message));
}

export function kickMember(room: RoomView, userId: string): Promise<RoomView> {
  return configured
    ? hosted.kickMember(room, userId)
    : Promise.resolve(local.kickMember(room.code, local.getIdentity().id, userId));
}

export function onRoomChange(code: string, callback: () => void): () => void {
  return configured
    ? hosted.onRoomChange(code, callback)
    : local.onRoomChange(code, callback);
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
