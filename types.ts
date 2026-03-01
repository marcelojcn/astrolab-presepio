/** Status of a Secret Santa event. */
export type EventStatus = "open" | "picked" | "cancelled";

/** Shape of a record stored in `secret_santa_events`. */
export interface SecretSantaEvent {
  event_id: string;
  channel_id: string;
  rules: string;
  exchange_date: string;
  shuffle_date: string; // Unix timestamp string — when assignments are auto-sent
  created_by: string;
  message_ts: string;
  status: EventStatus;
}

/** Shape of a record stored in `secret_santa_participants`. */
export interface SecretSantaParticipant {
  participant_id: string;
  event_id: string;
  user_id: string;
  channel_id: string;
  joined_at: string;
}

/**
 * Minimal structural type for the Slack API client methods used by this app.
 *
 * Using a local interface rather than the full SDK type keeps our business
 * logic functions independently testable: tests create plain objects that
 * satisfy this interface without needing to import the Slack SDK.
 *
 * In `*_test.ts` files the mock can be cast with `as unknown as SlackClient`
 * if the generic variants of `get`/`put`/`query` don't match exactly.
 */
export interface SlackClient {
  apps: {
    datastore: {
      get(params: {
        datastore: string;
        id: string;
      }): Promise<{
        ok: boolean;
        item?: Record<string, unknown>;
        error?: string;
      }>;
      put(params: {
        datastore: string;
        item: Record<string, unknown>;
      }): Promise<{ ok: boolean; error?: string }>;
      query(params: {
        datastore: string;
        expression: string;
        expression_attributes: Record<string, string>;
        expression_values: Record<string, string>;
        cursor?: string;
      }): Promise<{
        ok: boolean;
        items?: Record<string, unknown>[];
        next_cursor?: string;
        error?: string;
      }>;
    };
  };
  chat: {
    postMessage(params: {
      channel: string;
      text?: string;
      blocks?: unknown[];
    }): Promise<{ ok: boolean; ts?: string; error?: string }>;
    postEphemeral(params: {
      channel: string;
      user: string;
      text: string;
    }): Promise<{ ok: boolean; error?: string }>;
  };
  conversations: {
    open(params: { users: string }): Promise<{
      ok: boolean;
      channel?: { id: string };
      error?: string;
    }>;
  };
  workflows: {
    triggers: {
      create(
        params: Record<string, unknown>,
      ): Promise<{ ok: boolean; error?: string }>;
    };
  };
}
