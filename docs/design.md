# Agent World — design

A local, read-only, zero-token 3D view of every Claude Code agent working on this machine.

## Goals

- Show, in real time, which Claude Code sessions are live, what each agent and subagent is doing, and what files they changed.
- Personify the work: **Claude Code is the world, each live session is a continent, each prompt is a lab, each agent is a scientist in that lab.**
- Cost nothing to run: no model calls, no tokens. It only reads files Claude Code already writes.
- Shareable: any developer runs it on their own machine and sees only their own agents.

## Non-goals

- No team/central view. Nothing leaves the machine.
- No control of agents by default. The tool never writes to `~/.claude`; it sends input to a session only through the opt-in command centre below.
- No history of closed sessions. When a session ends, its continent is removed.
- No guessing whether a prompt is a follow-up. Every human prompt is its own lab.

## Data sources (read-only)

| Source | Gives |
|---|---|
| `<claudeDir>/sessions/<pid>.json` | Live sessions: `pid`, `sessionId`, `cwd`, `kind`, `entrypoint`, `startedAt`, `procStart` |
| `<claudeDir>/projects/<project>/<sessionId>.jsonl` | Main agent transcript, appended as the session runs |
| `<claudeDir>/projects/<project>/<sessionId>/subagents/agent-<id>.jsonl` | One transcript per subagent |
| `…/agent-<id>.meta.json` | Subagent role (`agentType`), `description`, spawning `toolUseId`, `spawnDepth` |

`<claudeDir>` is `$CLAUDE_CONFIG_DIR` when set, else `~/.claude`.

A session is live when its registry file exists and its pid is alive. On Linux the pid's start time (`/proc/<pid>/stat` field 22) must equal `procStart`, which guards against pid reuse.

## World model

```
World
└─ Session (continent)       one per live session
   └─ Lab                    one per human prompt, in order
      ├─ prompt              the cleaned prompt text
      ├─ Scientist[]         "main" plus one per subagent spawned in this lab
      ├─ Change[]            Edit / Write / NotebookEdit calls (file, old text, new text)
      └─ Timeline[]          ordered actions, used for replay
```

### Transcript → world rules

| Line | Meaning |
|---|---|
| `type:"user"`, `origin.kind:"human"` or `turnOrigin:"human"`, not a tool result | Opens a new lab |
| `type:"assistant"` with `tool_use` blocks | Scientist starts an action |
| `type:"user"` with `tool_result` blocks | That action finished (`is_error` kept) |
| `type:"assistant"` text with `stop_reason:"end_turn"` | Scientist finished; for a subagent this text is its report |
| `[Request interrupted by user…]` | Scientist interrupted |
| Anything else | Ignored |

A subagent joins the lab whose transcript contains the `Agent` tool call matching its `meta.toolUseId`. Nested subagents work the same way through their parent's transcript. A subagent is held back for up to five ticks while its meta file is missing or its spawning call has not been read yet, then falls back to the newest lab.

Timeline entries are inserted in time order: subagent transcripts are read after the main one, and replay depends on the order.

Unknown or malformed lines are skipped. The transcript format is internal to Claude Code and can change, so a change must degrade one feature, never crash the app.

### Scientist status

| Status | When |
|---|---|
| `thinking` | Last event is assistant output without `end_turn` |
| `working` | A tool call is pending |
| `asking` | A pending `AskUserQuestion` (waiting on the human) |
| `waiting?` | Computed in the UI: a pending tool call older than 20s (may be a permission prompt or a long command) |
| `done` | Last assistant output ended the turn |
| `interrupted` | The user interrupted |

## Architecture

```
~/.claude (read-only)
   │  poll: stat + read only appended bytes
   ▼
server (Node, 127.0.0.1 only)
  registry   → live sessions
  tailer     → new JSONL lines per file
  normalize  → WorldEvent[]          (pure)
  world      → reduce into Session   (pure)
  engine     → poll loop, subagent discovery, change detection
  http       → static UI, /api/world, /api/labs/:sid/:labId, /api/control, /ws (all API paths need the access key)
   │  WebSocket: world summary on connect and on every change
   ▼
browser (React + React Three Fiber)
  3D world, HUD, hover tooltips, inspect panels, changes board, replay
```

The WebSocket carries a light **summary** (sessions, labs, scientists, statuses, counts). Heavy data (full action history, diffs, timeline) is fetched per lab over HTTP when a panel opens.

## UI

- **World:** an ocean with one continent per live session, labelled with project, branch and client (VS Code or terminal).
- **Labs:** buildings on the continent, newest first. The active lab is lit and fully furnished; finished labs are dimmed shells.
- **Stations** inside a lab, matching what a scientist is doing:

| Station | Tools |
|---|---|
| Workbench | Edit, Write, NotebookEdit |
| Microscope | Read, Grep, Glob, LSP |
| Terminal | Bash, PowerShell, Monitor |
| Library | WebFetch, WebSearch, MCP tools |
| Portal | Agent, SendMessage, task tools (spawning / coordinating) |
| Help desk | AskUserQuestion |
| Whiteboard | thinking / writing text |

- **Hover** a scientist: role, status, current action.
- **Click** a scientist: role, instruction it received, live action feed, final report.
- **Click** a lab: the original prompt, its scientists, the changes board (click a file for its diff), and replay.
- **Replay:** scrub or play a lab's timeline at 1×/4×/16×; scientists move as they did.
- **HUD:** labelled counts (sessions, busy, labs, edits), a **N waiting** chip that flies to the oldest agent waiting on you, a stuck-over-20s chip, Live, and **Command centre** (warps to the ship).
- **Lab panel:** Waiting on you (requests that could not be placed on one agent), prompt, agents, changes, **Read conversation**, and a **Reply to this session** box.

## Command centre (`--allow-control`)

Off by default; the world is then strictly read-only. With the flag, using only documented Claude Code interfaces:

| Action | Mechanism |
|---|---|
| Reply to a session (lab panel) | `claude -p --resume <id> --fork-session --session-id <uuid> --permission-mode <mode> "<prompt>"` in the session's registry `cwd`. Forking keeps the open session untouched (writing into a live non-background session from outside is unsupported). |
| Launch a fresh conversation (ship) | `claude -p --session-id <uuid> --name "<first line>" --permission-mode <mode> [--model <alias>] [--effort <level>] "<prompt>"` in a project folder chosen by id from the server's own list (`GET /api/projects`: live session folders plus folders with a transcript changed in the last 30 days, read from its `cwd`; the scan is cached 30 s, live sessions are read fresh). `POST /api/launches` returns `{launchId, sessionId}`. Models: `opus`, `sonnet`, `haiku`, `fable`; efforts: `low`…`max`. A folder that no longer exists answers 404. |
| Read a conversation | `GET /api/conversations/:sessionId`: the last 16 MB of the main transcript as chat items (prompts, replies, tool calls with their outcome), at most 2,000. Only live sessions and sessions in the ship log; anything else answers 404. |
| Explain a lab or agent | `claude -p --resume <id> --fork-session --no-session-persistence --tools "" --output-format json "<question>"` |
| Answer questions / permissions | A command hook on `PreToolUse` (matcher `AskUserQuestion`) and `PermissionRequest`. It posts the request (a permission carries the full tool input: whole command, path, URL or MCP arguments, cut only past 8,000 characters with a marker), long-polls for an answer for up to 120 s and always ends 5 s before the server drops the request. It then prints `permissionDecision: deny` with the answers as the reason (questions) or `decision.behavior` (permissions). No answer, or any error: it withdraws the request (`DELETE /api/hook-requests/:id`), exits silently, and the normal dialog appears. |

The session inbox socket was not used: its message format is not documented.

**Ship log.** Every launch and reply is recorded in `~/.agent-world/ship-log.json` (newest 200; mode 600 in a mode-700 folder, written atomically): kind, session id, project id and name, a 280-character prompt preview, model, effort, permission mode, times, state and exit code. Entries still marked running when it is read come back as failed (an earlier Agent World stopped). An unreadable file is logged and treated as empty. The newest 50 entries travel with the world summary.

**Answering in place.** A question carries the hook's `tool_use_id`, so it attaches to the agent whose pending tool call has that id. A permission prompt has no `tool_use_id` in its hook input, so it attaches to the only agent that could be waiting for it (working on that tool); when that is ambiguous nothing is guessed and it is answered in the lab's **Waiting on you** section instead.

**The ship.** The command centre is a place: a launch-tower island at the centre of the ocean (continents are placed around it). Clicking it, or the top-bar button, warps there: the camera rises up the tower (0.6 s), a streak-star tunnel runs (1.6 s), and the view fades onto the bridge (0.3 s); with reduced motion it is a 300 ms cross-fade. Only one canvas is mounted at a time. The bridge's console holds two screens, Launch and History, rendered as drei `<Html>` through `Label.tsx`. Escape (outside a field) or **Return to world** warps back; **Go to its lab** warps back and opens that lab.

A request is answerable only while its hook is waiting on it (or polled within the last 5 s). A long-poll whose connection closes (the hook was killed or crashed) counts as gone at once. After that the server answers 409, and the card leaves the page. A permission whose detail was cut can be denied from the page, but `allow` is refused (400): it must be allowed in the session, where it can be read in full. A broadcast is scheduled for each request's expiry and for each poll that ends without an answer, so stale cards disappear without a reload. Answers must match the request: a permission takes only `allow`/`deny`, and a question set takes one answer for each of its own questions (other keys are dropped).

Limits: launches and replies share the run limit; prompts ≤ 20,000 chars, no `/`, `!` or `-` prompts (the prompt is an argv entry), 3 concurrent runs, each stopped after 30 minutes, explanations one per session and two overall, 50 open requests, 64 KB request bodies, 25 s per long-poll. Explanations also pass `--strict-mcp-config`, so the throwaway fork loads no MCP servers. Every `claude` runs in its own process group (not on Windows). Stopping it, on a timeout or at shutdown, sends SIGTERM to the group and SIGKILL 3 s later, so commands it started are stopped too. An explanation keeps its slot until its process has exited. Shutdown waits at most 5 s, and the exit handler SIGKILLs whatever is left.

## Security

- Binds to `127.0.0.1` only.
- Rejects requests whose `Host` is not `127.0.0.1:<port>` / `localhost:<port>` (DNS-rebinding guard).
- Rejects WebSocket upgrades whose `Origin` is not this server (a WebSocket is not protected by CORS).
- Socket errors on rejected upgrades and invalid frames from clients are handled, so neither can crash the server; client messages are capped at 1 KB (the server never reads them).
- Session ids from the registry must match `[\w-]+` before they are used in a path.
- No CORS headers, so other sites cannot read the API.
- Static files are served only from inside the built UI folder (resolved-path containment check).
- Never writes under the Claude config directory.
- **Access key.** Every `/api/*` request and the WebSocket need a random per-start key (192 bits), compared in constant time; without it the server answers 401. The static UI loads without it, since it holds no data. No endpoint returns the key (`GET /api/control` returns only `{enabled}`). The CLI prints `http://127.0.0.1:<port>/#token=<key>`; a fragment is never sent over HTTP. The page moves the key into `sessionStorage` and strips it with `history.replaceState`. It sends the key as the `x-agent-world-token` header and, for the WebSocket (which can't set headers), as a second subprotocol `agent-world-token.<key>` next to `agent-world`, which the server echoes.
- **Hook channel.** `~/.agent-world/server.json` is written to a temporary file (mode 600) and renamed into place. Its folder is forced to mode 700 even when it already exists. The file is removed on exit, SIGINT, SIGTERM, SIGHUP and uncaught exceptions. The hook trusts the file only if `lstat` shows a regular file you own with no group/other bits, the pid inside is alive, and (on Linux) its start time still matches the one recorded, so a reused pid is not trusted. The hook never sends the key: each request carries a fresh nonce and `HMAC-SHA256(key, "hook:"+nonce)`. The server returns `x-agent-world-proof: HMAC-SHA256(key, "server:"+nonce)`, and the hook ignores any reply without a valid proof. Its first request (`GET /api/control`) carries no data, so the tool input goes only to a server that has already proved itself. A program squatting on the port learns nothing and can't forge an allow. The hook withdraws its request on SIGTERM, SIGINT and SIGHUP.
- **`--open`.** The browser is pointed at `~/.agent-world/open.html` (mode 600), which forwards to the keyed link, so the key never appears in a process's command line (`/proc/*/cmdline` is world-readable). The page is removed on exit.
- Shutdown calls `closeAllConnections()`, so open hook long-polls can't hold it up.
- Control endpoints also need a JSON content type and refuse foreign origins. `claude` is spawned with an argument array, never a shell; working folders come from Claude Code's session registry, never from the browser.
- A route that throws answers 500 with no details (logged to stderr) instead of leaving the request hanging.

## Performance

- Only live sessions' files are read, and only the bytes appended since the last poll.
- Polling every 750 ms (stat calls only, unless a file grew); registry refresh every 2 s.
- Per-lab action history and timeline are capped (2,000 entries), and each change keeps at most 100,000 characters of before/after text.
- Transcripts are read in 8 MB chunks (at most 32 MB per tick), so a huge backlog loads over a few ticks instead of one giant buffer.
- One unreadable transcript is logged and skipped; it never stops other sessions from updating.
- The WebSocket summary carries a 280-character prompt preview; the full prompt comes with the lab detail.
- A WebSocket client that falls more than 4 MB behind is skipped until it catches up.
- Finished labs render without interior detail or scientists.

## Testing

- Unit: normalizer, prompt cleaning, tool summaries, world reducer, tailer, registry, diff, replay.
- Integration: HTTP + WebSocket server against a fixture `~/.claude` directory, including the security checks.
- E2E: Playwright opens the UI against the fixture directory and checks the HUD, a lab panel and a scientist panel.
