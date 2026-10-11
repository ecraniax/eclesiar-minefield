// The only place where the UI talks to the "backend".
// Right now this is MockServer in the browser; for a real backend write a new GameApi implementation
// (fetch to REST/WebSocket) and the UI stays unchanged.

import type { ActionResult, PublicState, ToolId } from "./types";

export interface GameApi {
  getState(): Promise<PublicState>;
  /** Move the soldier: free over explored cells, 1 step onto a new adjacent cell. */
  move(x: number, y: number): Promise<ActionResult>;
  /** Defuse a cell next to the soldier: mine = defused; no mine = explosion + lockout. */
  defuse(x: number, y: number): Promise<ActionResult>;
  useTool(tool: ToolId, x: number, y: number): Promise<ActionResult>;
  buySteps(): Promise<ActionResult>;
  dev: {
    nextDay(): Promise<ActionResult>;
    addSteps(n: number): Promise<ActionResult>;
    skipLock(): Promise<ActionResult>;
    reset(): Promise<ActionResult>;
    reveal(): Promise<{ mines: Uint8Array; treasure: Map<number, string> }>;
  };
}

let mockApi: GameApi | null = null;

export async function getApi(): Promise<GameApi> {
  if (mockApi) return mockApi;
  const { MockServer } = await import("@/mock/mockServer");
  const server = new MockServer();
  mockApi = {
    getState: async () => server.getState(),
    move: async (x, y) => server.move(x, y),
    defuse: async (x, y) => server.defuse(x, y),
    useTool: async (t, x, y) => server.useTool(t, x, y),
    buySteps: async () => server.buySteps(),
    dev: {
      nextDay: async () => server.devNextDay(),
      addSteps: async (n) => server.devAddSteps(n),
      skipLock: async () => server.devSkipLock(),
      reset: async () => server.devReset(),
      reveal: async () => server.devReveal(),
    },
  };
  return mockApi;
}
