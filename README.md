# Operation Minefield – Eclesiar event prototype

A 30-day event: a soldier 💂 walks across a huge minefield looking for hidden treasure.
The prototype has **no backend** – all server logic lives in `src/mock/mockServer.ts` and state is stored in `localStorage`.

```bash
yarn install
yarn dev
```

Open http://localhost:3000. The side panel has a **Dev / mock** section (next day, +50 steps, skip lockout, show mines and treasure, reset) and the **🛠️ Development** guide for building the real backend.

---

## Event design

### Core idea
- The player controls a **soldier** that moves cell by cell (up, down, left, right, diagonally).
- **A new cell can only be opened by stepping onto it** – i.e. only right next to the soldier. No jumping elsewhere on the map.
- Every new cell shows a **report**: how many mines are around it (8 neighbours) and the **metal detector signal** (how close treasure is).
- Walking over explored cells is free (click an explored cell and the soldier walks there).
- The main goal is **finding treasure**; the biggest prize is in the 🏰 General's Bunker (137|12).

### Treasure signal (metal detector)
| Signal | Meaning |
|---|---|
| none | no treasure within 4 cells |
| weak (1 bar) | treasure is 3–4 cells away |
| strong (2 bars) | treasure is 1–2 cells away |

The signal is deliberately imprecise and never tells the direction. The bars stay on explored cells, so the player has to "triangulate" where the treasure is – among the mines.

### Map
- 150×150 cells, drag to move the camera, scroll to zoom, minimap, look-at coordinates (x|y). The camera follows the soldier.
- 4 rings (sectors); difficulty grows with distance:

| Ring | Distance | Mines | Opens |
|---|---|---|---|
| 1. Flats | 0–18 | 18 % | day 1 |
| 2. Forest | 19–36 | 22 % | day 8 |
| 3. Mountain | 37–54 | 26 % | day 15 |
| 4. Desert (General's Bunker) | 55–74 | 30 % | day 22 |

- **Barbed wire** between rings opens on the unlock day → nobody can get ahead of the calendar.

### Terrain
Each ring is entirely in its own design: **Flats** (grass), **Forest** (trees), **Mountain** (snowy peaks), **Desert** (dunes, cacti).
The terrain is set by the ring (`RingDef.terrain` in `src/lib/config.ts`). For now it is visual only (doesn't affect the rules).
Tiles are drawn procedurally in `src/components/tiles.ts`; explored cells are lightened so numbers stay readable.

### Points of interest
| | Description |
|---|---|
| 💰 Treasure | hidden (~0.8 % of cells), found by stepping on it; a drone can spot it |
| 🏚️ Abandoned bunker | 7×7 area with 38 % mines, a bigger stash in the middle |
| 🏕️ Outpost | +15 steps and a drone |
| ⭐ Legendary treasure | 5 on the map (visible); the first player on the server gets a title |
| 🌊 River | impassable except at fords or with a bridge |
| 🌫️ Smoke | the mine count stays hidden until a side neighbour is explored |
| 🏰 General's Bunker | the main goal |

Treasure and points of interest are **in the same place for everyone**, but **mines are different for every player** (player seed) → the competition is fair and solutions can't be shared. The layout stays the same across reloads and days.

### Defuse 💣
- The player picks a cell **right next to the soldier** that they think holds a mine (defuse button or X key). **Free** – defusing costs no step.
- **Mine present** → defused, the cell becomes walkable (drawn as a landmine with a green check). Surrounding numbers don't change (a defused mine still counts).
- **No mine** → the charge explodes: every unexplored cell within radius 2 (5×5) turns into **rubble** 🪨 (walkable, no information), all treasure in that area – legendary included – is **destroyed**, and a **1 h lockout** follows.

### Steps and lockouts
- Every step onto a **new** cell = 1 step. Walking over explored cells and defusing are free.
- Start: **20 steps**.
- **1 h lockout** (can't play) in three cases (`LOCKOUT_MS` in `src/lib/config.ts`):
  - stepping on a mine (leaves an impassable crater and destroys hidden treasure within 2 cells; the soldier stays on the previous cell),
  - a wrong defuse,
  - running out of steps → after the lockout you get **20 new steps**.
- 🛡️ The flak vest prevents the lockout for the next mine.
- Progress is never reset – the penalty is lost time and destroyed treasure.
- Purchase: **20 steps for 5 gems** 💎, at most 5× per day. When steps run out, an **Out of steps** dialog offers to continue right away – buying ends the out-of-steps lockout. Not possible during a mine / wrong-defuse lockout. In the prototype the player has a mock balance of 100 gems.

### Tools
| | |
|---|---|
| 🔍 Mine detector | number of mines in a 3×3 area (up to 2 cells from the soldier) |
| 🐕 Sniffer dog | adjacent cell: safe / confirmed mine |
| 🛡️ Flak vest | the next mine doesn't cause a lockout |
| 🛸 Recon drone | spots hidden treasure in a 7×7 area (up to 10 cells from the soldier) |
| 🌉 Bridge | a bridge over a river cell next to the soldier |

Every tool is used up after one use. Tools can't be bought – they are found:

| Source | Tools |
|---|---|
| 🎒 Starting kit | 1× Mine detector, 1× Sniffer dog |
| 💰 Treasure | 12 % chance of a bonus random tool (otherwise 8 % chance of +5 steps) |
| 🏚️ Abandoned bunker stash | always 1 random tool + 1 bridge |
| 🏕️ Outpost | always 1 recon drone |

Random tool odds: detector 35 %, dog 30 %, vest 20 %, drone 10 %, bridge 5 % (`TOOL_DROP_WEIGHTS` in `src/lib/config.ts`).

### Rewards
| Source | Reward |
|---|---|
| 💰 Treasure | 1 item: common (larger amount) or rare (1–3); 12 % bonus tool, 8 % bonus 5 steps |
| 🏚️ Bunker | 10–25 gold, 1 rare item, a double pile of a common item, a tool + bridge |
| 🏕️ Outpost | 15 steps + drone |
| ⭐ Legendary | 30 gold + 2 rare items ×3 (each of the 5 stars is different); the first on the server also gets the title "Trailblazer" |
| 🏰 General | 50 gold (same for everyone) + 3× Bomber, Tank, Military Strategy Manual, Relocation Permit, title "Master Sapper" |

#### Items (server items, images in `public/serverItems/avatar`)
The catalogue is in `src/lib/items.ts`. A treasure's contents depend only on the cell position, so they are **the same for every player**.

| Common | Amount | | Rare (1–3 pcs) |
|---|---|---|---|
| Grain (8) | 20–100 | | Medic bag (31), Adrenaline (32) |
| Food (7) | 5–25 | | Steroids (30), Focus (33) |
| Iron (2) | 10–50 | | City map (27), Hammer (432) |
| Fuel (4) | 10–40 | | Bunker (26), Notepad (17356) |
| Weapon (5) | 3–15 | | Tank (28) |
| Titanium (6) | 2–10 | | Military Strategy Manual (8270), Relocation Permit (6190) |
| Airplane ticket (3) | 1–5 | | Bomber (29) – the rarest |
| Aircraft (1) | 1–5 | | |

The rare item chance grows with distance from the camp: **10 % / 20 % / 30 % / 40 %** for rings 1–4.

Every reward (treasure, bunker, outpost, legendary treasure, General) opens an **animated dialog** (confetti, glow, item images) with a **Confirm** button (or Enter). Several rewards at once are shown one after another (1 / 3 …).

There is no leaderboard and no ranks. All rules, moves and rewards are described in-game in the **📖 Rules** dialog (button in the top bar or the R key), which opens automatically on the first visit. Next to it, **📊 Pace** shows the map size per sector and a table of how many cells a player can explore in 30 days depending on how often they play and how many step packs they buy (capped by the barbed-wire schedule).

All numbers live in `src/lib/config.ts` and `src/lib/items.ts`.

### Controls
- WASD / arrows: move (Q E Z C diagonally), or click a highlighted cell next to the soldier
- click an explored cell: walk there
- there are no flags – the only option for a suspicious cell is defuse; right-click / Esc cancels the selected tool or defuse
- X: defuse, Space: centre on the soldier, +/−: zoom, R: rules

---

## Architecture

```
src/
  lib/
    config.ts        balance (steps, lockouts, defuse, rings, mine density, signal)
    items.ts         reward catalogue and fixed rewards (stars, General's Bunker)
    world.ts         PUBLIC world: rings, terrain, rivers, smoke, outposts, legendary treasure (same for everyone)
    types.ts         PublicState – the only thing the client sees
    api.ts           GameApi interface + mock implementation  ← plug the real backend in here
    rng.ts           deterministic hash / RNG
  mock/
    mockServer.ts    SECRET logic: mines, treasure, movement, defuse, lockouts, rewards, persistence
  components/
    Game.tsx         UI, HUD, cell report, side panel
    MapCanvas.tsx    canvas, dragging, zoom, long press
    render.ts        map, soldier and minimap rendering
    tiles.ts         procedural terrain tiles
    Minimap.tsx
    RewardDialog.tsx animated reward dialog
    RulesDialog.tsx  player rules
    DevDialog.tsx    backend implementation guide
```

### Moving to a real backend
A detailed guide (database schema, pseudocode for every action, days, lockouts, gems, rewards, concurrency, load with 1000+ players, values that must never change mid-event) is available in-game under **🛠️ Development** (side panel → Dev / mock); the code is in `src/components/DevDialog.tsx`.

1. Move the logic from `mockServer.ts` to the server (endpoints: `GET /state`, `POST /move`, `/defuse`, `/tool`, `/buy-steps`).
2. Mines are generated from `playerSeed` + coordinates (`hash3`) → they never need to be stored; the server computes them on the fly.
3. Store explored cells as a bitset (≈ 3 KB per player for the whole map), plus the soldier's position.
4. **Never** send mines or treasure to the client – only `PublicState` (numbers and signals of explored cells).
5. In `api.ts` replace the mock with a `fetch` implementation of `GameApi`; the UI stays the same.

### Known prototype limitations
- "First on the server" for legendary treasure is simulated with made-up rivals (each star is claimed by a rival on a set day).
- The whole "server" runs in the browser, so cheating in the prototype is trivial.
