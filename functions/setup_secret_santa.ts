import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";
import {
  EventsDatastore,
  ParticipantsDatastore,
} from "../datastores/participants.ts";
import { type SlackClient } from "../types.ts";
import { createDerangement } from "../utils/secret_santa.ts";

export const SetupSecretSantaFunction = DefineFunction({
  callback_id: "setup_secret_santa",
  title: "Setup Secret Santa Event",
  description:
    "Creates the event record and posts the invitation to the channel",
  source_file: "functions/setup_secret_santa.ts",
  input_parameters: {
    properties: {
      channel_id: {
        type: Schema.slack.types.channel_id,
        description: "Channel where the invitation will be posted",
      },
      exchange_date: {
        type: Schema.types.string,
        description: "Date when participants will trade presents",
      },
      rules: {
        type: Schema.types.string,
        description: "Custom rules/description for this event",
      },
      invoking_user: {
        type: Schema.slack.types.user_id,
        description: "The admin who set up this event",
      },
    },
    required: ["channel_id", "exchange_date", "rules", "invoking_user"],
  },
  output_parameters: {
    properties: {
      event_id: {
        type: Schema.types.string,
        description: "Unique ID for this Secret Santa event",
      },
    },
    required: ["event_id"],
  },
});

export const JOIN_ACTION_ID = "join_secret_santa";
export const SHUFFLE_ACTION_ID = "run_secret_santa";

// ---------------------------------------------------------------------------
// Typed context shapes for SDK callbacks
// The SDK infers these at runtime; we declare them explicitly so strict
// TypeScript doesn't report implicit-any on destructured callback params.
// ---------------------------------------------------------------------------

interface MainHandlerInputs {
  channel_id: string;
  exchange_date: string;
  rules: string;
  invoking_user: string;
}

interface MainHandlerContext {
  inputs: MainHandlerInputs;
  client: SlackClient;
}

interface BlockActionContext {
  action: { value?: string };
  body: { user: { id: string }; container: { channel_id: string } };
  client: SlackClient;
}

// ---------------------------------------------------------------------------
// Action handler logic — exported so they can be unit-tested independently
// ---------------------------------------------------------------------------

/**
 * Handles a user clicking "Join Secret Santa".
 * Registers the participant in the datastore and sends an ephemeral
 * confirmation (or an "already joined" notice if the user joined before).
 */
export async function processJoinAction(
  client: SlackClient,
  eventId: string,
  userId: string,
  channelId: string,
): Promise<void> {
  const participantId = `${eventId}#${userId}`;

  // Check whether the user has already joined
  const existing = await client.apps.datastore.get({
    datastore: ParticipantsDatastore.name,
    id: participantId,
  });

  if (existing.ok && existing.item?.["participant_id"]) {
    await client.chat.postEphemeral({
      channel: channelId,
      user: userId,
      text:
        "You've already joined this Secret Santa event! :gift: Watch for your DM when assignments are sent.",
    });
    return;
  }

  // Fetch event details to include the exchange date in the confirmation
  const eventResp = await client.apps.datastore.get({
    datastore: EventsDatastore.name,
    id: eventId,
  });

  const exchangeDate =
    eventResp.ok && typeof eventResp.item?.["exchange_date"] === "string"
      ? ` Gift exchange day is *${eventResp.item["exchange_date"]}*.`
      : "";

  // Register the participant
  const putResp = await client.apps.datastore.put({
    datastore: ParticipantsDatastore.name,
    item: {
      participant_id: participantId,
      event_id: eventId,
      user_id: userId,
      channel_id: channelId,
      joined_at: new Date().toISOString(),
    },
  });

  if (!putResp.ok) {
    await client.chat.postEphemeral({
      channel: channelId,
      user: userId,
      text:
        `:x: Failed to join the event. Please try again. (${putResp.error})`,
    });
    return;
  }

  await client.chat.postEphemeral({
    channel: channelId,
    user: userId,
    text:
      `:white_check_mark: You're in the Secret Santa!${exchangeDate} You'll receive a DM with your assignment once someone starts the shuffle.`,
  });
}

/**
 * Handles a user clicking "Shuffle & Send Assignments".
 * Validates that the event is still open and has enough participants, then
 * generates a random derangement and sends a DM to every participant.
 */
export async function processShuffleAction(
  client: SlackClient,
  eventId: string,
  triggeringUser: string,
  channelId: string,
): Promise<void> {
  // Validate the event
  const eventResp = await client.apps.datastore.get({
    datastore: EventsDatastore.name,
    id: eventId,
  });

  if (!eventResp.ok || !eventResp.item?.["event_id"]) {
    await client.chat.postEphemeral({
      channel: channelId,
      user: triggeringUser,
      text:
        ":x: Could not find the Secret Santa event. Please contact the organizer.",
    });
    return;
  }

  const event = eventResp.item;

  if (event["status"] === "picked") {
    await client.chat.postEphemeral({
      channel: channelId,
      user: triggeringUser,
      text:
        ":information_source: Assignments have already been sent for this event. Check your DMs!",
    });
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
      await client.chat.postEphemeral({
        channel: channelId,
        user: triggeringUser,
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
    await client.chat.postEphemeral({
      channel: channelId,
      user: triggeringUser,
      text:
        `:x: Not enough participants to shuffle. Need at least 3, currently have *${allParticipants.length}*. Wait for more people to join!`,
    });
    return;
  }

  const receivers = createDerangement(allParticipants);

  if (!receivers) {
    await client.chat.postEphemeral({
      channel: channelId,
      user: triggeringUser,
      text: ":x: Failed to generate assignments. Please try again.",
    });
    return;
  }

  // Send a DM to each participant with their assignment
  const dmErrors: string[] = [];
  const rules = typeof event["rules"] === "string" ? event["rules"] : "";
  const exchangeDate = typeof event["exchange_date"] === "string"
    ? event["exchange_date"]
    : "";

  for (let i = 0; i < allParticipants.length; i++) {
    const giver = allParticipants[i];
    const receiver = receivers[i];

    const dmResp = await client.conversations.open({ users: giver });

    if (!dmResp.ok || !dmResp.channel?.id) {
      dmErrors.push(`<@${giver}>`);
      continue;
    }

    const dmChannel = dmResp.channel.id;

    const sendResp = await client.chat.postMessage({
      channel: dmChannel,
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
              text: `:bust_in_silhouette: *Organizer*\n<@${triggeringUser}>`,
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

  const eventChannelId = typeof event["channel_id"] === "string"
    ? event["channel_id"]
    : channelId;

  await client.chat.postMessage({
    channel: eventChannelId,
    text: summaryText,
  });
}

// ---------------------------------------------------------------------------
// SlackFunction definition + block action wiring
// ---------------------------------------------------------------------------

export default SlackFunction(
  SetupSecretSantaFunction,
  // The SDK infers callback params via complex generics that don't resolve
  // under strict mode. We annotate the context as unknown and cast once.
  async (ctx: unknown) => {
    const { inputs, client } = ctx as MainHandlerContext;
    const { channel_id, exchange_date, rules, invoking_user } = inputs;
    const event_id = crypto.randomUUID();

    // 1. Persist the event
    const eventPut = await client.apps.datastore.put({
      datastore: EventsDatastore.name,
      item: {
        event_id,
        channel_id,
        rules,
        exchange_date,
        created_by: invoking_user,
        message_ts: "",
        status: "open",
      },
    });

    if (!eventPut.ok) {
      return { error: `Failed to create event: ${eventPut.error}` };
    }

    // 2. Post the invitation message with interactive buttons
    const blocks = [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "Ho Ho Ho! Secret Santa is here! :santa:",
          emoji: true,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text:
            "*What is Secret Santa?*\nEach participant is randomly assigned one other person to buy a gift for. The assignments are kept secret until gift exchange day — then everyone reveals who they gave to!",
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Rules from <@${invoking_user}>:*\n${rules}`,
        },
      },
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `:calendar: *Gift Exchange Date*\n${exchange_date}`,
          },
          {
            type: "mrkdwn",
            text: `:bust_in_silhouette: *Organizer*\n<@${invoking_user}>`,
          },
        ],
      },
      {
        type: "divider",
      },
      {
        type: "actions",
        block_id: "secret_santa_actions",
        elements: [
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "Join Secret Santa :gift:",
              emoji: true,
            },
            style: "primary",
            action_id: JOIN_ACTION_ID,
            value: event_id,
          },
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "Shuffle & Send Assignments :game_die:",
              emoji: true,
            },
            action_id: SHUFFLE_ACTION_ID,
            value: event_id,
            confirm: {
              title: {
                type: "plain_text",
                text: "Send Secret Santa Assignments?",
              },
              text: {
                type: "mrkdwn",
                text:
                  "This will randomly pair all participants and send each person a DM with their assignment. *This cannot be undone.*",
              },
              confirm: {
                type: "plain_text",
                text: "Yes, send assignments",
              },
              deny: {
                type: "plain_text",
                text: "Not yet",
              },
            },
          },
        ],
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `Event ID: \`${event_id}\``,
          },
        ],
      },
    ];

    const msgResp = await client.chat.postMessage({
      channel: channel_id,
      blocks,
      text: "Secret Santa event has started! Click Join to participate.",
    });

    if (!msgResp.ok) {
      return { error: `Failed to post message: ${msgResp.error}` };
    }

    // 3. Update the record with the message timestamp
    await client.apps.datastore.put({
      datastore: EventsDatastore.name,
      item: {
        event_id,
        channel_id,
        rules,
        exchange_date,
        created_by: invoking_user,
        message_ts: msgResp.ts ?? "",
        status: "open",
      },
    });

    // 4. Keep the function alive so button handlers remain active
    return { completed: false };
  },
)
  .addBlockActionsHandler(
    JOIN_ACTION_ID,
    async (ctx: unknown) => {
      const { action, body, client } = ctx as BlockActionContext;
      await processJoinAction(
        client,
        action.value ?? "",
        body.user.id,
        body.container.channel_id,
      );
    },
  )
  .addBlockActionsHandler(
    SHUFFLE_ACTION_ID,
    async (ctx: unknown) => {
      const { action, body, client } = ctx as BlockActionContext;
      await processShuffleAction(
        client,
        action.value ?? "",
        body.user.id,
        body.container.channel_id,
      );
    },
  );
