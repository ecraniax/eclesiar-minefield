"use client";

import { useEffect, useRef } from "react";
import {
  DEFUSE_BLAST_RADIUS,
  EXTRA_PACKS_PER_DAY,
  EXTRA_STEPS_PACK,
  EXTRA_STEPS_PRICE_GEMS,
  LOCKOUT_MS,
  MAP_SIZE,
  STEPS_PER_REFILL,
} from "@/lib/config";

// Backend implementation guide for developers (not shown to players as rules).

const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "principles", label: "Principles" },
  { id: "mines", label: "Mines" },
  { id: "treasure", label: "Treasure" },
  { id: "schema", label: "Database" },
  { id: "state", label: "Cell state" },
  { id: "api", label: "API" },
  { id: "move", label: "Move" },
  { id: "defuse", label: "Defuse" },
  { id: "time", label: "Days & lockouts" },
  { id: "gems", label: "Gems" },
  { id: "rewards", label: "Rewards" },
  { id: "concurrency", label: "Concurrency" },
  { id: "scale", label: "1000+ players" },
  { id: "frozen", label: "Never change mid-event" },
  { id: "security", label: "Security" },
  { id: "checklist", label: "Checklist" },
];

const N = MAP_SIZE * MAP_SIZE;
const BITSET_BYTES = Math.ceil(N / 8);
const LOCK_H = Math.round(LOCKOUT_MS / 3_600_000);
const ROW_KB = Math.round((BITSET_BYTES + 100) / 1024);
const TOTAL_MB = Math.round((((BITSET_BYTES + 100) * 1000) / 1024 / 1024) * 10) / 10;
// Upper bound: a player who comes back the moment every lockout ends (+ max daily purchases)
const MAX_ACTIONS_PER_DAY = Math.floor((24 * 3_600_000) / LOCKOUT_MS) * STEPS_PER_REFILL + EXTRA_PACKS_PER_DAY * EXTRA_STEPS_PACK;
const MAX_ACTIONS_1000 = MAX_ACTIONS_PER_DAY * 1000;
const AVG_RPS_1000 = Math.round((MAX_ACTIONS_1000 / 86_400) * 10) / 10;
const fmt = (n: number) => n.toLocaleString("en-US");

export default function DevDialog({ onClose }: { onClose: () => void }) {
  const body = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const jump = (id: string) => body.current?.querySelector(`#dev-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-2 sm:p-6" onClick={onClose}>
      <div
        className="reward-pop flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-sky-900 bg-stone-950 text-stone-200 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-stone-800 bg-gradient-to-r from-sky-950 to-stone-950 px-5 py-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-400">Operation Minefield</div>
            <h2 className="text-xl font-bold">🛠️ Development – backend</h2>
          </div>
          <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-stone-400 hover:bg-stone-800 hover:text-stone-100" aria-label="Close">
            ✕
          </button>
        </div>

        <nav className="flex shrink-0 flex-wrap gap-1 border-b border-stone-800 px-3 py-2 text-xs">
          {SECTIONS.map((s) => (
            <button key={s.id} onClick={() => jump(s.id)} className="shrink-0 rounded-full bg-stone-900 px-3 py-1 hover:bg-stone-800">
              {s.label}
            </button>
          ))}
        </nav>

        <div ref={body} className="min-h-0 flex-1 space-y-7 overflow-y-auto px-5 py-5 text-sm leading-relaxed">
          {/* ------------------------------------------------------------ */}
          <Section id="overview" title="Architecture overview">
            <p>
              The prototype keeps all &quot;server&quot; logic in <C>src/mock/mockServer.ts</C>; the UI only talks to the <C>GameApi</C>{" "}
              interface in <C>src/lib/api.ts</C>. For production this logic moves to the server and the mock in <C>api.ts</C> is replaced
              with <C>fetch</C> calls. The UI stays the same.
            </p>
            <Code>{`Browser (Next.js UI)                        Server (Next.js API routes / Node)              PostgreSQL
────────────────────                        ──────────────────────────────────              ──────────
renders the map (public world, WORLD_SEED) → POST /api/event/move      ─┐                     event
GameApi (fetch)                            → POST /api/event/defuse     │  1 transaction      event_player   (1 row per player)
                                           → POST /api/event/tool       ├─ per action ──────▶ event_first_claim
                                           → POST /api/event/buy-steps  │  (SELECT … FOR      event_reward_ledger
                                           → GET  /api/event/state     ─┘   UPDATE)           player_wallet (gems – existing game)
                                                                        │
                                               In memory (at startup): static world, treasure, densities`}</Code>
          </Section>

          {/* ------------------------------------------------------------ */}
          <Section id="principles" title="Key principles (why it holds up with 1000+ players)">
            <ol className="list-decimal space-y-1.5 pl-5">
              <li>
                <b>Mines are never stored.</b> They are computed from the player&apos;s secret seed and the coordinates (deterministic). 0
                bytes in the database.
              </li>
              <li>
                <b>Treasure is the same for everyone</b> – computed once from the event&apos;s secret seed and kept in server memory.
              </li>
              <li>
                <b>One row per player.</b> All player state (explored cells as a bitset, steps, lockout, tools …) lives in a single row →
                every action = 1 read + 1 write.
              </li>
              <li>
                <b>No cron jobs.</b> Days, step refills and lockout expiry are computed lazily on every request from server time.
              </li>
              <li>
                <b>The client is never the source of truth.</b> It only sends an intent (&quot;move to x,y&quot;); the server validates
                everything and returns only a delta.
              </li>
              <li>
                <b>Idempotent rewards.</b> Every reward has a unique key, so it can never be granted twice (double click, retry, race).
              </li>
            </ol>
          </Section>

          {/* ------------------------------------------------------------ */}
          <Section id="mines" title="Mines: every player has their own layout">
            <p>
              The player seed is derived with an HMAC from a server secret – it doesn&apos;t even need to be stored and the client never sees
              it. For individual cells a fast (non-cryptographic) hash is then used.
            </p>
            <Code>{`// once per request (or cached in memory by player_id)
playerSeed = uint32( HMAC_SHA256(SERVER_SECRET, eventId + ":" + playerId) )

function isMine(playerSeed, x, y):
    if x,y is river / treasure / point of interest / General's Bunker / within SAFE_RADIUS of camp:
        return false                       // these cells never hold a mine
    density = bunkerZoneAt(x,y) ? ABANDONED_BUNKER_DENSITY : ring(x,y).mineDensity
    return hash3(playerSeed, x, y) / 2^32 < density      // hash3 = same as in src/lib/rng.ts

function mineCount(playerSeed, x, y):      // number shown on an explored cell
    return count(isMine(playerSeed, nx, ny) for the 8 neighbours)`}</Code>
            <Note>
              The number on a cell always counts the <b>original</b> layout (including defused mines), so numbers already shown never change.
              A &quot;live&quot; mine = <C>isMine && cell == HIDDEN</C>.
            </Note>
            <Note>
              Because the layout is a pure function of the seed, it stays exactly the same across page reloads, days, devices and browsers.
              A new event (new <C>eventId</C>) gives every player a new layout.
            </Note>
          </Section>

          {/* ------------------------------------------------------------ */}
          <Section id="treasure" title="Treasure: the same for every player">
            <p>
              Treasure position and contents depend only on <C>EVENT_SECRET_SEED</C>. They are computed once at server startup and kept in
              memory (~{Math.round(N * 0.008)} treasures).
            </p>
            <Code>{`// at startup (or when the event is created) – in memory
TREASURES: Map<cellIndex, { tIdx, tier, reward }>     // tIdx = sequential treasure number 0..T-1
TREASURE_GRID: Int16Array(${N})                         // cellIndex -> tIdx or -1 (fast lookup)

for every cell (x,y):
    if rand01(EVENT_SECRET_SEED + 77, x, y) < TREASURE_DENSITY and the cell isn't reserved:
        TREASURES.set(i, { tIdx: T++, tier: "normal", reward: rollCrate(EVENT_SECRET_SEED, x, y) })

// detector signal – at most 9×9 = 81 lookups, no database
function signalAt(player, x, y):
    best = ∞
    for every cell within SIGNAL_RANGE:
        t = TREASURE_GRID[j]
        if t >= 0 and not player.collected[t] and not player.destroyed[t]:
            best = min(best, chebyshev)
    return best <= SIGNAL_STRONG ? 2 : best <= SIGNAL_RANGE ? 1 : 0`}</Code>
            <Note>
              Every player can collect every treasure once (they each have &quot;their own copy&quot;). Per player we only store the bitsets{" "}
              <C>collected</C> and <C>destroyed</C> indexed by <C>tIdx</C> – ~{Math.ceil((N * 0.008) / 8)} bytes each.
            </Note>
          </Section>

          {/* ------------------------------------------------------------ */}
          <Section id="schema" title="Database schema (PostgreSQL)">
            <Code>{`CREATE TABLE event (
  id            int PRIMARY KEY,
  starts_at     timestamptz NOT NULL,        -- day 1 starts here (UTC)
  days          smallint    NOT NULL DEFAULT 30,
  secret_seed   bigint      NOT NULL         -- never sent to the client
);

CREATE TABLE event_player (
  event_id        int      NOT NULL REFERENCES event(id),
  player_id       bigint   NOT NULL,
  px              smallint NOT NULL DEFAULT 75,
  py              smallint NOT NULL DEFAULT 75,
  steps           smallint NOT NULL DEFAULT ${STEPS_PER_REFILL},
  locked_until    timestamptz,                -- NULL = no lockout
  lock_reason     smallint,                   -- 1 mine, 2 defuse, 3 steps
  packs_day       smallint NOT NULL DEFAULT 0,-- day of the last purchase
  packs_bought    smallint NOT NULL DEFAULT 0,-- purchases on that day
  vest_armed      boolean  NOT NULL DEFAULT false,
  tools           smallint[] NOT NULL DEFAULT '{1,1,0,0,0}',  -- detector,dog,vest,drone,bridge
  opened          bytea    NOT NULL,          -- bitset of ${N} bits = ${BITSET_BYTES} B
  special         bytea    NOT NULL DEFAULT '',-- rare special statuses (see "Cell state")
  t_collected     bytea    NOT NULL,          -- bitset by tIdx
  t_destroyed     bytea    NOT NULL,
  t_discovered    bytea    NOT NULL,          -- drone
  gold_earned     int      NOT NULL DEFAULT 0,
  mines_defused   int      NOT NULL DEFAULT 0,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, player_id)
);

-- "first on the server" for legendary treasure – atomic via the unique key
CREATE TABLE event_first_claim (
  event_id   int, star_id smallint, player_id bigint, claimed_at timestamptz DEFAULT now(),
  PRIMARY KEY (event_id, star_id)
);

-- every granted reward; the unique key prevents double granting
CREATE TABLE event_reward_ledger (
  id          bigserial PRIMARY KEY,
  event_id    int, player_id bigint,
  reward_key  text NOT NULL,                  -- e.g. 't:1234' (treasure), 'o:3' (outpost), 'l:2', 'g'
  payload     jsonb NOT NULL,                 -- {gold, items:[{id,qty}], tools, steps, title}
  delivered   boolean NOT NULL DEFAULT false, -- already moved into the game inventory?
  created_at  timestamptz DEFAULT now(),
  UNIQUE (event_id, player_id, reward_key)
);
CREATE INDEX ON event_reward_ledger (delivered) WHERE NOT delivered;

-- gem purchases (idempotent by request_id)
CREATE TABLE event_purchase (
  request_id uuid PRIMARY KEY, event_id int, player_id bigint,
  gems smallint, steps smallint, created_at timestamptz DEFAULT now()
);`}</Code>
            <Note>
              Size: ~{ROW_KB} KB per player → 1000 players ≈ {TOTAL_MB} MB. No &quot;one row per cell&quot; table (that would mean hundreds of
              thousands of rows and be slow).
            </Note>
          </Section>

          {/* ------------------------------------------------------------ */}
          <Section id="state" title="Cell state: bitset + rare special statuses">
            <p>
              Almost every cell is just &quot;explored&quot; or &quot;not explored&quot; → 1 bit per cell. Rare statuses (crater, defused
              mine, rubble, bridge) go into a short list.
            </p>
            <Code>{`opened  : bytea(${BITSET_BYTES})       bit i = 1  → cell i is walkable (explored / bridge / defused / rubble)
special : bytea                 sequence of 3-byte records [i (uint16), status (uint8)]
                                status: 1 crater, 2 defused mine, 3 rubble, 4 bridge

isOpen(i)      = (opened[i >> 3] >> (i & 7)) & 1
setOpen(i)     : opened[i >> 3] |= 1 << (i & 7)
statusOf(i)    = special.find(i) ?? (isOpen(i) ? OPEN : HIDDEN)   // special usually has < 50 records`}</Code>
          </Section>

          {/* ------------------------------------------------------------ */}
          <Section id="api" title="API">
            <Code>{`GET  /api/event/state          → full public state (on page load)
POST /api/event/move    {x,y}  → delta
POST /api/event/defuse  {x,y}  → delta
POST /api/event/tool    {tool,x,y} → delta
POST /api/event/buy-steps {requestId} → delta

Delta (every action returns only changes – a few hundred bytes):
{
  ok, error?,
  player: { px, py, steps, lockedUntil, lockReason, vestArmed, tools, gemBalance, packsBought },
  cells:  [ { i, v, s } ],        // v = mine count / status, s = signal  (new/changed cells only)
  treasures: [ { i, state } ],     // collected / destroyed / discovered
  rewards: [ { kind, source, reward } ],   // for the animated dialog
  report: { x, y, mines, signal, defused?, boom? }
}`}</Code>
            <Note>
              The <b>static world</b> (rings, rivers, smoke, outposts, stars) is public and deterministically generated from{" "}
              <C>WORLD_SEED</C> – the client builds it itself (<C>src/lib/world.ts</C>), so it never needs to be sent. <b>GET /state</b>{" "}
              returns only the player&apos;s explored cells (usually a few hundred) with computed numbers and signals.
            </Note>
          </Section>

          {/* ------------------------------------------------------------ */}
          <Section id="move" title="Pseudocode: move">
            <Code>{`POST /move {x, y}
BEGIN
  p = SELECT * FROM event_player WHERE event_id=$e AND player_id=$me FOR UPDATE   -- locks ONLY this player
  now = server_now(); day = dayOf(now)
  lazySync(p, now)                                   -- lockout expiry, step refill (see "Days & lockouts")

  if day > EVENT_DAYS            → ROLLBACK, "event is over"
  if p.locked_until > now        → ROLLBACK, "locked until …"
  if not inBounds(x,y)           → ROLLBACK
  i = y*${MAP_SIZE}+x

  if isOpen(p, i):                                   -- walking over explored cells = free
      if not pathExists(p.opened, (p.px,p.py) → (x,y))   → ROLLBACK   -- BFS over the bitset, < 1 ms
      UPDATE p SET px=x, py=y; COMMIT; return delta

  -- new cell
  require chebyshev((x,y),(p.px,p.py)) == 1
  require not river(i) and ring(x,y).unlockDay <= day and status(i) == HIDDEN
  require p.steps > 0
  p.steps -= 1
  seed = playerSeed(p)

  if isMine(seed, x, y):
      addSpecial(p, i, CRATER)
      destroyTreasuresAround(p, x, y, radius=2)       -- sets bits in t_destroyed
      if p.vest_armed: p.vest_armed = false
      else:            lock(p, MINE, now)
  else:
      setOpen(p, i); p.px = x; p.py = y
      rewards = collectAt(p, i)                       -- treasure / outpost / star / General (see "Rewards")
      report = { mines: mineCount(seed,x,y), signal: signalAt(p,x,y) }

  if p.steps == 0 and not locked(p): lock(p, STEPS, now)
  UPDATE event_player SET … WHERE event_id=$e AND player_id=$me
COMMIT
return delta`}</Code>
          </Section>

          {/* ------------------------------------------------------------ */}
          <Section id="defuse" title="Pseudocode: defuse">
            <Code>{`POST /defuse {x, y}
BEGIN … FOR UPDATE, lazySync, check lockout, adjacency, HIDDEN (same as move)
  -- defusing is free: no step is spent (a wrong defuse is punished by the lockout instead)
  if isMine(seed, x, y):
      addSpecial(p, i, DEFUSED); p.mines_defused += 1     -- the cell becomes walkable
  else:
      for every cell j in the ${DEFUSE_BLAST_RADIUS * 2 + 1}×${DEFUSE_BLAST_RADIUS * 2 + 1} area around (x,y):
          if status(j) == HIDDEN and not river(j) and not general(j) and ring unlocked:
              addSpecial(p, j, RUBBLE)
      destroyTreasuresAround(p, x, y, radius=${DEFUSE_BLAST_RADIUS}, includeLegendary=true)
      lock(p, DEFUSE, now)
  UPDATE …; COMMIT`}</Code>
          </Section>

          {/* ------------------------------------------------------------ */}
          <Section id="time" title="Days and lockouts (no cron jobs)">
            <p>
              Always use <b>server time</b> (or the database&apos;s <C>now()</C>). Never trust the client clock – it is only used for the
              countdown display.
            </p>
            <Code>{`dayOf(now) = floor( (now - event.starts_at) / 24h ) + 1          // 1..30; > 30 = over
ringUnlocked(x,y,day) = ring(x,y).unlockDay <= day

lock(p, reason, now):
    p.locked_until = now + ${LOCK_H}h
    p.lock_reason  = reason

lazySync(p, now):                       -- called at the start of EVERY request
    if p.locked_until != NULL and now >= p.locked_until:
        p.locked_until = NULL
        p.lock_reason  = NULL
        if p.steps == 0: p.steps = ${STEPS_PER_REFILL}          // refill after a lockout for steps

daily purchase limit:
    if p.packs_day != day: p.packs_day = day; p.packs_bought = 0    -- "reset" on the first request of a new day`}</Code>
            <Note>
              Because everything is computed on request, there are no background jobs that could fail or hammer the database at midnight. A
              player who comes back after 3 days gets the correct state on their first request.
            </Note>
          </Section>

          {/* ------------------------------------------------------------ */}
          <Section id="gems" title="Gems: buying steps">
            <p>
              {EXTRA_STEPS_PACK} steps for {EXTRA_STEPS_PRICE_GEMS} gems, at most {EXTRA_PACKS_PER_DAY}× per day. Allowed during an
              out-of-steps lockout (the purchase ends it – this is what the &quot;Out of steps&quot; dialog offers), not during a mine or
              wrong-defuse lockout. The client sends a <C>requestId</C> (UUID) so a repeated click/retry never charges gems twice.
            </p>
            <Code>{`POST /buy-steps {requestId}
BEGIN
  if EXISTS(SELECT 1 FROM event_purchase WHERE request_id=$req) → COMMIT; return current state (idempotent)
  p = SELECT … FROM event_player … FOR UPDATE
  lazySync(p, now)
  outOfSteps = locked(p) and p.lock_reason == STEPS
  require not locked(p) or outOfSteps            -- mine / defuse lockouts can't be bought off
  if p.packs_day != day: p.packs_day = day; p.packs_bought = 0
  require p.packs_bought < ${EXTRA_PACKS_PER_DAY}

  -- atomic gem deduction (never "read → compute → write")
  UPDATE player_wallet SET gems = gems - ${EXTRA_STEPS_PRICE_GEMS}
   WHERE player_id = $me AND gems >= ${EXTRA_STEPS_PRICE_GEMS}
  RETURNING gems                                 → 0 rows = "not enough gems" → ROLLBACK

  p.steps += ${EXTRA_STEPS_PACK}; p.packs_bought += 1
  if outOfSteps: p.locked_until = NULL; p.lock_reason = NULL   -- continue playing right away
  INSERT INTO event_purchase(request_id, …)
  UPDATE event_player …
COMMIT`}</Code>
            <Note>
              If gems live in a different database than the event, call the wallet service with the same <C>requestId</C> as an idempotency
              key, and only write the steps after it succeeds.
            </Note>
          </Section>

          {/* ------------------------------------------------------------ */}
          <Section id="rewards" title="Rewards: no duplicates">
            <Code>{`collectAt(p, i):
  rewards = []
  t = TREASURE_GRID[i]
  if t >= 0 and not p.t_collected[t] and not p.t_destroyed[t]:
      p.t_collected[t] = 1
      rewards += grant(p, "t:" + i, TREASURES.get(i).reward, kind)
  if outpost(i) and not reached yet:  rewards += grant(p, "o:" + n, { steps: 15, tools:{drone:1} })
  if star(i) and not collected/destroyed:
      first = INSERT INTO event_first_claim(event_id, star_id, player_id) VALUES(…)
              ON CONFLICT DO NOTHING RETURNING 1           -- atomic: only 1 player gets "first"
      rewards += grant(p, "l:" + n, { gold:30, items: LEGENDARY_ITEMS[n], title: first ? "Trailblazer" : null })
  if general(i) and not reached yet:  rewards += grant(p, "g", { gold:50, items: GENERAL_ITEMS, title:"Master Sapper" })
  return rewards

grant(p, key, reward):
  INSERT INTO event_reward_ledger(event_id, player_id, reward_key, payload)
  VALUES(…) ON CONFLICT (event_id, player_id, reward_key) DO NOTHING
  -- steps / tools are added directly to p (same transaction)
  -- gold and items: either into the game inventory in the same transaction,
  --   or a worker moves them from the ledger (delivered = false → true)`}</Code>
            <Note>A treasure&apos;s contents are only revealed once it is collected. Until then only the server knows them.</Note>
          </Section>

          {/* ------------------------------------------------------------ */}
          <Section id="concurrency" title="Concurrency and double clicks">
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <C>SELECT … FOR UPDATE</C> on the player row serialises <b>only actions of the same player</b> (double click, two tabs).
                Different players never block each other.
              </li>
              <li>
                The only global point is <C>event_first_claim</C> – solved with <C>ON CONFLICT DO NOTHING</C> (no table lock).
              </li>
              <li>
                The client sends actions one at a time (like the <C>busy</C> flag in the prototype) and ignores or briefly queues key presses
                while waiting.
              </li>
              <li>Transactions are short (no external service calls inside the lock, unless the wallet is in the same database).</li>
            </ul>
          </Section>

          {/* ------------------------------------------------------------ */}
          <Section id="scale" title="Load with 1000+ players">
            <Code>{`Actions per player per day : up to ~${MAX_ACTIONS_PER_DAY} (steps refill every ${LOCK_H} h + purchases); most players far fewer
1000 players               : ≤ ${fmt(MAX_ACTIONS_1000)} actions / day ≈ ${AVG_RPS_1000} req/s on average, peaks ~100–200 req/s
Per action                 : 1× SELECT FOR UPDATE + 1× UPDATE of one row (~3 KB) + 0–2 INSERT
CPU per action             : ~10–100 hashes + up to 81 lookups for the signal + (rarely) a BFS over ${N} bits → < 1 ms
Database size              : ~3 KB × 1000 = ~3 MB (+ ledger)`}</Code>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                <b>Connection pool</b> (e.g. Supabase pooler / PgBouncer in transaction mode), not a new connection per request.
              </li>
              <li>
                <b>Rate limit</b> per player, e.g. 10 actions/s (stops bots and key spam). In memory or Redis.
              </li>
              <li>
                <b>Static world and treasure</b> are computed once at server startup (a few ms) and stay in memory.
              </li>
              <li>
                <b>Responses are deltas</b> (a few hundred bytes). The full state only on page load.
              </li>
              <li>Treasure state and mines are never read from the database – only the player&apos;s bitsets.</li>
              <li>No leaderboards and no global aggregates → no expensive queries across all players.</li>
            </ul>
          </Section>

          {/* ------------------------------------------------------------ */}
          <Section id="frozen" title="Never change these while an event is running">
            <p>
              Mines and treasure are recomputed from these values on every request. Changing any of them mid-event would{" "}
              <b>move mines and treasure for every player</b> – cells they already explored could suddenly show wrong numbers, or they could
              step on a mine that &quot;appeared&quot; under them.
            </p>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              <li>
                <C>SERVER_SECRET</C> and <C>event.secret_seed</C> (never rotate them during an event)
              </li>
              <li>
                Mine densities: <C>RINGS[].mineDensity</C>, <C>ABANDONED_BUNKER_DENSITY</C>
              </li>
              <li>
                Safe area around the camp: <C>SAFE_RADIUS</C>
              </li>
              <li>
                Treasure placement: <C>TREASURE_DENSITY</C> (cells with treasure never hold a mine)
              </li>
              <li>
                The static world: <C>WORLD_SEED</C>, <C>MAP_SIZE</C>, ring sizes (<C>maxDist</C>), rivers, outposts, stars, bunkers
              </li>
              <li>
                The hash functions: <C>hash3</C>, <C>rand01</C>, <C>mulberry32</C>
              </li>
            </ul>
            <Note>
              Safe to change at any time: reward amounts, item catalogue quantities, prices, steps per refill, lockout length, daily purchase
              limit and all texts. Store a <C>config_version</C> on the event and refuse to start the server if the frozen values don&apos;t
              match.
            </Note>
          </Section>

          {/* ------------------------------------------------------------ */}
          <Section id="security" title="Security and anti-cheat">
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <C>SERVER_SECRET</C> and <C>event.secret_seed</C> never go into a response or the JS bundle. (In the prototype everything runs
                in the browser – cheating is trivial there; it is a demo only.)
              </li>
              <li>The client only sends an intent; the server checks every rule (adjacency, ring, river, steps, lockout).</li>
              <li>
                Responses contain numbers and signals <b>only for explored cells</b>; treasure only once collected or spotted by a drone.
              </li>
              <li>Dev endpoints (next day, skip lockout, show mines) exist only in the development environment.</li>
              <li>
                Authenticate with the existing game session; <C>player_id</C> always comes from the session, never from the request body.
              </li>
              <li>Optional: an append-only action log (partitioned by day) to investigate suspicious players.</li>
            </ul>
          </Section>

          {/* ------------------------------------------------------------ */}
          <Section id="checklist" title="Implementation checklist">
            <ol className="list-decimal space-y-1 pl-5">
              <li>
                Move <C>rng.ts</C>, <C>world.ts</C>, <C>config.ts</C>, <C>items.ts</C> into a shared module (used by both client and server).
              </li>
              <li>
                Port the logic from <C>mockServer.ts</C> into server functions; replace <C>localStorage</C> with the <C>event_player</C> row
                (bitsets instead of a string).
              </li>
              <li>Create the tables from the &quot;Database&quot; section and seed the event (start time, secret seed).</li>
              <li>Implement the endpoints with the pattern: transaction → FOR UPDATE → lazySync → checks → change → UPDATE → delta.</li>
              <li>
                In <C>src/lib/api.ts</C> replace the mock with a <C>fetch</C> implementation of <C>GameApi</C>; adapt the UI to merge the
                delta into its state.
              </li>
              <li>Connect gems (wallet) and reward delivery into the game inventory (ledger + worker, or the same transaction).</li>
              <li>Rate limiting, connection pooling, dev endpoints disabled in production.</li>
              <li>Freeze the values from &quot;Never change mid-event&quot; with a config version check.</li>
              <li>Load test: e.g. k6 / autocannon with 1000 virtual players walking randomly.</li>
            </ol>
          </Section>
        </div>

        <div className="shrink-0 border-t border-stone-800 px-5 py-3">
          <button onClick={onClose} className="w-full rounded-xl bg-sky-700 py-2.5 font-bold text-white hover:bg-sky-600">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={`dev-${id}`} className="scroll-mt-2">
      <h3 className="mb-2 border-b border-stone-800 pb-1 text-base font-bold text-sky-200">{title}</h3>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Code({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg border border-stone-800 bg-black/60 p-3 font-mono text-[11.5px] leading-snug text-emerald-200">
      {children}
    </pre>
  );
}

function C({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-stone-800 px-1 py-0.5 font-mono text-[12px] text-amber-200">{children}</code>;
}

function Note({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-sky-900 bg-sky-950/40 p-3 text-stone-300">💡 {children}</div>;
}
