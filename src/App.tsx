import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  BookOpen,
  Check,
  CircleHelp,
  Globe2,
  Home,
  Info,
  LockKeyhole,
  Play,
  Send,
  X,
} from "lucide-react";
import BoardPreview from "./BoardPreview";
import MatchView from "./MatchView";
import {
  canStart,
  createAccount,
  createRoom,
  getIdentity,
  isLocalPreview,
  joinRoom,
  kickMember,
  leaveRoom,
  normalizeCode,
  onRoomChange,
  readRoom,
  resolveIdentity,
  roomLink,
  saveIdentity,
  signInWithPassword,
  sendChat,
  setReady,
  signOut,
  startRoom,
  updateSeats,
  updateTurnTimer,
  type LocalIdentity,
  type PlayerColor,
  type RoomView,
} from "./room/roomService";

type Page = "rooms" | "board";

function SignInScreen({ onVerified }: { onVerified: (identity: LocalIdentity) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [mode, setMode] = useState<"sign-in" | "create">("sign-in");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (mode === "create" && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      onVerified(mode === "create"
        ? await createAccount(email, password)
        : await signInWithPassword(email, password));
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="sign-in-screen" aria-labelledby="sign-in-heading">
    <div className="sign-in-card">
      <LockKeyhole size={28} />
      <h1 id="sign-in-heading">Play with your friends</h1>
      <p>Use your email and password to join the same room from any device.</p>
      <div className="sign-in-tabs" role="tablist" aria-label="Account access">
        <button type="button" role="tab" aria-selected={mode === "sign-in"} onClick={() => { setMode("sign-in"); setError(""); }}>Sign in</button>
        <button type="button" role="tab" aria-selected={mode === "create"} onClick={() => { setMode("create"); setError(""); }}>Create account</button>
      </div>
      <form onSubmit={(event) => void submit(event)}>
        <label htmlFor="sign-in-email">Email address</label>
        <input id="sign-in-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />
        <label htmlFor="sign-in-password">Password</label>
        <input id="sign-in-password" type="password" autoComplete={mode === "create" ? "new-password" : "current-password"} required minLength={mode === "create" ? 8 : undefined} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={mode === "create" ? "At least 8 characters" : "Your password"} />
        {mode === "create" && <><label htmlFor="confirm-password">Confirm password</label><input id="confirm-password" type="password" autoComplete="new-password" required minLength={8} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Repeat your password" /></>}
        <button className="button" type="submit" disabled={busy}>{busy ? "Please wait…" : mode === "create" ? "Create account" : "Sign in"}</button>
      </form>
      {mode === "create" && <p className="sign-in-hint">No email confirmation is needed. Keep your password safe; email recovery is not available yet.</p>}
      {error && <p className="sign-in-error" role="alert">{error}</p>}
    </div>
  </section>;
}

function Logo() {
  return (
    <div className="brand" aria-label="Harbor Table">
      <div className="brand-mark" aria-hidden="true">
        <span>⬢</span>
        <span>⬢</span>
        <span>⬢</span>
      </div>
      <span className="brand-name">
        HARBOR
        <br />
        <strong>TABLE</strong>
      </span>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  children,
  className = "",
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      className={`icon-button ${className}`}
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function colorClass(color: PlayerColor) {
  return `color-${color}`;
}

function HexArt({
  kind,
}: {
  kind: "mode" | "map" | "private" | "dice" | "clock" | "points";
}) {
  if (kind === "mode") {
    return <div className="hex-art" aria-hidden="true"><img src="/assets/figma/room-hex-cluster.svg" alt="" /></div>;
  }
  if (kind === "map") {
    return <div className="hex-art" aria-hidden="true"><img src="/assets/figma/room-hex-cluster.svg" alt="" /></div>;
  }
  if (kind === "private") return <LockKeyhole size={29} strokeWidth={2.5} />;
  if (kind === "dice")
    return (
      <span className="dice-art" aria-hidden="true">
        ⚄
      </span>
    );
  if (kind === "clock")
    return (
      <span className="clock-art" aria-hidden="true">
        ∞
      </span>
    );
  return (
    <span className="points-art" aria-hidden="true">
      10
    </span>
  );
}

function App() {
  const [identity, setIdentity] = useState<LocalIdentity>(() => getIdentity());
  const [name, setName] = useState(identity.name);
  const [code, setCode] = useState(() =>
    normalizeCode(new URLSearchParams(location.search).get("room") ?? ""),
  );
  const [room, setRoom] = useState<RoomView | null>(null);
  const [identityResolved, setIdentityResolved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState<Page>("rooms");
  const [joinOpen, setJoinOpen] = useState(Boolean(code));
  const [joinCode, setJoinCode] = useState(code);
  const [joinError, setJoinError] = useState("");
  const [toast, setToast] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const isMember = Boolean(
    room?.players.some((player) => player.id === identity.id),
  );
  const isSignedIn = Boolean(identity.id && identityResolved);
  const isHost = Boolean(room && room.hostId === identity.id);
  const showBoard = page === "board";

  useEffect(() => {
    if (isMember && room?.status === "in_game") setPage("board");
  }, [isMember, room?.status]);

  useEffect(() => {
    let active = true;
    void resolveIdentity()
      .then((resolved) => {
        if (!active) return;
        setIdentity(resolved);
        setName(resolved.name);
        setIdentityResolved(true);
      })
      .catch((error: unknown) => {
        if (active) setToast(error instanceof Error ? error.message : "Sign-in failed.");
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!identityResolved || !identity.id) return;
    if (!code) {
      setRoom(null);
      return;
    }
    let active = true;
    const refresh = () => {
      void readRoom(code)
        .then((next) => {
          if (!active) return;
          setRoom((previous) =>
            next && previous?.code === next.code && previous.revision > next.revision
              ? previous
              : next,
          );
          if (next?.players.some((player) => player.id === identity.id)) {
            setJoinOpen(false);
          }
        })
        .catch((error: unknown) => {
          if (active) setToast(error instanceof Error ? error.message : "Room refresh failed.");
        });
    };
    refresh();
    const unsubscribe = onRoomChange(code, refresh);
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      unsubscribe();
      window.removeEventListener("focus", refresh);
    };
  }, [code, identity.id, identityResolved, room?.roomId]);

  useEffect(() => {
    const onPop = () => {
      const nextCode = normalizeCode(
        new URLSearchParams(location.search).get("room") ?? "",
      );
      setCode(nextCode);
      setJoinCode(nextCode);
      setRoom(null);
      setJoinOpen(Boolean(nextCode));
      setPage("rooms");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 3500);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  function setRoomUrl(nextCode: string) {
    const url = new URL(location.href);
    if (nextCode) url.searchParams.set("room", nextCode);
    else url.searchParams.delete("room");
    history.pushState({}, "", url);
    setCode(nextCode);
    setJoinCode(nextCode);
  }

  async function applyAction(action: () => Promise<RoomView>, success?: string) {
    if (busy) return false;
    setBusy(true);
    try {
      const updated = await action();
      setRoom(updated);
      if (success) setToast(success);
      return true;
    } catch (error) {
      setToast(
        error instanceof Error
          ? error.message
          : "Something went wrong. Please try again.",
      );
      if (code) void readRoom(code).then(setRoom).catch(() => undefined);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function ensureIdentity(): Promise<LocalIdentity> {
    const updated = await saveIdentity(name);
    setIdentity(updated);
    setName(updated.name);
    return updated;
  }

  async function handleCreate() {
    if (busy) return;
    setBusy(true);
    try {
      const current = await ensureIdentity();
      const created = await createRoom(current);
      setRoomUrl(created.code);
      setRoom(created);
      setPage("rooms");
      setJoinOpen(false);
      setToast("Private room created. Share your invitation link with friends.");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Unable to create the room.");
    } finally {
      setBusy(false);
    }
  }

  async function handleJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setJoinError("");
    try {
      const current = await ensureIdentity();
      const joined = await joinRoom(joinCode, current);
      setRoomUrl(joined.code);
      setRoom(joined);
      setJoinOpen(false);
      setPage("rooms");
      setToast("You joined the room.");
    } catch (error) {
      setJoinError(
        error instanceof Error ? error.message : "Unable to join this room.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleLeave() {
    if (room && isMember && !(await applyAction(() => leaveRoom(room)))) return;
    setRoomUrl("");
    setRoom(null);
    setPage("rooms");
  }

  async function handleCopy(value: string, message: string) {
    try {
      await navigator.clipboard.writeText(value);
      setToast(message);
    } catch {
      setToast(
        "Copy is unavailable here. Select the link or code to share it.",
      );
    }
  }

  return (
    <div className="app-shell">
      <aside className="nav-rail">
        <Logo />
        <nav className="rail-links" aria-label="Main navigation">
          <button
            className={!showBoard ? "active" : ""}
            onClick={() => setPage("rooms")}
            type="button"
          >
            <Home size={27} />
            <span>Rooms</span>
          </button>
          <button
            className={showBoard ? "active" : ""}
            onClick={() => setPage("board")}
            type="button"
          >
            <div className="nav-hex">
              <span>⬢</span>
            </div>
            <span>Play</span>
          </button>
          <button onClick={() => setHelpOpen(true)} type="button">
            <BookOpen size={27} />
            <span>Guides</span>
          </button>
          <button onClick={() => setSettingsOpen(true)} type="button">
            <span>Settings</span>
          </button>
        </nav>
        <div className="rail-bottom">
          <Globe2 size={19} />
          <span>{room && isMember ? "EN" : "Guest player"}</span>
        </div>
      </aside>

      <main className={`main-content ${showBoard ? "main-game" : ""}`}>
        {!showBoard && (
          <header className="topbar entry-topbar">
            {room && isMember ? (
              <>
                <div className="entry-identity">
                  <span>{identity.name || "Guest player"}</span>
                </div>
                <span className="entry-topbar-caption">Friends-only room</span>
                <div className="entry-account-avatar" aria-hidden="true">
                  <img src="/assets/figma/room-account-avatar.svg" alt="" />
                  <span>{(identity.name || "Guest player").charAt(0).toUpperCase()}</span>
                </div>
              </>
            ) : (
              <>
                <div className="entry-identity">
                  <label className="sr-only" htmlFor="entry-name">Your display name</label>
                  <input
                    id="entry-name"
                    value={name}
                    maxLength={24}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Guest player"
                    title="Your display name"
                  />
                </div>
                <span className="entry-topbar-caption">Friends-only room</span>
                <div className="entry-account-avatar" aria-hidden="true">
                  <img src="/assets/figma/room-account-avatar.svg" alt="" />
                  <span>{(name.trim() || "Guest player").charAt(0).toUpperCase()}</span>
                </div>
              </>
            )}
          </header>
        )}

        {!identityResolved ? <div className="sign-in-screen"><div className="sign-in-card">Connecting…</div></div> : !isSignedIn ? (
          <SignInScreen onVerified={(signedIn) => { setIdentity(signedIn); setName(signedIn.name); setToast("Signed in. You can join your friends now."); }} />
        ) : showBoard ? (
          room && isMember && (room.status === "in_game" || room.status === "completed") ? (
            <MatchView
              room={room}
              identity={identity}
              onBack={() => setPage("rooms")}
              onCopy={() => handleCopy(roomLink(room.code), "Invite link copied.")}
              onChat={(message) => applyAction(() => sendChat(room, message))}
            />
          ) : (
            <BoardPreview
              room={isMember ? room : null}
              onBack={() => setPage("rooms")}
              onCopy={() =>
                room && handleCopy(roomLink(room.code), "Invite link copied.")
              }
            />
          )
        ) : room && isMember ? (
          <RoomScreen
            room={room}
            identity={identity}
            isHost={isHost}
            busy={busy}
            onCopy={handleCopy}
            onLeave={handleLeave}
            onSeats={(count) =>
              applyAction(
                () => updateSeats(room, count),
                "Player count updated. Friends will need to ready up again.",
              )
            }
            onTimer={(seconds) =>
              applyAction(
                () => updateTurnTimer(room, seconds),
                "Turn timer updated. Friends will need to ready up again.",
              )
            }
            onReady={(ready) =>
              applyAction(() => setReady(room, ready))
            }
            onStart={() =>
              applyAction(
                () => startRoom(room),
                "Game started.",
              )
            }
            onBoard={() => setPage("board")}
            onChat={(message) =>
              applyAction(() => sendChat(room, message))
            }
            onKick={(userId) =>
              applyAction(() => kickMember(room, userId), "Friend removed from this room.")
            }
          />
        ) : (
          <RoomsEntry
            onCreate={handleCreate}
            onJoin={() => {
              setJoinError("");
              setJoinOpen(true);
            }}
            invitedCode={code}
            invitedRoom={room}
            isLocalPreview={isLocalPreview}
            busy={busy}
          />
        )}
      </main>

      {joinOpen && isSignedIn && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setJoinOpen(false);
          }}
        >
          <form
            className="dialog join-dialog"
            onSubmit={handleJoin}
            role="dialog"
            aria-modal="true"
            aria-labelledby="join-title"
          >
            <div className="dialog-header">
              <h2 id="join-title">Enter Room ID</h2>
              <IconButton label="Close" onClick={() => setJoinOpen(false)}>
                <X size={22} />
              </IconButton>
            </div>
            <label htmlFor="join-code">Enter the room ID you want to join</label>
            <input
              id="join-code"
              className="code-input"
              value={joinCode}
              maxLength={16}
              onChange={(event) => {
                setJoinCode(normalizeCode(event.target.value));
                setJoinError("");
              }}
              placeholder=""
              autoComplete="off"
              autoFocus
            />
            <span className="join-count">{joinCode.length}/16</span>
            {joinError && (
              <p className="form-error" role="alert">
                {joinError}
              </p>
            )}
            <div className="dialog-actions">
              <button
                type="button"
                className="button join-cancel"
                onClick={() => setJoinOpen(false)}
                aria-label="Cancel join"
              >
                <X size={27} />
              </button>
              <button
                className="button join-confirm"
                disabled={!joinCode || busy}
                type="submit"
                aria-label="Confirm join"
              >
                <Check size={27} />
              </button>
            </div>
          </form>
        </div>
      )}

      {helpOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setHelpOpen(false);
          }}
        >
          <div
            className="dialog help-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-title"
          >
            <div className="dialog-header">
              <h2 id="help-title">Play with friends</h2>
              <IconButton label="Close" onClick={() => setHelpOpen(false)}>
                <X size={22} />
              </IconButton>
            </div>
            <ol>
              <li>
                Create a private room and send its link or code to friends.
              </li>
              <li>
                Choose three to six seats. Friends join and mark themselves
                ready.
              </li>
              <li>
                The host starts when at least three players are present and
                everyone is ready.
              </li>
              <li>
                On the island, collect resources, build, trade, and reach 10
                points.
              </li>
            </ol>
            <button
              className="button primary full-width"
              type="button"
              onClick={() => setHelpOpen(false)}
            >
              Got it
            </button>
          </div>
        </div>
      )}
      {settingsOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setSettingsOpen(false);
        }}>
          <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title">
            <div className="dialog-header">
              <h2 id="settings-title">Settings</h2>
              <IconButton label="Close" onClick={() => setSettingsOpen(false)}><X size={22} /></IconButton>
            </div>
            <label htmlFor="settings-name">Your display name</label>
            <input id="settings-name" value={name} maxLength={24} onChange={(event) => setName(event.target.value)} placeholder="Guest player" />
            <p>Your name is used when you create or join your next room.</p>
            <button className="button primary full-width" type="button" onClick={() => setSettingsOpen(false)}>Done</button>
            {isSignedIn && <button className="sign-in-link" type="button" onClick={() => void signOut().then(() => {
              setIdentity({ id: "", name: getIdentity().name });
              setRoom(null);
              setPage("rooms");
              setSettingsOpen(false);
            }).catch((error: unknown) => setToast(error instanceof Error ? error.message : "Could not sign out."))}>Sign out</button>}
          </div>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
        </div>
      )}
    </div>
  );
}

function RoomsEntry({
  onCreate,
  onJoin,
  invitedCode,
  invitedRoom,
  isLocalPreview,
  busy,
}: {
  onCreate: () => void;
  onJoin: () => void;
  invitedCode: string;
  invitedRoom: RoomView | null;
  isLocalPreview: boolean;
  busy: boolean;
}) {
  const [activeTab, setActiveTab] = useState<"rooms" | "guide">("rooms");
  return (
    <div className="entry-layout">
      <div className="entry-main">
        <div className="entry-table">
          <div className="entry-tabs" role="tablist" aria-label="Private room information">
            <button type="button" role="tab" aria-selected={activeTab === "rooms"} className={activeTab === "rooms" ? "active" : ""} onClick={() => setActiveTab("rooms")}>Private Rooms</button>
            <button type="button" role="tab" aria-selected={activeTab === "guide"} className={activeTab === "guide" ? "active" : ""} onClick={() => setActiveTab("guide")}>How It Works</button>
          </div>
          {activeTab === "rooms" ? (
            <>
              <div className="entry-table-head">
                <span>Room</span><span>Mode</span><span>Players</span><span>Status</span>
              </div>
              <div className="entry-example-row" aria-label={invitedCode ? `Invited room ${invitedCode}` : "Example room"}>
                <span>{invitedCode ? `${invitedCode.slice(0, 4)}…${invitedCode.slice(-4)}` : "A1B2…0718"}</span>
                <span>Base</span>
                <span>{invitedRoom ? `${invitedRoom.players.length} / ${invitedRoom.settings.maxPlayers}` : "3 / 4"}</span>
                <span>{invitedRoom?.status === "in_game" ? "Playing" : "Waiting"}</span>
              </div>
              <div className="entry-empty">
                <h1>{invitedCode ? "You've been invited to a room" : "Continue a room or start a new game"}</h1>
                <p>{invitedCode ? `Join room ${invitedCode} to play with your friends.` : "Private rooms are visible only to the friends you invite."}</p>
                <small>{invitedCode ? "Use Join Room below to take a seat." : "Create a room or join with a code below."}</small>
                {isLocalPreview && <small className="preview-note">Local preview: friends on other devices need the Supabase connection.</small>}
              </div>
            </>
          ) : (
            <div className="entry-how">
              <h1>Play with friends</h1>
              <ol><li>Create a private room.</li><li>Share the invite link or code.</li><li>Wait for friends to join and ready up.</li><li>Start the game and play to 10 points.</li></ol>
              <p>Rooms are private and only people with an invite can join.</p>
            </div>
          )}
        </div>
        <div className="entry-actions">
          <button
            className="button create-button"
            type="button"
            onClick={onCreate}
            disabled={busy}
          >
            <span>{busy ? "Working…" : "Create Room"}</span>
          </button>
          <button className="button join-button" type="button" onClick={onJoin} disabled={busy}>
            <span>{invitedCode ? "Join Invited Room" : "Join Room"}</span>
          </button>
        </div>
      </div>
      <aside className="entry-side">
        <h2>Play with friends</h2>
        <ol><li>Create a private room</li><li>Send the invite link</li><li>Wait until friends are ready</li></ol>
        <small>Private match · 3–6 players · 10 points</small>
      </aside>
    </div>
  );
}

function RoomScreen({
  room,
  identity,
  isHost,
  busy,
  onCopy,
  onLeave,
  onSeats,
  onTimer,
  onReady,
  onStart,
  onBoard,
  onChat,
  onKick,
}: {
  room: RoomView;
  identity: LocalIdentity;
  isHost: boolean;
  busy: boolean;
  onCopy: (text: string, message: string) => void;
  onLeave: () => void;
  onSeats: (count: 3 | 4 | 5 | 6) => void;
  onTimer: (seconds: 60 | 90 | 120 | 180) => void;
  onReady: (ready: boolean) => void;
  onStart: () => void;
  onBoard: () => void;
  onChat: (text: string) => Promise<boolean>;
  onKick: (userId: string) => Promise<boolean>;
}) {
  const [chatDraft, setChatDraft] = useState("");
  const [roomSettingsOpen, setRoomSettingsOpen] = useState(true);
  const [mobileRoomTab, setMobileRoomTab] = useState<"players" | "settings">("players");
  const self = room.players.find((player) => player.id === identity.id);
  const openSeats = Math.max(0, room.settings.maxPlayers - room.players.length);
  const readyCount = room.players.filter((player) => player.ready).length;
  const inviteUrl = useMemo(() => roomLink(room.code), [room.code]);

  async function handleChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!chatDraft.trim()) return;
    if (await onChat(chatDraft)) setChatDraft("");
  }

  return (
    <div className={`room-layout mobile-${mobileRoomTab}`}>
      <div className="mobile-room-header">
        <button type="button" onClick={onLeave} aria-label="Leave room">‹</button>
        <strong>Room ID {room.code.slice(0, 4)}…{room.code.slice(-4)}</strong>
      </div>
      <div className="mobile-room-tabs" role="tablist" aria-label="Room views">
        <button type="button" role="tab" aria-selected={mobileRoomTab === "settings"} onClick={() => setMobileRoomTab("settings")}>Settings</button>
        <button type="button" role="tab" aria-selected={mobileRoomTab === "players"} onClick={() => setMobileRoomTab("players")}>Players ({room.players.length}/{room.settings.maxPlayers})</button>
      </div>
      <section
        className="room-panel players-panel"
        aria-labelledby="players-heading"
      >
        <h2 id="players-heading">
          Players <span>{room.players.length} / {room.settings.maxPlayers}</span>
        </h2>
        <div className="player-list">
          {room.players.map((player) => (
            <div className="player-card" key={player.id}>
              <div className="player-card-top">
                <img className="seat-avatar" src={player.id === room.hostId ? "/assets/figma/room-seat-avatar.svg" : "/assets/figma/room-seat-avatar-alt.svg"} alt="" />
                <div className="player-identity">
                  <strong>
                    {player.id === room.hostId && player.id === identity.id ? "You (host)" : player.name}
                  </strong>
                  <span className="desktop-player-meta">Karma: 0/0</span>
                  <span className="mobile-player-meta">{player.id === room.hostId ? "Host · " : ""}{player.color} pieces</span>
                </div>
                {isHost && player.id !== identity.id &&
                  (room.status === "waiting" || room.status === "completed") && (
                    <button
                      className="kick-button"
                      type="button"
                      disabled={busy}
                      aria-label={`Remove ${player.name} from room`}
                      title={`Remove ${player.name} from room`}
                      onClick={() => {
                        if (window.confirm(`Remove ${player.name} from this room? They cannot rejoin.`)) {
                          void onKick(player.id);
                        }
                      }}
                    >
                      <X size={15} />
                    </button>
                  )}
              </div>
              <div className="player-card-bottom">
                <div
                  className={`player-pieces ${colorClass(player.color)}`}
                  aria-hidden="true"
                >
                  <span>●</span>
                  <span>▲</span>
                  <span>◆</span>
                </div>
                <strong className={player.ready ? "ready" : "not-ready"}>
                  {player.ready ? "READY" : "Not Ready"}
                </strong>
              </div>
            </div>
          ))}
          {Array.from({ length: openSeats }, (_, index) => (
            <div className="empty-seat" key={`empty-${index}`}>
              <img className="seat-avatar" src="/assets/figma/room-seat-avatar-alt.svg" alt="" />
              <div>
                <strong>Invite a friend</strong>
                <span>Waiting for someone to join</span>
              </div>
              <span className="empty-seat-state">OPEN SEAT</span>
            </div>
          ))}
        </div>
        <div className="players-footer">
          <button
            className="button small-green"
            type="button"
            disabled={openSeats === 0}
            onClick={() => onCopy(inviteUrl, "Invite link copied.")}
          >
            {openSeats === 0 ? "Room Full" : "Invite Friend"}
          </button>
          <p>{openSeats === 0 ? "All seats are filled." : "Share the link to fill the open seat."}</p>
        </div>
      </section>

      <section
        className="room-panel config-panel"
        aria-labelledby="room-heading"
      >
        <div className="config-heading">
          <h1 id="room-heading">
            Room ID: <span>{room.code}</span>
          </h1>
          <IconButton label="Leave room" onClick={onLeave}>
            <X size={24} />
          </IconButton>
        </div>
        <div className="config-scroll">
          <section className="config-section invite-section">
            <h2>Invite Friends</h2>
            <div className="invite-copy">
              <input
                aria-label="Invite link"
                value={inviteUrl}
                readOnly
                onFocus={(event) => event.target.select()}
              />
              <button
                className="button small-green"
                type="button"
                onClick={() => onCopy(inviteUrl, "Invite link copied.")}
              >
                Copy
              </button>
            </div>
            <p className="invite-help">Only friends with your link can join.</p>
          </section>
          <section className="config-section">
            <h2>Game Mode</h2>
            <div className="option-row">
              <div className="option-card selected">
                <HexArt kind="mode" />
                <span>Base</span>
              </div>
              <div
                className="option-card unavailable"
                title="Coming after the Base game"
              >
                <HexArt kind="mode" />
                <span>Later</span>
              </div>
              <div className="option-card unavailable" title="Coming after the Base game"><HexArt kind="mode" /><span>Later</span></div>
            </div>
          </section>
          <section className="config-section">
            <h2>Map</h2>
            <div className="option-row">
              <div className={`option-card ${room.settings.map === "base" ? "selected" : ""}`}>
                <HexArt kind="map" />
                <span>Standard</span>
              </div>
              <div className={`option-card ${room.settings.map === "large" ? "selected" : ""}`}>
                <HexArt kind="map" />
                <span>Expanded<br />5–6 players</span>
              </div>
              <div className="option-card unavailable" title="More maps are planned"><HexArt kind="map" /><span>More soon</span></div>
            </div>
            <p className="setting-note">The map changes automatically with the room size.</p>
          </section>
          <p className="mobile-settings-summary">{room.settings.map === "large" ? "5–" : "3–"}{room.settings.maxPlayers} friends · 10 points · {room.settings.turnTimerSeconds}s turns</p>
          {roomSettingsOpen && <>
          <section className="config-section">
            <h2>
              Rules <Info size={17} />
            </h2>
            <div className="option-row rule-options">
              <div className="option-card selected">
                <HexArt kind="private" />
                <span>
                  Private
                  <br />
                  Game
                </span>
                <Check className="option-check" size={15} />
              </div>
              <div className="option-card selected">
                <HexArt kind="dice" />
                <span>
                  Standard
                  <br />
                  Dice
                </span>
                <Check className="option-check" size={15} />
              </div>
              <div className="option-card selected">
                <HexArt kind="points" />
                <span>
                  10 Points
                  <br />
                  to Win
                </span>
                <Check className="option-check" size={15} />
              </div>
            </div>
          </section>
          <section className="config-section advanced-section">
            <h2>Advanced Settings</h2>
            <div className="setting-grid">
              <div className="setting-tile">
                <div className="setting-label">
                  Turn Timer <CircleHelp size={15} />
                </div>
                <div className="setting-value">
                  <HexArt kind="clock" />
                  <select
                    className="turn-timer-select"
                    aria-label="Turn timer for the next match"
                    value={room.settings.turnTimerSeconds ?? 90}
                    disabled={!isHost || busy || room.status === "in_game"}
                    onChange={(event) => onTimer(Number(event.target.value) as 60 | 90 | 120 | 180)}
                  >
                    <option value={60}>1 minute</option>
                    <option value={90}>1½ minutes</option>
                    <option value={120}>2 minutes</option>
                    <option value={180}>3 minutes</option>
                  </select>
                </div>
              </div>
              <div className="setting-tile">
                <div className="setting-label">Max Players</div>
                <div className="stepper">
                  <button
                    type="button"
                    disabled={
                      !isHost ||
                      busy ||
                      room.settings.maxPlayers === 3 ||
                      room.players.length > room.settings.maxPlayers - 1
                    }
                    onClick={() => onSeats((room.settings.maxPlayers - 1) as 3 | 4 | 5)}
                    aria-label="Decrease maximum players"
                  >
                    ‹
                  </button>
                  <strong>{room.settings.maxPlayers}</strong>
                  <span>/6</span>
                  <button
                    type="button"
                    disabled={!isHost || busy || room.settings.maxPlayers === 6}
                    onClick={() => onSeats((room.settings.maxPlayers + 1) as 4 | 5 | 6)}
                    aria-label="Increase maximum players"
                  >
                    ›
                  </button>
                </div>
              </div>
              <div className="setting-tile">
                <div className="setting-label">Points to Win</div>
                <div className="setting-value">
                  <strong>10</strong>
                  <span>standard match</span>
                </div>
              </div>
              <div className="setting-tile">
                <div className="setting-label">Room Visibility</div>
                <div className="setting-value">
                  <LockKeyhole size={17} />
                  <strong>Private</strong>
                </div>
              </div>
            </div>
            <p className="setting-note">
              {isHost
                ? "Changing seats or the turn timer asks your friends to ready up again."
                : "The host manages room settings."}
            </p>
          </section>
          </>}
        </div>
        <div className="config-footer">
          <button className="setup-summary" type="button" aria-expanded={roomSettingsOpen} onClick={() => setRoomSettingsOpen((open) => !open)}>
            {roomSettingsOpen ? "Hide room settings" : `${room.settings.map === "large" ? "5–" : "3–"}${room.settings.maxPlayers} players   •   10 points   •   ${room.settings.turnTimerSeconds}s turns`}
          </button>
          {room.status === "in_game" ? (
            <>
              <button
                className="button start-button"
                type="button"
                onClick={onBoard}
              >
                <Play size={18} fill="currentColor" /> Return to Board
              </button>
              <span>Match preview in progress</span>
            </>
          ) : isHost ? (
            <>
              <button
                className="button start-button"
                type="button"
                disabled={!canStart(room) || busy}
                onClick={onStart}
              >
                <Play size={18} fill="currentColor" />
                {room.status === "completed" ? "Start Rematch" : "Start Game"}
              </button>
              <span>
                {canStart(room)
                  ? "Everyone is ready. Start when you are."
                  : `${readyCount}/${room.players.length} ready · Need at least ${room.settings.map === "large" ? 5 : 3} players to start`}
              </span>
            </>
          ) : (
            <label className="ready-toggle">
              <input
                type="checkbox"
                checked={self?.ready ?? false}
                disabled={busy}
                onChange={(event) => onReady(event.target.checked)}
              />
              <span className="fake-check">
                {self?.ready && <Check size={18} />}
              </span>
              <strong>I'm Ready</strong>
              <small>All players must be ready before the host starts.</small>
            </label>
          )}
        </div>
      </section>

      <section className="room-panel chat-panel" aria-labelledby="chat-heading">
        <div className="chat-heading">
          <h2 id="chat-heading">Room chat</h2>
        </div>
        <div className="chat-messages" aria-live="polite">
          {room.chat.length ? (
            room.chat.map((line) => (
              <div className="chat-line" key={line.id}>
                <div>
                  <strong
                    className={line.playerId === identity.id ? "chat-self" : ""}
                  >
                    {line.name}
                  </strong>
                  <time>{formatTime(line.sentAt)}</time>
                </div>
                <p>{line.text}</p>
              </div>
            ))
          ) : (
            <div className="chat-empty">
              <p>Room created</p>
              <span>Invite friends, then chat here while you wait.</span>
            </div>
          )}
        </div>
        <form className="chat-compose" onSubmit={handleChat}>
          <input
            aria-label="Send a message"
            placeholder="Message your friends..."
            value={chatDraft}
            maxLength={500}
            disabled={busy}
            onChange={(event) => setChatDraft(event.target.value)}
          />
          <button
            type="submit"
            aria-label="Send message"
            disabled={!chatDraft.trim() || busy}
          >
            <Send size={17} />
          </button>
        </form>
      </section>
      <div className="mobile-room-bar">
        <div className="mobile-invite-actions">
          <button type="button" disabled={openSeats === 0} onClick={() => onCopy(inviteUrl, "Invite link copied.")}>{openSeats === 0 ? "Room Full" : "Invite Friends"}</button>
          <button type="button" disabled={openSeats === 0} aria-label="Copy invite link" onClick={() => onCopy(inviteUrl, "Invite link copied.")}>↗</button>
        </div>
        {room.status === "in_game" ? (
          <button className="mobile-primary-action" type="button" onClick={onBoard}>Return to Board</button>
        ) : isHost ? (
          <button className="mobile-primary-action" type="button" disabled={!canStart(room) || busy} onClick={onStart}>
            {room.status === "completed" ? "Start Rematch" : "Start Game"}
          </button>
        ) : (
          <label className="mobile-primary-action mobile-ready-action">
            <input type="checkbox" checked={self?.ready ?? false} disabled={busy} onChange={(event) => onReady(event.target.checked)} />
            {self?.ready ? "Ready ✓" : "I'm Ready"}
          </label>
        )}
      </div>
    </div>
  );
}

export default App;
