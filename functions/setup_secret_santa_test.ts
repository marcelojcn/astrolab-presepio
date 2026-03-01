import { assertEquals, assertStringIncludes } from "@std/assert";
import {
  CANCEL_ACTION_ID,
  JOIN_ACTION_ID,
  processCancelAction,
  processJoinAction,
  SetupSecretSantaFunction,
} from "./setup_secret_santa.ts";
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
    chatPostEphemeral?: (
      params: Record<string, unknown>,
    ) => Promise<{ ok: boolean; error?: string }>;
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
        return overrides.chatPostEphemeral
          ? overrides.chatPostEphemeral(params)
          : Promise.resolve({ ok: true });
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

Deno.test("SetupSecretSantaFunction - has correct callback_id", () => {
  assertEquals(
    SetupSecretSantaFunction.definition.callback_id,
    "setup_secret_santa",
  );
});

Deno.test("SetupSecretSantaFunction - has all required input parameters", () => {
  const props =
    SetupSecretSantaFunction.definition.input_parameters?.properties ?? {};
  for (
    const key of [
      "channel_id",
      "exchange_date",
      "shuffle_date",
      "rules",
      "invoking_user",
    ]
  ) {
    assertEquals(key in props, true, `Missing input: ${key}`);
  }
});

Deno.test("SetupSecretSantaFunction - requires all input parameters", () => {
  const required =
    (SetupSecretSantaFunction.definition.input_parameters?.required ??
      []) as string[];
  assertEquals(required.includes("channel_id"), true);
  assertEquals(required.includes("exchange_date"), true);
  assertEquals(required.includes("shuffle_date"), true);
  assertEquals(required.includes("rules"), true);
  assertEquals(required.includes("invoking_user"), true);
});

Deno.test("SetupSecretSantaFunction - has event_id output parameter", () => {
  const props =
    SetupSecretSantaFunction.definition.output_parameters?.properties ?? {};
  assertEquals("event_id" in props, true);
});

Deno.test("JOIN_ACTION_ID and CANCEL_ACTION_ID are distinct strings", () => {
  assertEquals(typeof JOIN_ACTION_ID, "string");
  assertEquals(typeof CANCEL_ACTION_ID, "string");
  assertStringIncludes(JOIN_ACTION_ID, "join");
  assertStringIncludes(CANCEL_ACTION_ID, "cancel");
});

// ---------------------------------------------------------------------------
// processJoinAction tests
// ---------------------------------------------------------------------------

Deno.test("processJoinAction - sends 'already joined' if participant exists", async () => {
  const calls: MockCallRecord[] = [];
  const client = createMockClient(
    {
      datastoreGet: () =>
        Promise.resolve({
          ok: true,
          item: { participant_id: "event1#U1" },
        }),
    },
    calls,
  );

  await processJoinAction(client, "event1", "U1", "C1");

  const ephemeral = calls.find((c) => c.method === "chat.postEphemeral");
  assertEquals(ephemeral !== undefined, true);
  assertStringIncludes(
    ephemeral!.params["text"] as string,
    "already joined",
  );
  // Must NOT write a new participant record
  const puts = calls.filter((c) => c.method === "datastore.put");
  assertEquals(puts.length, 0);
});

Deno.test("processJoinAction - registers new participant and sends confirmation", async () => {
  const calls: MockCallRecord[] = [];
  const client = createMockClient(
    {
      // First get: participant not found; second get: event record with date
      datastoreGet: (() => {
        let callCount = 0;
        return () => {
          callCount++;
          if (callCount === 1) {
            return Promise.resolve({ ok: true, item: undefined });
          }
          return Promise.resolve({
            ok: true,
            item: { exchange_date: "2024-12-25", event_id: "event1" },
          });
        };
      })(),
    },
    calls,
  );

  await processJoinAction(client, "event1", "U1", "C1");

  const put = calls.find((c) => c.method === "datastore.put");
  assertEquals(put !== undefined, true);
  assertEquals(
    (put!.params["item"] as Record<string, unknown>)["user_id"],
    "U1",
  );

  const ephemeral = calls.find((c) => c.method === "chat.postEphemeral");
  assertStringIncludes(ephemeral!.params["text"] as string, "You're in");
  assertStringIncludes(
    ephemeral!.params["text"] as string,
    "2024-12-25",
  );
});

Deno.test("processJoinAction - sends error if datastore put fails", async () => {
  const calls: MockCallRecord[] = [];
  const client = createMockClient(
    {
      datastoreGet: () => Promise.resolve({ ok: true, item: undefined }),
      datastorePut: () =>
        Promise.resolve({ ok: false, error: "internal_error" }),
    },
    calls,
  );

  await processJoinAction(client, "event1", "U1", "C1");

  const ephemeral = calls.find((c) => c.method === "chat.postEphemeral");
  assertStringIncludes(ephemeral!.params["text"] as string, "Failed to join");
});

Deno.test("processJoinAction - sends error if event is cancelled", async () => {
  const calls: MockCallRecord[] = [];
  const client = createMockClient(
    {
      datastoreGet: (() => {
        let callCount = 0;
        return () => {
          callCount++;
          if (callCount === 1) {
            return Promise.resolve({ ok: true, item: undefined });
          }
          return Promise.resolve({
            ok: true,
            item: { event_id: "event1", status: "cancelled" },
          });
        };
      })(),
    },
    calls,
  );

  await processJoinAction(client, "event1", "U1", "C1");

  const ephemeral = calls.find((c) => c.method === "chat.postEphemeral");
  assertStringIncludes(ephemeral!.params["text"] as string, "cancelled");
  // Must NOT write a new participant record
  const puts = calls.filter((c) => c.method === "datastore.put");
  assertEquals(puts.length, 0);
});

// ---------------------------------------------------------------------------
// processCancelAction tests
// ---------------------------------------------------------------------------

Deno.test("processCancelAction - sends error if event not found", async () => {
  const calls: MockCallRecord[] = [];
  const client = createMockClient(
    { datastoreGet: () => Promise.resolve({ ok: true, item: undefined }) },
    calls,
  );

  await processCancelAction(client, "event1", "U_admin", "C1");

  const ephemeral = calls.find((c) => c.method === "chat.postEphemeral");
  assertEquals(ephemeral !== undefined, true);
  assertStringIncludes(
    ephemeral!.params["text"] as string,
    "Could not find",
  );
});

Deno.test("processCancelAction - sends error if event already picked", async () => {
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

  await processCancelAction(client, "event1", "U_admin", "C1");

  const ephemeral = calls.find((c) => c.method === "chat.postEphemeral");
  assertStringIncludes(
    ephemeral!.params["text"] as string,
    "already closed",
  );
  const puts = calls.filter((c) => c.method === "datastore.put");
  assertEquals(puts.length, 0);
});

Deno.test("processCancelAction - sends error if event already cancelled", async () => {
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

  await processCancelAction(client, "event1", "U_admin", "C1");

  const ephemeral = calls.find((c) => c.method === "chat.postEphemeral");
  assertStringIncludes(
    ephemeral!.params["text"] as string,
    "already closed",
  );
  const puts = calls.filter((c) => c.method === "datastore.put");
  assertEquals(puts.length, 0);
});

Deno.test("processCancelAction - cancels open event and posts public message", async () => {
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
          },
        }),
    },
    calls,
  );

  await processCancelAction(client, "event1", "U_admin", "C1");

  const put = calls.find((c) => c.method === "datastore.put");
  assertEquals(put !== undefined, true);
  assertEquals(
    (put!.params["item"] as Record<string, unknown>)["status"],
    "cancelled",
  );

  const message = calls.find((c) => c.method === "chat.postMessage");
  assertEquals(message !== undefined, true);
  assertStringIncludes(
    message!.params["text"] as string,
    "cancelled",
  );
});
