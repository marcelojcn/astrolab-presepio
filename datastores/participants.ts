import { DefineDatastore, Schema } from "deno-slack-sdk/mod.ts";

/**
 * Stores Secret Santa event configuration created by admins.
 * Primary key: event_id (UUID generated at setup time)
 */
export const EventsDatastore = DefineDatastore({
  name: "secret_santa_events",
  primary_key: "event_id",
  attributes: {
    event_id: {
      type: Schema.types.string,
    },
    channel_id: {
      type: Schema.slack.types.channel_id,
    },
    rules: {
      type: Schema.types.string,
    },
    exchange_date: {
      type: Schema.types.string,
    },
    created_by: {
      type: Schema.slack.types.user_id,
    },
    message_ts: {
      type: Schema.types.string,
    },
    status: {
      type: Schema.types.string, // "open" | "picked"
    },
  },
});

/**
 * Stores individual participants who clicked "Join Secret Santa".
 * Primary key uses a composite pattern (event_id + user_id) to prevent duplicates.
 * Pattern: "<event_id>#<user_id>"
 */
export const ParticipantsDatastore = DefineDatastore({
  name: "secret_santa_participants",
  primary_key: "participant_id",
  attributes: {
    participant_id: {
      type: Schema.types.string, // `${event_id}#${user_id}`
    },
    event_id: {
      type: Schema.types.string,
    },
    user_id: {
      type: Schema.slack.types.user_id,
    },
    channel_id: {
      type: Schema.slack.types.channel_id,
    },
    joined_at: {
      type: Schema.types.string, // ISO timestamp
    },
  },
});
