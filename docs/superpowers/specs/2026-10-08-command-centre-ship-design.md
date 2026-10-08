# Command centre ship — design

Status: approved in conversation on 2026-10-08. Replaces the left-hand command-centre drawer.

## Goal

The command centre becomes a place. You click a launch tower in the world, fly through a warp tunnel of stars, and arrive on the bridge of a spaceship. On its console you start **fresh** conversations, working much like the Claude Code extension for VS Code. Everything to do with **existing** work happens in the world itself:

- answering agent questions and permission prompts;
- following up on a session;
- asking a lab or agent what it did.

## Decisions

| Topic | Decision |
|---|---|
| Ship fidelity | A real 3D bridge (React Three Fiber), not a 2D overlay |
| What the ship does | Fresh conversations only, plus a read-only history of what it launched |
| Following up on a session | A "Reply to this session" box in the lab panel (runs on a fork, as today) |
| Agent questions and permissions | Answered in the agent's own panel; the request cards at the top of the world are removed |
| Entry point | A launch-tower island at the centre of the ocean, plus the top-bar button |
| Projects a launch may use | Live session folders, plus folders Claude Code worked in over the last 30 days |
| Ship history | Kept across restarts in `~/.agent-world/ship-log.json` |

## Places and flow

```
WORLD (islands)                         SHIP (separate scene)
 ├─ Launch-tower island (centre)  ──►  warp tunnel (~2.5 s) ──►  Bridge
 │    beacon pulses if an agent waits                             ├─ window: drifting stars
 ├─ top-bar "Command centre" ─────────────────────────────────►   ├─ console: Launch screen + History screen
 ├─ Labs / agents: answer in place                                └─ "Return to world" lever ──► warp back
 └─ Lab panel: "Reply to this session" box (fork)
```

- **Place state:** `world → warping-in → ship → warping-out → world`. Only one `<Canvas>` is mounted at a time: the world unmounts while you're on the ship. Headless rendering runs at 2–3 fps, so drawing both would be too slow.
- **Warp in:**
  1. The camera rises along the tower for about 0.6 s.
  2. An instanced streak-star tunnel runs for about 1.6 s.
  3. It fades into the bridge over about 0.3 s.
- **Warp out** runs the same steps in reverse.
- **Reduced motion:** the tunnel and camera flights are replaced by 300 ms cross-fades.
- **Bridge:** a dark cockpit built from primitives (no new assets or dependencies), a curved console, and a large window with slowly drifting stars. Two screens are mounted on the console as drei `<Html>`, rendered through `src/web/scene/Label.tsx` (fixed portal):
  - **Launch.** Project picker (live projects first, then recent ones, each showing its branch); permission mode (Ask before risky actions / Accept file edits / Plan only); model (default, Opus, Sonnet, Haiku, Fable); effort (default, low, medium, high, xhigh, max); a prompt box; and a **Launch** button (Ctrl+Enter also launches).
  - **History.** Conversations launched from the ship, newest first, each with a status dot (Running / Finished / Failed (exit n)). Selecting one shows its conversation read-only, as chat: prompts, replies, and tool calls collapsed to one line. **Go to its lab** warps back, flies to that island and opens the lab panel.
- **Return to world:** a lever on the console, and Escape when no field has focus.

### Flow 1 — launch a fresh conversation

1. Click the tower or **Command centre**, and warp to the bridge.
2. Pick a project, permission mode, model and effort, then type the prompt.
3. Press **Launch**. The server replies `{launchId, sessionId}`. History selects the new entry, and its thread fills in as the transcript grows.
4. Back in the world, the new session rises as its own island.

### Flow 2 — read and follow up

1. In History, pick an entry to read it.
2. **Go to its lab** opens the lab panel in the world.
3. **Reply to this session** in the lab panel runs `claude -p --resume <id> --fork-session …`. The fork becomes its own island and its own History entry, labelled "Reply to …".

### Flow 3 — an agent is waiting on you

1. Several signals appear: the agent's pink bubble pulses, the top bar shows **"N waiting"**, and the tower beacon flashes. On the ship, a console light flashes as well.
2. Click the chip, the bubble or the console light. The camera flies to the agent (warping back first if you're on the ship) and its panel opens with the form at the top.
3. Answer. The form closes, and the agent's status changes as the transcript moves on.
4. With no answer, the normal dialog appears in the session after 120 s, as today.

## Server

### `src/server/projects.ts` (new)

Builds the known projects:

- the `cwd` of every live session;
- for each `<claudeDir>/projects/<dir>/`, the newest `*.jsonl` changed in the last 30 days. The `cwd` comes from its first 64 KB of lines; the folder name is lossy, so it is never decoded.

Each project has an id: the first 16 hex characters of `sha256(cwd)`. The list is cached for 30 s.

Each entry also records:
- `name` (base name of the folder);
- `branch` (from the transcript's `gitBranch`, when present);
- `live` (whether a live session runs there).

`GET /api/projects` returns `{id, name, branch, live}` only, never the full path. At launch the server looks up the id in its own list and checks the folder still exists. A missing folder gives a 404 and refreshes the list.

### `POST /api/launches` (new)

Body: `{projectId, prompt, permissionMode, model?, effort?}`.

- `prompt` uses the existing `validatePrompt`: at most 20,000 characters; no `/`, `!` or leading `-`.
- `permissionMode` must be one of `default`, `acceptEdits` or `plan`.
- `model` must be one of `opus`, `sonnet`, `haiku` or `fable`, or be absent.
- `effort` must be one of `low`, `medium`, `high`, `xhigh` or `max`, or be absent.

It runs, in the project folder:

`claude -p --session-id <uuid> --name <prompt preview, 60 chars> --permission-mode <mode> [--model <m>] [--effort <e>] <prompt>`

The server generates the uuid, so the transcript is known before its first line is written. The run uses the existing limits (3 at once, 30 minutes each), its own process group, and a kill on stop or shutdown. Reply: `{launchId, sessionId}`.

### `POST /api/runs` (changed)

It keeps only *continue on a fork*, for the lab reply box, and the `mode` field goes. New tasks use `/api/launches`. The run is also written to the ship log, marked as a reply.

### Ship log (new)

`~/.agent-world/ship-log.json` holds at most the 200 newest entries:

`{id, kind: 'launch' | 'reply', sessionId, projectId, projectName, promptPreview (280 chars), model, effort, permissionMode, startedAt, endedAt, state, exitCode}`

- It is written to a temporary file with mode 600 and renamed into place. The folder is forced to mode 700, under the same rules as `server.json`.
- If the file is missing or unreadable, history starts empty, the reason is logged to stderr, and the file is overwritten at the next write.
- Agent World still never writes under the Claude config folder.

The ship log is streamed to the browser with `control.runs`, which replaces `ControlRun[]` in the summary.

### `GET /api/conversations/:sessionId` (new)

A chat view of one transcript. The session id must match `[\w-]+` and belong to a live session or a ship-log entry; otherwise the server answers 404. It reuses `normalize.ts`, and a new pure `src/shared/conversation.ts` reduces the events to:

`{kind: 'prompt' | 'reply' | 'tool', text | tool+summary+state, at}`

The result is capped at the 2,000 newest items. The browser refetches it every 2 s while the view is open and the session is live.

### Matching a request to an agent

The hook adds `tool_use_id` to the request when Claude Code's hook input carries it (the first plan task checks this). The browser matches a request to an agent in this order:

1. the scientist whose `current.toolUseId` equals that id;
2. otherwise the only scientist in the session that is `asking` (for questions) or `working` on that tool (for permissions);
3. otherwise a **Waiting on you** section at the top of that session's newest lab panel.

## Web

| Piece | Role |
|---|---|
| `src/web/state/place.ts` | Place state machine and its timings. `App.tsx` switches the scene on it. |
| `src/web/scene/LaunchTower.tsx` | Centre island with a tower, a rocket and a beacon (flashing while any request is open). Clicking it starts the warp. |
| `src/web/scene/layout.ts` | `continentPlacements` keeps a free centre for the tower island |
| `src/web/ship/ShipScene.tsx` | Separate `<Canvas>` for the warp and the bridge |
| `src/web/ship/WarpTunnel.tsx` | Instanced streak-star tunnel |
| `src/web/ship/Bridge.tsx` | Cockpit, console, window stars, Return lever, and a console light while a request is open |
| `src/web/ship/LaunchScreen.tsx` | The launch form |
| `src/web/ship/HistoryScreen.tsx` | The ship log and the selected conversation |
| `src/web/ui/Conversation.tsx` | The chat reader, shared by History and a "Read conversation" link in the lab panel |
| `src/web/ui/RequestForm.tsx` | The question and permission form, moved from `RequestCards.tsx` and shown in the agent panel or the lab's Waiting on you section |
| `src/web/ui/ReplyBox.tsx` | "Reply to this session" at the bottom of the lab panel |
| `src/web/ui/Hud.tsx` | A "N waiting" chip that flies to the oldest waiting agent; the Command centre button starts the warp |

Removed: `src/web/ui/CommandCentre.tsx` and `src/web/ui/RequestCards.tsx`. `answerFor` moves to `RequestForm.tsx` with its tests.

The overlay styling from the restyle is kept: one sans font, slate surfaces, one amber accent, and status shown as dots. The console screens add a faint scan-line and a glow around the screen edge.

## Errors and edge cases

| Case | Behaviour |
|---|---|
| Control off (no `--allow-control`) | The tower and ship still work. Launch shows how to turn control on; the reply box and request forms are hidden. |
| Project folder gone | 404 "That project folder no longer exists"; the project list refreshes |
| Run limit reached | 429 with the existing message; shown under Launch |
| `claude` exits non-zero | History shows Failed (exit n) and keeps whatever transcript exists |
| Ship log missing or corrupt | Empty history and a stderr line; overwritten at the next write |
| WebGL context lost during the warp | Skip to the bridge without the tunnel |
| Request already answered or expired | 409, and the form disappears, as today |
| Session from the ship log no longer exists on disk | The conversation shows "This conversation's transcript is gone" |

## Security

These are unchanged and must not regress:

- the per-start access key on every `/api/*` request and on `/ws`;
- the signed hook and the server proof;
- 409 for abandoned requests;
- a cut permission detail can't be allowed;
- a process group per run;
- no shell.

Added:

- A launch folder comes only from the server's own project list, chosen by id. The browser never sends a path.
- Model and effort are checked against allow-lists, and the prompt keeps the existing argv checks.
- The conversation endpoint is limited to live and ship-log sessions and is behind the access key.
- The ship log keeps a 280-character prompt preview, not the full prompt, and is stored with mode 600 in a mode-700 folder.

## Testing

All tests are written first. Integration and E2E fixtures call `setFixtureBase(Date.now() + 120_000)`.

**Unit tests:**
- `projects.ts`: the 30-day window, missing folders, stable ids, and paths never present in the response.
- The launch argument builder and its allow-lists.
- Ship-log read and write: atomic write, cap, corruption, permissions.
- The `conversation.ts` reducer.
- Request→agent matching.
- `place.ts` transitions and the reduced-motion path.
- Layout keeping the centre free.
- `answerFor`, moved with the form.

**Integration tests:**
- `/api/projects`.
- `/api/launches`: valid, unknown id, missing folder, bad model or effort, run limit.
- `/api/runs`: continue only.
- `/api/conversations`: allowed, refused, unknown.

All of them run with a fake `claude` binary.

**E2E tests:**
- The existing 8 are updated: "explains how to turn on the command centre" now warps to the bridge and checks the Launch screen.
- New: warp to the ship and back; launch with a fake `claude` and see the History entry; answer a question in an agent's panel; reply from the lab panel.
- Selectors stay role- and name-based. `.lab-tag--lit` and `.hud__stats` are kept.

**Screenshots** come from the demo world only: the tower island, the warp mid-frame, the bridge with Launch, the bridge with History, and an agent panel with a question.

## Build order

One commit each, with every gate green after each one:

1. Server: projects, launches, ship log, conversations, `/api/runs` change.
2. Answering requests in place, and the reply box. No 3D yet; the old drawer stays until step 5.
3. Tower island and the layout change.
4. Ship scene, warp, and place state.
5. Console screens and the conversation reader. Remove the drawer and the request cards.
6. README and `docs/design.md`.

## Out of scope

- Setup and auto-start for several tools (MOD2) and quitting with feedback (MOD3) have their own specs.
- Follow-ups inside the ship.
- Showing conversations of sessions that the ship didn't launch and that are no longer live.
