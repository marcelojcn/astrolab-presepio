import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";
import {
  EventsDatastore,
  ParticipantsDatastore,
} from "../datastores/participants.ts";
import { type SlackClient } from "../types.ts";

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
      shuffle_date: {
        type: Schema.slack.types.timestamp,
        description: "Unix timestamp when assignments will be auto-sent",
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
    required: [
      "channel_id",
      "exchange_date",
      "shuffle_date",
      "rules",
      "invoking_user",
    ],
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
export const CANCEL_ACTION_ID = "cancel_secret_santa";

// ---------------------------------------------------------------------------
// Typed context shapes for SDK callbacks
// The SDK infers these at runtime; we declare them explicitly so strict
// TypeScript doesn't report implicit-any on destructured callback params.
// ---------------------------------------------------------------------------

interface MainHandlerInputs {
  channel_id: string;
  exchange_date: string;
  shuffle_date: number;
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
 * confirmation (or an "already joined" / "cancelled" notice as appropriate).
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
        "You've already joined this Secret Santa event! :gift: Watch for your DM when assignments are sent automatically.",
    });
    return;
  }

  // Fetch event details to check status and get exchange date
  const eventResp = await client.apps.datastore.get({
    datastore: EventsDatastore.name,
    id: eventId,
  });

  if (eventResp.ok && eventResp.item?.["status"] === "cancelled") {
    await client.chat.postEphemeral({
      channel: channelId,
      user: userId,
      text:
        ":x: This event has been cancelled and is no longer accepting participants.",
    });
    return;
  }

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
      `:white_check_mark: You're in the Secret Santa!${exchangeDate} Your assignment will be sent automatically on the scheduled date.`,
  });
}

/**
 * Handles a user clicking "Cancel Event".
 * Marks the event as cancelled in the datastore and posts a public notice.
 */
export async function processCancelAction(
  client: SlackClient,
  eventId: string,
  userId: string,
  channelId: string,
): Promise<void> {
  const eventResp = await client.apps.datastore.get({
    datastore: EventsDatastore.name,
    id: eventId,
  });

  if (!eventResp.ok || !eventResp.item?.["event_id"]) {
    await client.chat.postEphemeral({
      channel: channelId,
      user: userId,
      text: ":x: Could not find the Secret Santa event.",
    });
    return;
  }

  const event = eventResp.item;

  if (event["status"] !== "open") {
    await client.chat.postEphemeral({
      channel: channelId,
      user: userId,
      text:
        ":information_source: This event is already closed (assignments have been sent or it was already cancelled).",
    });
    return;
  }

  await client.apps.datastore.put({
    datastore: EventsDatastore.name,
    item: { ...event, status: "cancelled" },
  });

  await client.chat.postMessage({
    channel: channelId,
    text: `:x: The Secret Santa event has been cancelled by <@${userId}>.`,
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
    const {
      channel_id,
      exchange_date,
      shuffle_date,
      rules,
      invoking_user,
    } = inputs;
    const event_id = crypto.randomUUID();

    // 1. Persist the event
    const eventPut = await client.apps.datastore.put({
      datastore: EventsDatastore.name,
      item: {
        event_id,
        channel_id,
        rules,
        exchange_date,
        shuffle_date: String(shuffle_date),
        created_by: invoking_user,
        message_ts: "",
        status: "open",
      },
    });

    if (!eventPut.ok) {
      return { error: `Failed to create event: ${eventPut.error}` };
    }

    // 2. Post the invitation message with interactive buttons
    const shuffleDateIso = new Date(shuffle_date * 1000).toISOString();
    const shuffleDateDisplay =
      `<!date^${shuffle_date}^{date_long} at {time}|${shuffleDateIso}>`;

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
            text: `:alarm_clock: *Assignments sent on*\n${shuffleDateDisplay}`,
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
              text: "Cancel Event :x:",
              emoji: true,
            },
            style: "danger",
            action_id: CANCEL_ACTION_ID,
            value: event_id,
            confirm: {
              title: {
                type: "plain_text",
                text: "Cancel this Secret Santa?",
              },
              text: {
                type: "mrkdwn",
                text:
                  "This will cancel the event and no assignments will be sent. *This cannot be undone.*",
              },
              confirm: {
                type: "plain_text",
                text: "Yes, cancel the event",
              },
              deny: {
                type: "plain_text",
                text: "Keep it going",
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
        shuffle_date: String(shuffle_date),
        created_by: invoking_user,
        message_ts: msgResp.ts ?? "",
        status: "open",
      },
    });

    // 4. Schedule the auto-shuffle trigger
    await client.workflows.triggers.create({
      type: "scheduled",
      name: "Secret Santa Auto-shuffle",
      workflow: "#/workflows/auto_shuffle_workflow",
      inputs: {
        event_id: { value: event_id },
        channel_id: { value: channel_id },
      },
      schedule: {
        start_time: shuffleDateIso,
        frequency: { type: "once" },
      },
    });

    // 5. Keep the function alive so button handlers remain active
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
    CANCEL_ACTION_ID,
    async (ctx: unknown) => {
      const { action, body, client } = ctx as BlockActionContext;
      await processCancelAction(
        client,
        action.value ?? "",
        body.user.id,
        body.container.channel_id,
      );
    },
  );
