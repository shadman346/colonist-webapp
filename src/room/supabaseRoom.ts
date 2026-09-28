import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  getIdentity as getLocalIdentity,
  normalizeCode,
  saveIdentity as saveLocalIdentity,
  type LocalIdentity,
  type PlayerColor,
  type RoomView,
} from "./localRoom";

type RoomCommandType =
  | "CREATE_ROOM"
  | "JOIN_ROOM"
  | "SET_CONFIG"
  | "SET_READY"
  | "START_GAME"
  | "SEND_CHAT"
  | "KICK_MEMBER"
  | "LEAVE_ROOM";

type CommandBody = {
  actionId: string;
  type: RoomCommandType;
  expectedRevision: number;
  roomId?: string;
  code?: string;
  payload?: Record<string, unknown>;
};

type CommandResponse = {
  roomId: string;
  revision: number;
  status: string;
  inviteCode: string;
  gameId?: string;
};

type RoomRow = {
  id: string;
  invite_code: string;
  host_user_id: string;
  status: RoomView["status"];
  max_players: 3 | 4 | 5 | 6;
  turn_timer_seconds: 60 | 90 | 120 | 180;
  revision: number;
  created_at: string;
};

type MemberRow = {
  user_id: string;
  display_name: string;
  seat_no: number | null;
  status: "active" | "left" | "kicked";
  is_ready: boolean;
  joined_at: string;
};

type EventRow = {
  revision: number;
  actor_id: string | null;
  public_payload: { message?: unknown };
  created_at: string;
};

type GameRow = { id: string };

const colors: PlayerColor[] = ["coral", "sky", "mint", "violet", "gold", "teal"];
const errorMessages: Record<string, string> = {
  INVALID_NAME: "Enter a display name with up to 24 characters.",
  ROOM_NOT_FOUND: "Room not found. Check the code and try again.",
  ROOM_NOT_JOINABLE: "This room is not accepting new players.",
  ROOM_FULL: "This room is full.",
  MEMBER_BLOCKED: "You cannot rejoin this room.",
  NOT_ROOM_MEMBER: "You are no longer a member of this room.",
  STALE_REVISION: "The room changed. Its latest state is loading; please try again.",
  HOST_ONLY_WAITING: "Only the host can change this room before or between games.",
  ROOM_NOT_LEAVABLE: "Finish this match before leaving the room.",
  PLAYERS_NOT_READY: "Wait for at least three players and for everyone to be ready.",
  ROOM_CREATE_LIMIT: "You have created too many rooms recently. Try again later.",
  INVALID_CHAT: "Write a message of up to 500 characters.",
  CHAT_RATE_LIMIT: "Please wait a moment before sending another message.",
  INVALID_KICK: "That player cannot be removed right now.",
  MEMBER_NOT_FOUND: "That player is no longer in the room.",
  ORIGIN_NOT_ALLOWED: "This web address is not enabled for room requests.",
  UNAUTHENTICATED: "Your session expired. Reload the page and try again.",
};

export class RoomActionError extends Error {
  constructor(message: string, public readonly outcomeUnknown = false) {
    super(message);
  }
}

let client: SupabaseClient | null = null;
let actorPromise: Promise<string> | null = null;
type PendingCommand = { body: CommandBody; response: CommandResponse | null };
let pendingCreate: PendingCommand | null = null;
const pendingJoins = new Map<string, PendingCommand>();
const pendingMemberCommands = new Map<string, PendingCommand>();

export function getClient(): SupabaseClient {
  if (client) return client;
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new RoomActionError(
      "Supabase is partly configured. Set both VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.",
    );
  }
  client = createClient(url, key, {
    global: {
      fetch: (input, init) => fetch(input, {
        ...init,
        signal: init?.signal
          ? AbortSignal.any([init.signal, AbortSignal.timeout(10_000)])
          : AbortSignal.timeout(10_000),
      }),
    },
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: "pkce",
    },
  });
  return client;
}

export async function authenticatedActor(): Promise<string> {
  if (!actorPromise) {
    actorPromise = (async () => {
      const supabase = getClient();
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (sessionData.session) {
        const { data, error } = await supabase.auth.getUser();
        if (error || !data.user) throw error ?? new Error("Session unavailable.");
        return data.user.id;
      }
      throw new RoomActionError("Sign in with your email to create or join a room.");
    })();
  }
  try {
    return await actorPromise;
  } catch (error) {
    actorPromise = null;
    throw error;
  }
}

export async function resolveIdentity(): Promise<LocalIdentity> {
  const { data, error } = await getClient().auth.getSession();
  if (error) throw error;
  if (!data.session) return { id: "", name: getLocalIdentity().name };
  return { id: await authenticatedActor(), name: getLocalIdentity().name };
}

export async function signInWithPassword(email: string, password: string): Promise<LocalIdentity> {
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new RoomActionError("Enter a valid email address.");
  }
  const { error } = await getClient().auth.signInWithPassword({ email: normalized, password });
  if (error) throw new RoomActionError(error.message);
  actorPromise = null;
  return resolveIdentity();
}

export async function createAccount(email: string, password: string): Promise<LocalIdentity> {
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new RoomActionError("Enter a valid email address.");
  }
  if (password.length < 8) throw new RoomActionError("Use at least 8 characters for your password.");
  const { data, error } = await getClient().auth.signUp({ email: normalized, password });
  if (error) throw new RoomActionError(error.message);
  if (!data.session) throw new RoomActionError("Account created, but sign-in needs confirmation. Check project email settings.");
  actorPromise = null;
  return resolveIdentity();
}

export async function signOut(): Promise<void> {
  const { error } = await getClient().auth.signOut();
  if (error) throw new RoomActionError(error.message);
  actorPromise = null;
}

export async function saveIdentity(name: string): Promise<LocalIdentity> {
  const stored = saveLocalIdentity(name);
  return { id: await authenticatedActor(), name: stored.name };
}

async function command(body: CommandBody): Promise<CommandResponse> {
  await authenticatedActor();
  const invoke = () => getClient().functions.invoke<CommandResponse>(
    "room-command",
    { body },
  );
  let result = await invoke();
  // A transport failure may happen after the database committed. Reuse the
  // same action ID so the server receipt returns the original result safely.
  if (result.error && !(
    result.error as { context?: { status?: number } }
  ).context?.status) result = await invoke();
  const { data, error } = result;
  if (error) {
    let code = "";
    const context = (error as { context?: Response }).context;
    if (context && typeof context.json === "function") {
      try {
        const response = (await context.json()) as { error?: string };
        code = response.error ?? "";
      } catch {
        // The network error remains useful below.
      }
    }
    // A transport failure can happen after the transaction commits. Preserve
    // the action ID so a later user retry asks for the original receipt.
    const outcomeUnknown = !context || !context.status;
    throw new RoomActionError(errorMessages[code] ?? error.message, outcomeUnknown);
  }
  if (!data?.roomId || !data.inviteCode) {
    throw new RoomActionError("The room server returned an incomplete response.", true);
  }
  return data;
}

async function roomById(roomId: string): Promise<RoomView> {
  await authenticatedActor();
  const supabase = getClient();
  const { data: row, error: roomError } = await supabase
    .from("rooms")
    .select("id,invite_code,host_user_id,status,max_players,turn_timer_seconds,revision,created_at")
    .eq("id", roomId)
    .single();
  if (roomError || !row) {
    throw new RoomActionError(
      roomError?.message ?? "You no longer have access to this room.",
    );
  }
  return roomFromRow(row as RoomRow);
}

async function loadCommandRoom(response: CommandResponse): Promise<RoomView> {
  try {
    return await roomById(response.roomId);
  } catch {
    // A committed command can be visible while a subsequent network read
    // fails. Give the authorized read one more attempt before reporting it.
    return roomById(response.roomId);
  }
}

async function roomFromRow(row: RoomRow): Promise<RoomView> {
  const supabase = getClient();
  const [membersResult, eventsResult, gameResult] = await Promise.all([
    supabase
      .from("room_members")
      .select("user_id,display_name,seat_no,status,is_ready,joined_at")
      .eq("room_id", row.id),
    supabase
      .from("room_events")
      .select("revision,actor_id,public_payload,created_at")
      .eq("room_id", row.id)
      .eq("kind", "CHAT_MESSAGE")
      .order("revision", { ascending: false })
      .limit(100),
    row.status === "in_game" || row.status === "completed"
      ? supabase
        .from("games")
        .select("id")
        .eq("room_id", row.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (membersResult.error) throw new RoomActionError(membersResult.error.message);
  if (eventsResult.error) throw new RoomActionError(eventsResult.error.message);
  if (gameResult.error) throw new RoomActionError(gameResult.error.message);
  const members = (membersResult.data ?? []) as MemberRow[];
  const names = new Map(members.map((member) => [member.user_id, member.display_name]));
  const players = members
    .filter((member) => member.status === "active" && member.seat_no !== null)
    .sort((a, b) => (a.seat_no ?? 0) - (b.seat_no ?? 0))
    .map((member) => ({
      id: member.user_id,
      name: member.display_name,
      color: colors[member.seat_no ?? 0] ?? "teal",
      ready: member.is_ready,
      joinedAt: Date.parse(member.joined_at),
    }));
  const chat = ((eventsResult.data ?? []) as EventRow[])
    .reverse()
    .filter((event) => typeof event.public_payload?.message === "string")
    .map((event) => ({
      id: `${row.id}:${event.revision}`,
      playerId: event.actor_id ?? "",
      name: names.get(event.actor_id ?? "") ?? "Former player",
      text: String(event.public_payload.message),
      sentAt: Date.parse(event.created_at),
    }));
  return {
    roomId: row.id,
    gameId: (gameResult.data as GameRow | null)?.id,
    code: row.invite_code,
    hostId: row.host_user_id,
    status: row.status,
    settings: {
      maxPlayers: row.max_players,
      pointsToWin: 10,
      turnTimerSeconds: row.turn_timer_seconds,
      mode: "base",
      map: row.max_players >= 5 ? "large" : "base",
      private: true,
    },
    players,
    chat,
    revision: Number(row.revision),
    createdAt: Date.parse(row.created_at),
  };
}

export async function readRoom(codeInput: string): Promise<RoomView | null> {
  const code = normalizeCode(codeInput);
  if (!code) return null;
  await authenticatedActor();
  const { data, error } = await getClient()
    .from("rooms")
    .select("id,invite_code,host_user_id,status,max_players,turn_timer_seconds,revision,created_at")
    .eq("invite_code", code)
    .maybeSingle();
  if (error) throw new RoomActionError(error.message);
  return data ? roomFromRow(data as RoomRow) : null;
}

function roomId(room: RoomView): string {
  if (!room.roomId) throw new RoomActionError("Room ID is missing. Reload the room.");
  return room.roomId;
}

async function memberCommand(
  room: RoomView,
  type: RoomCommandType,
  payload?: Record<string, unknown>,
): Promise<RoomView> {
  const key = memberCommandKey(room, type, payload);
  const response = await issueMemberCommand(room, type, payload);
  const loaded = await loadCommandRoom(response);
  pendingMemberCommands.delete(key);
  return loaded;
}

function memberCommandKey(
  room: RoomView,
  type: RoomCommandType,
  payload?: Record<string, unknown>,
): string {
  return JSON.stringify([roomId(room), type, payload ?? {}]);
}

async function issuePending(pending: PendingCommand): Promise<CommandResponse> {
  if (!pending.response) pending.response = await command(pending.body);
  return pending.response;
}

async function issueMemberCommand(
  room: RoomView,
  type: RoomCommandType,
  payload?: Record<string, unknown>,
): Promise<CommandResponse> {
  const key = memberCommandKey(room, type, payload);
  let pending = pendingMemberCommands.get(key);
  if (!pending) {
    pending = {
      body: {
        actionId: crypto.randomUUID(),
        type,
        roomId: roomId(room),
        expectedRevision: room.revision,
        ...(payload ? { payload } : {}),
      },
      response: null,
    };
    pendingMemberCommands.set(key, pending);
  }
  try {
    return await issuePending(pending);
  } catch (error) {
    if (!(error instanceof RoomActionError && error.outcomeUnknown)) {
      pendingMemberCommands.delete(key);
    }
    throw error;
  }
}

export async function createRoom(identity: LocalIdentity): Promise<RoomView> {
  if (!pendingCreate) {
    pendingCreate = {
      body: {
        actionId: crypto.randomUUID(),
        type: "CREATE_ROOM",
        expectedRevision: 0,
        payload: { displayName: identity.name, maxPlayers: 4, turnTimerSeconds: 90 },
      },
      response: null,
    };
  }
  try {
    await issuePending(pendingCreate);
  } catch (error) {
    if (!(error instanceof RoomActionError && error.outcomeUnknown)) pendingCreate = null;
    throw error;
  }
  try {
    const room = await loadCommandRoom(pendingCreate.response!);
    pendingCreate = null;
    return room;
  } catch {
    throw new RoomActionError(
      "The room was created but could not load. Select Create Room again to recover it.",
    );
  }
}

export async function joinRoom(codeInput: string, identity: LocalIdentity): Promise<RoomView> {
  const code = normalizeCode(codeInput);
  let pending = pendingJoins.get(code);
  if (!pending) {
    pending = {
      body: {
        actionId: crypto.randomUUID(),
        type: "JOIN_ROOM",
        expectedRevision: 0,
        code,
        payload: { displayName: identity.name },
      },
      response: null,
    };
    pendingJoins.set(code, pending);
  }
  try {
    await issuePending(pending);
  } catch (error) {
    if (!(error instanceof RoomActionError && error.outcomeUnknown)) pendingJoins.delete(code);
    throw error;
  }
  try {
    const room = await loadCommandRoom(pending.response!);
    pendingJoins.delete(code);
    return room;
  } catch {
    throw new RoomActionError(
      "You joined, but the room could not load. Select Join room again to recover it.",
    );
  }
}

export function updateSeats(room: RoomView, maxPlayers: 3 | 4 | 5 | 6): Promise<RoomView> {
  return memberCommand(room, "SET_CONFIG", { maxPlayers });
}

export function updateTurnTimer(room: RoomView, turnTimerSeconds: 60 | 90 | 120 | 180): Promise<RoomView> {
  return memberCommand(room, "SET_CONFIG", { turnTimerSeconds });
}

export function setReady(room: RoomView, ready: boolean): Promise<RoomView> {
  return memberCommand(room, "SET_READY", { ready });
}

export function startRoom(room: RoomView): Promise<RoomView> {
  return memberCommand(room, "START_GAME");
}

export async function leaveRoom(room: RoomView): Promise<RoomView> {
  // The successful command removes the caller's member read permission.
  // The caller navigates away immediately, so there is no post-leave fetch.
  const key = memberCommandKey(room, "LEAVE_ROOM");
  await issueMemberCommand(room, "LEAVE_ROOM");
  pendingMemberCommands.delete(key);
  return room;
}

export function sendChat(room: RoomView, message: string): Promise<RoomView> {
  return memberCommand(room, "SEND_CHAT", { message });
}

export function kickMember(room: RoomView, userId: string): Promise<RoomView> {
  return memberCommand(room, "KICK_MEMBER", { userId });
}

type RoomListener = {
  callback: () => void;
  onStatus?: (status: "live" | "reconnecting") => void;
};
type RoomSubscription = {
  listeners: Set<RoomListener>;
  channel: ReturnType<SupabaseClient["channel"]> | null;
  status: "connecting" | "live" | "reconnecting";
  retryTimer: number | null;
};

// The room shell and match board observe the same topic. Realtime closes an
// existing channel when another channel with that topic joins, so share one.
const roomSubscriptions = new Map<string, RoomSubscription>();

export function onRoomChange(codeInput: string, callback: () => void,
  onStatus?: (status: "live" | "reconnecting") => void, fallbackMs = 5_000): () => void {
  const code = normalizeCode(codeInput);
  let subscription = roomSubscriptions.get(code);
  if (!subscription) {
    subscription = { listeners: new Set(), channel: null, status: "connecting", retryTimer: null };
    roomSubscriptions.set(code, subscription);
    const current = subscription;
    const signal = () => { for (const listener of current.listeners) listener.callback(); };
    const statusChange = (status: "live" | "reconnecting") => {
      current.status = status;
      for (const listener of current.listeners) listener.onStatus?.(status);
    };
    const retry = () => {
      if (roomSubscriptions.get(code) !== current || current.retryTimer !== null) return;
      statusChange("reconnecting");
      const channel = current.channel;
      current.channel = null;
      if (channel) void getClient().removeChannel(channel);
      current.retryTimer = window.setTimeout(start, 2_000);
    };
    const connect = async () => {
      current.retryTimer = null;
      await authenticatedActor();
      const supabase = getClient();
      const { data, error } = await supabase.from("rooms").select("id")
        .eq("invite_code", code).maybeSingle();
      if (error || !data) throw error ?? new Error("Room unavailable.");
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session) throw sessionError ?? new Error("Session unavailable.");
      await supabase.realtime.setAuth(sessionData.session.access_token);
      if (roomSubscriptions.get(code) !== current) return;
      const channel = supabase
        .channel(`room:${data.id}`, { config: { private: true } })
        .on("broadcast", { event: "revision" }, signal)
        .on("broadcast", { event: "game-revision" }, signal);
      current.channel = channel;
      channel.subscribe((status, error) => {
          if (roomSubscriptions.get(code) !== current || current.channel !== channel) return;
          if (status === "SUBSCRIBED") { statusChange("live"); signal(); }
          else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            console.warn("Room realtime connection", status, error?.message);
            retry();
          }
        });
    };
    const start = () => void connect().catch(retry);
    start();
  }
  const listener: RoomListener = { callback, onStatus };
  subscription.listeners.add(listener);
  if (subscription.status !== "connecting") onStatus?.(subscription.status);
  // Polling repairs missed messages or a disconnected socket.
  const fallback = window.setInterval(() => {
    if (document.visibilityState === "visible") callback();
  }, fallbackMs);
  return () => {
    window.clearInterval(fallback);
    subscription.listeners.delete(listener);
    if (subscription.listeners.size === 0) {
      roomSubscriptions.delete(code);
      if (subscription.retryTimer !== null) window.clearTimeout(subscription.retryTimer);
      if (subscription.channel) void getClient().removeChannel(subscription.channel);
    }
  };
}
