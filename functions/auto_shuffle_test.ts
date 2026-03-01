import { assertEquals, assertStringIncludes } from "@std/assert";
import { AutoShuffleFunction, processAutoShuffle } from "./auto_shuffle.ts";
import { type SlackClient } from "../types.ts";

// ---------------------------------------------------------------------------
// Helper: create a configurable mock Slack client
// ---------------------------------------------------------------------------

interface MockCallRecord {
  method: string;
  params: Record<string, unknown>;
}

function createMockClient(
  overrides: {
    datastoreGet?: (
      params: Record<string, unknown>,
    ) => Promise<
      { ok: boolean; item?: Record<string, unknown>; error?: string }
    >;
    datastorePut?: (
      params: Record<string, unknown>,
    ) => Promise<{ ok: boolean; error?: string }>;
    datastoreQuery?: (
      params: Record<string, unknown>,
    ) => Promise<{
      ok: boolean;
      items?: Record<string, unknown>[];
      next_cursor?: string;
      error?: string;
    }>;
    chatPostMessage?: (
      params: Record<string, unknown>,
    ) => Promise<{ ok: boolean; ts?: string; error?: string }>;
    conversationsOpen?: (
      params: Record<string, unknown>,
    ) => Promise<{ ok: boolean; channel?: { id: string }; error?: string }>;
  } = {},
  calls: MockCallRecord[] = [],
): SlackClient {
  return {
    apps: {
      datastore: {
        get: (params: Record<string, unknown>) => {
          calls.push({ method: "datastore.get", params });
          return overrides.datastoreGet
            ? overrides.datastoreGet(params)
            : Promise.resolve({ ok: true, item: undefined });
        },
        put: (params: Record<string, unknown>) => {
          calls.push({ method: "datastore.put", params });
          return overrides.datastorePut
            ? overrides.datastorePut(params)
            : Promise.resolve({ ok: true });
        },
        query: (params: Record<string, unknown>) => {
          calls.push({ method: "datastore.query", params });
          return overrides.datastoreQuery
            ? overrides.datastoreQuery(params)
            : Promise.resolve({ ok: true, items: [] });
        },
      },
    },
    chat: {
      postMessage: (params: Record<string, unknown>) => {
        calls.push({ method: "chat.postMessage", params });
        return overrides.chatPostMessage
          ? overrides.chatPostMessage(params)
          : Promise.resolve({ ok: true, ts: "1234567890.000001" });
      },
      postEphemeral: (params: Record<string, unknown>) => {
        calls.push({ method: "chat.postEphemeral", params });
        return Promise.resolve({ ok: true });
      },
    },
    conversations: {
      open: (params: Record<string, unknown>) => {
        calls.push({ method: "conversations.open", params });
        return overrides.conversationsOpen
          ? overrides.conversationsOpen(params)
          : Promise.resolve({ ok: true, channel: { id: "D_DM_CHANNEL" } });
      },
    },
    workflows: {
      triggers: {
        create: (params: Record<string, unknown>) => {
          calls.push({ method: "workflows.triggers.create", params });
          return Promise.resolve({ ok: true });
        },
      },
    },
  } as unknown as SlackClient;
}

// ---------------------------------------------------------------------------
// Function definition tests
// ---------------------------------------------------------------------------

Deno.test("AutoShuffleFunction - has correct callback_id", () => {
  assertEquals(AutoShuffleFunction.definition.callback_id, "auto_shuffle");
});

Deno.test("AutoShuffleFunction - has event_id input parameter", () => {
  const props = AutoShuffleFunction.definition.input_parameters?.properties ??
    {};
  assertEquals("event_id" in props, true);
});

Deno.test("AutoShuffleFunction - has channel_id input parameter", () => {
  const props = AutoShuffleFunction.definition.input_parameters?.properties ??
    {};
  assertEquals("channel_id" in props, true);
});

Deno.test("AutoShuffleFunction - requires event_id and channel_id", () => {
  const required = (AutoShuffleFunction.definition.input_parameters?.required ??
    []) as string[];
  assertEquals(required.includes("event_id"), true);
  assertEquals(required.includes("channel_id"), true);
});

// ---------------------------------------------------------------------------
// processAutoShuffle tests
// ---------------------------------------------------------------------------

Deno.test("processAutoShuffle - posts error if event not found", async () => {
  const calls: MockCallRecord[] = [];
  const client = createMockClient(
    { datastoreGet: () => Promise.resolve({ ok: true, item: undefined }) },
    calls,
  );

  await processAutoShuffle(client, "event1", "C1");

  const message = calls.find((c) => c.method === "chat.postMessage");
  assertEquals(message !== undefined, true);
  assertStringIncludes(
    message!.params["text"] as string,
    "Could not find",
  );
  const dmOpens = calls.filter((c) => c.method === "conversations.open");
  assertEquals(dmOpens.length, 0);
});

Deno.test("processAutoShuffle - posts notice if event is cancelled", async () => {
  const calls: MockCallRecord[] = [];
  const client = createMockClient(
    {
      datastoreGet: () =>
        Promise.resolve({
          ok: true,
          item: {
            event_id: "event1",
            status: "cancelled",
            channel_id: "C1",
          },
        }),
    },
    calls,
  );

  await processAutoShuffle(client, "event1", "C1");

  const message = calls.find((c) => c.method === "chat.postMessage");
  assertEquals(message !== undefined, true);
  assertStringIncludes(message!.params["text"] as string, "cancelled");
  const dmOpens = calls.filter((c) => c.method === "conversations.open");
  assertEquals(dmOpens.length, 0);
});

Deno.test("processAutoShuffle - does nothing if event already picked", async () => {
  const calls: MockCallRecord[] = [];
  const client = createMockClient(
    {
      datastoreGet: () =>
        Promise.resolve({
          ok: true,
          item: { event_id: "event1", status: "picked", channel_id: "C1" },
        }),
    },
    calls,
  );

  await processAutoShuffle(client, "event1", "C1");

  const messages = calls.filter((c) => c.method === "chat.postMessage");
  assertEquals(messages.length, 0);
  const dmOpens = calls.filter((c) => c.method === "conversations.open");
  assertEquals(dmOpens.length, 0);
});

Deno.test(
  "processAutoShuffle - posts error if fewer than 3 participants",
  async () => {
    const calls: MockCallRecord[] = [];
    const client = createMockClient(
      {
        datastoreGet: () =>
          Promise.resolve({
            ok: true,
            item: {
              event_id: "event1",
              status: "open",
              channel_id: "C1",
              rules: "Budget: $20",
              exchange_date: "2024-12-25",
            },
          }),
        datastoreQuery: () =>
          Promise.resolve({
            ok: true,
            items: [{ user_id: "U1" }, { user_id: "U2" }],
          }),
      },
      calls,
    );

    await processAutoShuffle(client, "event1", "C1");

    const message = calls.find((c) => c.method === "chat.postMessage");
    assertStringIncludes(message!.params["text"] as string, "Not enough");
    const dmOpens = calls.filter((c) => c.method === "conversations.open");
    assertEquals(dmOpens.length, 0);
  },
);

Deno.test(
  "processAutoShuffle - sends DMs and posts summary with 3+ participants",
  async () => {
    const calls: MockCallRecord[] = [];
    const client = createMockClient(
      {
        datastoreGet: () =>
          Promise.resolve({
            ok: true,
            item: {
              event_id: "event1",
              status: "open",
              channel_id: "C1",
              rules: "Budget: $20",
              exchange_date: "2024-12-25",
              created_by: "U_organizer",
            },
          }),
        datastoreQuery: () =>
          Promise.resolve({
            ok: true,
            items: [
              { user_id: "U1" },
              { user_id: "U2" },
              { user_id: "U3" },
            ],
          }),
      },
      calls,
    );

    await processAutoShuffle(client, "event1", "C1");

    // 3 DM channels opened
    const dmOpens = calls.filter((c) => c.method === "conversations.open");
    assertEquals(dmOpens.length, 3);

    // 3 DMs + 1 channel summary
    const messages = calls.filter((c) => c.method === "chat.postMessage");
    assertEquals(messages.length, 4);

    // Last postMessage is the channel summary
    const summary = messages[messages.length - 1];
    assertStringIncludes(
      summary.params["text"] as string,
      "assignments sent",
    );

    // Event marked as picked
    const puts = calls.filter((c) => c.method === "datastore.put");
    const pickedPut = puts.find(
      (p) =>
        (p.params["item"] as Record<string, unknown>)["status"] === "picked",
    );
    assertEquals(pickedPut !== undefined, true);
  },
);
