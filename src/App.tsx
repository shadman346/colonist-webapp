import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  CircleHelp,
  Copy,
  DoorOpen,
  Globe2,
  Home,
  Info,
  Link2,
  LockKeyhole,
  Map as MapIcon,
  MessageCircle,
  Play,
  Send,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import BoardPreview from "./BoardPreview";
import MatchView from "./MatchView";
import {
  canStart,
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
  sendChat,
  setReady,
  startRoom,
  updateSeats,
  type LocalIdentity,
  type PlayerColor,
  type RoomView,
} from "./room/roomService";

type Page = "rooms" | "board";

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
    return (
      <div className="hex-art mode-art" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
        <i />
        <i />
        <i />
      </div>
    );
  }
  if (kind === "map") {
    return (
      <div className="hex-art island-art" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
        <i />
        <i />
        <i />
        <i />
        <i />
      </div>
    );
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

  const isMember = Boolean(
    room?.players.some((player) => player.id === identity.id),
  );
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
    if (!identityResolved) return;
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

  const roomTitle = room && isMember ? `Room ${room.code}` : "Private rooms";

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
            <span>Board</span>
          </button>
          <button onClick={() => setHelpOpen(true)} type="button">
            <BookOpen size={27} />
            <span>How to play</span>
          </button>
        </nav>
        <div className="rail-bottom">
          <Globe2 size={19} />
          <span>EN</span>
        </div>
      </aside>

      <main className={`main-content ${showBoard ? "main-game" : ""}`}>
        {!showBoard && (
          <header className="topbar">
            <div className="topbar-title">
              <span className="mobile-brand">
                <Logo />
              </span>
              <span>{roomTitle}</span>
            </div>
            <div className="topbar-right">
              <span className="identity-pill">
                <span className="identity-dot" />
                {identity.name || "Guest"}
              </span>
              <span className="private-pill">
                <LockKeyhole size={15} /> Friends only
              </span>
            </div>
          </header>
        )}

        {showBoard ? (
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
            name={name}
            onNameChange={setName}
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

      {joinOpen && (
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
            aria-labelledby="join-title"
          >
            <div className="dialog-header">
              <h2 id="join-title">Enter Room ID</h2>
              <IconButton label="Close" onClick={() => setJoinOpen(false)}>
                <X size={22} />
              </IconButton>
            </div>
            <p>Enter the code a friend shared with you.</p>
            <label htmlFor="join-name">Your name</label>
            <input
              id="join-name"
              value={name}
              maxLength={24}
              onChange={(event) => setName(event.target.value)}
              placeholder="How should friends see you?"
              autoFocus
            />
            <div className="input-heading">
              <label htmlFor="join-code">Room ID</label>
              <span>{joinCode.length}/16</span>
            </div>
            <input
              id="join-code"
              className="code-input"
              value={joinCode}
              maxLength={16}
              onChange={(event) => {
                setJoinCode(normalizeCode(event.target.value));
                setJoinError("");
              }}
              placeholder="Example: A1B2C3D4E5F60708"
              autoComplete="off"
            />
            {joinError && (
              <p className="form-error" role="alert">
                {joinError}
              </p>
            )}
            <div className="dialog-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setJoinOpen(false)}
              >
                Cancel
              </button>
              <button
                className="button primary"
                disabled={!joinCode || busy}
                type="submit"
              >
                Join room <ArrowRight size={19} />
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
                Choose three or four seats. Friends join and mark themselves
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
  name,
  onNameChange,
  onCreate,
  onJoin,
  invitedCode,
  invitedRoom,
  isLocalPreview,
  busy,
}: {
  name: string;
  onNameChange: (name: string) => void;
  onCreate: () => void;
  onJoin: () => void;
  invitedCode: string;
  invitedRoom: RoomView | null;
  isLocalPreview: boolean;
  busy: boolean;
}) {
  return (
    <div className="entry-layout">
      <div className="entry-main">
        <div className="entry-tabs">
          <div className="active">
            <Users size={17} /> Private Rooms
          </div>
          <div>
            <LockKeyhole size={17} /> Friends only
          </div>
        </div>
        <div className="entry-table-head">
          <span>Room</span>
          <span>Mode</span>
          <span>Players</span>
          <span>Settings</span>
        </div>
        <div className="entry-empty">
          {invitedCode ? (
            <>
              <div className="entry-invite-icon">
                <Link2 size={29} />
              </div>
              <h1>You've been invited</h1>
              <p>
                Join room <strong>{invitedCode}</strong> to play with your
                friends.
              </p>
              {invitedRoom && <span className="invite-found">Room is ready for you.</span>}
            </>
          ) : (
            <>
              <div className="entry-invite-icon">
                <Users size={32} />
              </div>
              <h1>Bring your friends to the table</h1>
              <p>
                Create a private Base game or join with a friend's room code. No
                public lobby or ranking is needed.
              </p>
            </>
          )}
          <div className="name-field">
            <label htmlFor="entry-name">Your display name</label>
            <input
              id="entry-name"
              value={name}
              maxLength={24}
              onChange={(event) => onNameChange(event.target.value)}
              placeholder="Enter your name"
            />
          </div>
          <div className="entry-features">
            <span>
              <ShieldCheck size={17} /> Private by default
            </span>
            <span>
              <MapIcon size={17} /> Base map
            </span>
            <span>
              <Users size={17} /> 3–4 friends
            </span>
          </div>
          {isLocalPreview && (
            <p className="preview-note">
              Local preview: rooms sync between tabs in this browser. Online
              friends need Supabase to be configured.
            </p>
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
            <ChevronRight size={25} />
          </button>
          <button className="button join-button" type="button" onClick={onJoin} disabled={busy}>
            <span>{invitedCode ? "Join Invited Room" : "Join Room"}</span>
            <ChevronRight size={25} />
          </button>
        </div>
      </div>
      <aside className="entry-side">
        <div className="entry-side-art">
          <div className="mini-island">
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
          </div>
        </div>
        <span className="eyebrow">A table for your crew</span>
        <h2>One link. One island. Your people.</h2>
        <p>
          Set up the room, invite friends, and settle in for a familiar strategy
          night.
        </p>
        <div className="side-facts">
          <span>Base game</span>
          <span>10 points</span>
          <span>No turn timer</span>
        </div>
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
  onSeats: (count: 3 | 4) => void;
  onReady: (ready: boolean) => void;
  onStart: () => void;
  onBoard: () => void;
  onChat: (text: string) => Promise<boolean>;
  onKick: (userId: string) => Promise<boolean>;
}) {
  const [chatDraft, setChatDraft] = useState("");
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
    <div className="room-layout">
      <section
        className="room-panel players-panel"
        aria-labelledby="players-heading"
      >
        <h2 id="players-heading">
          Players{" "}
          <span>
            ({room.players.length}/{room.settings.maxPlayers})
          </span>
        </h2>
        <div className="player-list">
          {room.players.map((player) => (
            <div className="player-card" key={player.id}>
              <div className="player-card-top">
                <div className={`avatar ${colorClass(player.color)}`}>
                  {player.name.charAt(0).toUpperCase()}
                </div>
                <div className="player-identity">
                  <strong>
                    {player.name}{" "}
                    {player.id === identity.id && <small>(You)</small>}
                  </strong>
                  <span>
                    {player.id === room.hostId ? "Host" : "Friend"} · Base game
                  </span>
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
                {player.id === room.hostId && (
                  <span className="host-dot" title="Host">
                    ★
                  </span>
                )}
              </div>
              <div className="player-card-bottom">
                <div
                  className={`player-pieces ${colorClass(player.color)}`}
                  aria-hidden="true"
                >
                  <span>⬢</span>
                  <span>◆</span>
                  <span>●</span>
                </div>
                <strong className={player.ready ? "ready" : "not-ready"}>
                  {player.ready ? "READY" : "Not Ready"}
                </strong>
              </div>
            </div>
          ))}
          {Array.from({ length: openSeats }, (_, index) => (
            <div className="empty-seat" key={`empty-${index}`}>
              <div className="empty-avatar">
                <Users size={19} />
              </div>
              <div>
                <strong>Waiting for a friend</strong>
                <span>Share the link to fill this seat</span>
              </div>
            </div>
          ))}
        </div>
        <div className="players-footer">
          <h3>
            Friends ({room.players.length}/{room.settings.maxPlayers})
          </h3>
          <p>
            <Link2 size={17} /> Everyone joins through this private room link.
          </p>
          <button
            className="button small-green"
            type="button"
            onClick={() => onCopy(inviteUrl, "Invite link copied.")}
          >
            Copy invite link <Copy size={16} />
          </button>
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
            <h2>
              Invite Friends <Info size={17} />
            </h2>
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
                Copy <Copy size={16} />
              </button>
            </div>
            <div className="code-line">
              <LockKeyhole size={15} />
              <span>
                Private room · code <strong>{room.code}</strong>
              </span>
              <button
                type="button"
                onClick={() => onCopy(room.code, "Room code copied.")}
              >
                Copy code
              </button>
            </div>
          </section>
          <section className="config-section">
            <h2>Game Mode</h2>
            <div className="option-row">
              <div className="option-card selected">
                <HexArt kind="mode" />
                <span>Base</span>
                <Check className="option-check" size={15} />
              </div>
              <div
                className="option-card unavailable"
                title="Coming after the Base game"
              >
                <HexArt kind="mode" />
                <span>More modes</span>
                <small>Later</small>
              </div>
            </div>
          </section>
          <section className="config-section">
            <h2>Map</h2>
            <div className="option-row">
              <div className="option-card selected">
                <HexArt kind="map" />
                <span>Base</span>
                <Check className="option-check" size={15} />
              </div>
              <div
                className="option-card unavailable"
                title="Larger maps are planned"
              >
                <HexArt kind="map" />
                <span>Larger maps</span>
                <small>Later</small>
              </div>
            </div>
          </section>
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
                  <strong>Off</strong>
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
                      room.players.length > 3
                    }
                    onClick={() => onSeats(3)}
                    aria-label="Decrease players to three"
                  >
                    ‹
                  </button>
                  <strong>{room.settings.maxPlayers}</strong>
                  <span>/4</span>
                  <button
                    type="button"
                    disabled={!isHost || busy || room.settings.maxPlayers === 4}
                    onClick={() => onSeats(4)}
                    aria-label="Increase players to four"
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
                ? "Changing the seat count asks your friends to ready up again."
                : "The host manages room settings."}
            </p>
          </section>
        </div>
        <div className="config-footer">
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
                  : `${readyCount}/${room.players.length} ready · Need at least 3 friends to start`}
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
          <MessageCircle size={22} />
          <h2 id="chat-heading">Chat</h2>
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
              <MessageCircle size={28} />
              <p>Say hello to your friends.</p>
              <span>Messages stay in this room.</span>
            </div>
          )}
        </div>
        <form className="chat-compose" onSubmit={handleChat}>
          <input
            aria-label="Send a message"
            placeholder="Send a message"
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
        <button
          type="button"
          onClick={() => onCopy(inviteUrl, "Invite link copied.")}
        >
          <Copy size={18} /> Copy invite
        </button>
        <button type="button" onClick={onLeave}>
          <DoorOpen size={18} /> Leave room
        </button>
      </div>
    </div>
  );
}

export default App;
