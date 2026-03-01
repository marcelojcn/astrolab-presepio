import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";
import {
  EventsDatastore,
  ParticipantsDatastore,
} from "../datastores/participants.ts";
import { type SlackClient } from "../types.ts";
import { createDerangement } from "../utils/secret_santa.ts";

export const AutoShuffleFunction = DefineFunction({
  callback_id: "auto_shuffle",
  title: "Auto Shuffle Secret Santa",
  source_file: "functions/auto_shuffle.ts",
  input_parameters: {
    properties: {
      event_id: {
        type: Schema.types.string,
        description: "ID of the Secret Santa event to shuffle",
      },
      channel_id: {
        type: Schema.slack.types.channel_id,
        description: "Channel where status messages are posted",
      },
    },
    required: ["event_id", "channel_id"],
  },
  output_parameters: { properties: {}, required: [] },
});

/**
 * Runs the Secret Santa shuffle for the given event.
 * All status messages are posted publicly to the channel (no ephemeral —
 * this is called from a scheduled trigger, not a user interaction).
 */
export async function processAutoShuffle(
  client: SlackClient,
  eventId: string,
  channelId: string,
): Promise<void> {
  const eventResp = await client.apps.datastore.get({
    datastore: EventsDatastore.name,
    id: eventId,
  });

  if (!eventResp.ok || !eventResp.item?.["event_id"]) {
    await client.chat.postMessage({
      channel: channelId,
      text:
        ":x: Could not find the Secret Santa event. Assignments were not sent.",
    });
    return;
  }

  const event = eventResp.item;
  const eventChannel = typeof event["channel_id"] === "string"
    ? event["channel_id"]
    : channelId;

  if (event["status"] === "cancelled") {
    await client.chat.postMessage({
      channel: eventChannel,
      text:
        ":x: The Secret Santa event was cancelled before assignments could be sent.",
    });
    return;
  }

  if (event["status"] === "picked") {
    // Already shuffled — nothing to do
    return;
  }

  // Collect all participants with pagination
  const allParticipants: string[] = [];
  let cursor: string | undefined;

  do {
    const queryResp = await client.apps.datastore.query({
      datastore: ParticipantsDatastore.name,
      expression: "#event_id = :event_id",
      expression_attributes: { "#event_id": "event_id" },
      expression_values: { ":event_id": eventId },
      ...(cursor ? { cursor } : {}),
    });

    if (!queryResp.ok) {
      await client.chat.postMessage({
        channel: eventChannel,
        text: `:x: Failed to retrieve participants: ${queryResp.error}`,
      });
      return;
    }

    for (const item of queryResp.items ?? []) {
      const userId = item["user_id"];
      if (typeof userId === "string" && userId.length > 0) {
        allParticipants.push(userId);
      }
    }

    cursor = typeof queryResp.next_cursor === "string"
      ? queryResp.next_cursor
      : undefined;
  } while (cursor);

  if (allParticipants.length < 3) {
    await client.chat.postMessage({
      channel: eventChannel,
      text:
        `:x: Not enough participants to shuffle. Need at least 3, currently have *${allParticipants.length}*. Assignments were not sent.`,
    });
    return;
  }

  const receivers = createDerangement(allParticipants);

  if (!receivers) {
    await client.chat.postMessage({
      channel: eventChannel,
      text: ":x: Failed to generate assignments. Please contact the organizer.",
    });
    return;
  }

  const rules = typeof event["rules"] === "string" ? event["rules"] : "";
  const exchangeDate = typeof event["exchange_date"] === "string"
    ? event["exchange_date"]
    : "";
  const organizer = typeof event["created_by"] === "string"
    ? event["created_by"]
    : "";

  const dmErrors: string[] = [];

  for (let i = 0; i < allParticipants.length; i++) {
    const giver = allParticipants[i];
    const receiver = receivers[i];

    const dmResp = await client.conversations.open({ users: giver });

    if (!dmResp.ok || !dmResp.channel?.id) {
      dmErrors.push(`<@${giver}>`);
      continue;
    }

    const sendResp = await client.chat.postMessage({
      channel: dmResp.channel.id,
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: ":santa: Your Secret Santa Assignment!",
            emoji: true,
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text:
              `You are the Secret Santa for *<@${receiver}>*! :gift:\n\nRemember to keep it a secret until gift exchange day!`,
          },
        },
        {
          type: "section",
          fields: [
            {
              type: "mrkdwn",
              text: `:calendar: *Gift Exchange Date*\n${exchangeDate}`,
            },
            {
              type: "mrkdwn",
              text: `:bust_in_silhouette: *Organizer*\n<@${organizer}>`,
            },
          ],
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Event Rules:*\n${rules}`,
          },
        },
      ],
      text:
        `Your Secret Santa assignment: you're buying a gift for <@${receiver}>!`,
    });

    if (!sendResp.ok) {
      dmErrors.push(`<@${giver}>`);
    }
  }

  // Mark the event as picked
  await client.apps.datastore.put({
    datastore: EventsDatastore.name,
    item: { ...event, status: "picked" },
  });

  // Post a public summary to the channel
  const successCount = allParticipants.length - dmErrors.length;
  const summaryText = dmErrors.length === 0
    ? `:white_check_mark: *Secret Santa assignments sent!* All ${successCount} participants have received their DMs. Check your messages! :gift:`
    : `:warning: Assignments sent to ${successCount} of ${allParticipants.length} participants. Could not reach: ${
      dmErrors.join(", ")
    }`;

  await client.chat.postMessage({
    channel: eventChannel,
    text: summaryText,
  });
}

// ---------------------------------------------------------------------------
// Typed context shape for the SDK callback
// ---------------------------------------------------------------------------

interface AutoShuffleInputs {
  event_id: string;
  channel_id: string;
}

interface AutoShuffleContext {
  inputs: AutoShuffleInputs;
  client: SlackClient;
}

export default SlackFunction(
  AutoShuffleFunction,
  async (ctx: unknown) => {
    const { inputs, client } = ctx as AutoShuffleContext;
    await processAutoShuffle(client, inputs.event_id, inputs.channel_id);
    return { outputs: {} };
  },
);
