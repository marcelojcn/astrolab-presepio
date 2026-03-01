import { assertEquals } from "@std/assert";
import { EventsDatastore, ParticipantsDatastore } from "./participants.ts";

// --- EventsDatastore ---

Deno.test("EventsDatastore - has the correct datastore name", () => {
  assertEquals(EventsDatastore.name, "secret_santa_events");
});

Deno.test("EventsDatastore - has the correct primary key", () => {
  assertEquals(EventsDatastore.definition.primary_key, "event_id");
});

Deno.test("EventsDatastore - has all required attributes", () => {
  const attrs = EventsDatastore.definition.attributes;
  const required = [
    "event_id",
    "channel_id",
    "rules",
    "exchange_date",
    "created_by",
    "message_ts",
    "status",
  ];
  for (const attr of required) {
    assertEquals(attr in attrs, true, `Missing attribute: ${attr}`);
  }
});

// --- ParticipantsDatastore ---

Deno.test("ParticipantsDatastore - has the correct datastore name", () => {
  assertEquals(ParticipantsDatastore.name, "secret_santa_participants");
});

Deno.test("ParticipantsDatastore - has the correct primary key", () => {
  assertEquals(ParticipantsDatastore.definition.primary_key, "participant_id");
});

Deno.test("ParticipantsDatastore - has all required attributes", () => {
  const attrs = ParticipantsDatastore.definition.attributes;
  const required = [
    "participant_id",
    "event_id",
    "user_id",
    "channel_id",
    "joined_at",
  ];
  for (const attr of required) {
    assertEquals(attr in attrs, true, `Missing attribute: ${attr}`);
  }
});
