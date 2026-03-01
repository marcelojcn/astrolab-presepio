import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";
import {
  EventsDatastore,
  ParticipantsDatastore,
} from "../datastores/participants.ts";

export const SetupSecretSantaFunction = DefineFunction({
  callback_id: "setup_secret_santa",
  title: "Setup Secret Santa Event",
  description: "Creates the event record and posts the invitation to the channel",
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

const JOIN_ACTION_ID = "join_secret_santa";
const SHUFFLE_ACTION_ID = "run_secret_santa";

/** Returns a new shuffled copy of the array (Fisher-Yates). */
function shuffle<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Generates a derangement — a permutation where no element appears
 * in its original position (guarantees no self-assignment).
 * Uses retry loop; probability of success per attempt ≈ 1/e (36.8%).
 */
function createDerangement(users: string[]): string[] | null {
  for (let attempt = 0; attempt < 20; attempt++) {
    const shuffled = shuffle(users);
    if (shuffled.every((receiver, i) => receiver !== users[i])) {
      return shuffled;
    }
  }
  return null;
}

export default SlackFunction(
  SetupSecretSantaFunction,
  async ({ inputs, client }) => {
    const { channel_id, exchange_date, rules, invoking_user } = inputs;
    const event_id = crypto.randomUUID();

    // 1. Persist the event to the datastore
    const eventPut = await client.apps.datastore.put<
      typeof EventsDatastore.definition
    >({
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

    // 2. Build and post the invitation message with interactive buttons
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
          text: "*What is Secret Santa?*\nEach participant is randomly assigned one other person to buy a gift for. The assignments are kept secret until gift exchange day — then everyone reveals who they gave to!",
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
                text: "This will randomly pair all participants and send each person a DM with their assignment. *This cannot be undone.*",
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

    // 3. Update the event record with the posted message timestamp
    await client.apps.datastore.put<typeof EventsDatastore.definition>({
      datastore: EventsDatastore.name,
      item: {
        event_id,
        channel_id,
        rules,
        exchange_date,
        created_by: invoking_user,
        message_ts: msgResp.ts as string,
        status: "open",
      },
    });

    // 4. Keep the function incomplete so the button handlers remain active
    return { completed: false };
  },
)
  // --- Join handler ---
  .addBlockActionsHandler(
    JOIN_ACTION_ID,
    async ({ action, body, client }) => {
      const event_id = action.value;
      const user_id = body.user.id;
      const channel_id = body.container.channel_id;
      const participant_id = `${event_id}#${user_id}`;

      // Check if the user has already joined
      const existing = await client.apps.datastore.get<
        typeof ParticipantsDatastore.definition
      >({
        datastore: ParticipantsDatastore.name,
        id: participant_id,
      });

      if (existing.ok && existing.item?.participant_id) {
        await client.chat.postEphemeral({
          channel: channel_id,
          user: user_id,
          text: "You've already joined this Secret Santa event! :gift: Watch for your DM when assignments are sent.",
        });
        return;
      }

      // Fetch event to get the exchange date for the confirmation message
      const eventResp = await client.apps.datastore.get<
        typeof EventsDatastore.definition
      >({
        datastore: EventsDatastore.name,
        id: event_id,
      });

      const exchangeDate = eventResp.ok && eventResp.item?.exchange_date
        ? ` Gift exchange day is *${eventResp.item.exchange_date}*.`
        : "";

      // Register the participant
      const putResp = await client.apps.datastore.put<
        typeof ParticipantsDatastore.definition
      >({
        datastore: ParticipantsDatastore.name,
        item: {
          participant_id,
          event_id,
          user_id,
          channel_id,
          joined_at: new Date().toISOString(),
        },
      });

      if (!putResp.ok) {
        await client.chat.postEphemeral({
          channel: channel_id,
          user: user_id,
          text: `:x: Failed to join the event. Please try again. (${putResp.error})`,
        });
        return;
      }

      await client.chat.postEphemeral({
        channel: channel_id,
        user: user_id,
        text: `:white_check_mark: You're in the Secret Santa!${exchangeDate} You'll receive a DM with your assignment once the organizer starts the shuffle.`,
      });
    },
  )
  // --- Shuffle handler ---
  .addBlockActionsHandler(
    SHUFFLE_ACTION_ID,
    async ({ action, body, client }) => {
      const event_id = action.value;
      const triggering_user = body.user.id;
      const channel_id = body.container.channel_id;

      // Fetch the event record
      const eventResp = await client.apps.datastore.get<
        typeof EventsDatastore.definition
      >({
        datastore: EventsDatastore.name,
        id: event_id,
      });

      if (!eventResp.ok || !eventResp.item?.event_id) {
        await client.chat.postEphemeral({
          channel: channel_id,
          user: triggering_user,
          text: ":x: Could not find the Secret Santa event. Please contact the organizer.",
        });
        return;
      }

      const event = eventResp.item;

      if (event.status === "picked") {
        await client.chat.postEphemeral({
          channel: channel_id,
          user: triggering_user,
          text: ":information_source: Assignments have already been sent for this event. Check your DMs!",
        });
        return;
      }

      // Collect all participants (paginated)
      const allParticipants: string[] = [];
      let cursor: string | undefined;

      do {
        const queryResp = await client.apps.datastore.query<
          typeof ParticipantsDatastore.definition
        >({
          datastore: ParticipantsDatastore.name,
          expression: "#event_id = :event_id",
          expression_attributes: { "#event_id": "event_id" },
          expression_values: { ":event_id": event_id },
          ...(cursor ? { cursor } : {}),
        });

        if (!queryResp.ok) {
          await client.chat.postEphemeral({
            channel: channel_id,
            user: triggering_user,
            text: `:x: Failed to retrieve participants: ${queryResp.error}`,
          });
          return;
        }

        for (const item of queryResp.items ?? []) {
          allParticipants.push(item.user_id as string);
        }

        cursor = queryResp.next_cursor;
      } while (cursor);

      // Validate minimum participant count
      if (allParticipants.length < 3) {
        await client.chat.postEphemeral({
          channel: channel_id,
          user: triggering_user,
          text: `:x: Not enough participants to shuffle. Need at least 3, currently have *${allParticipants.length}*. Wait for more people to join!`,
        });
        return;
      }

      // Generate a valid derangement (no self-assignment)
      const receivers = createDerangement(allParticipants);

      if (!receivers) {
        await client.chat.postEphemeral({
          channel: channel_id,
          user: triggering_user,
          text: ":x: Failed to generate assignments. Please try again.",
        });
        return;
      }

      // Send DMs to all participants
      const dmErrors: string[] = [];

      for (let i = 0; i < allParticipants.length; i++) {
        const giver = allParticipants[i];
        const receiver = receivers[i];

        const dmResp = await client.conversations.open({ users: giver });

        if (!dmResp.ok) {
          dmErrors.push(`<@${giver}>`);
          continue;
        }

        const dmChannel = (dmResp.channel as { id: string }).id;

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
                text: `You are the Secret Santa for *<@${receiver}>*! :gift:\n\nRemember to keep it a secret until gift exchange day!`,
              },
            },
            {
              type: "section",
              fields: [
                {
                  type: "mrkdwn",
                  text: `:calendar: *Gift Exchange Date*\n${event.exchange_date}`,
                },
                {
                  type: "mrkdwn",
                  text: `:bust_in_silhouette: *Organizer*\n<@${triggering_user}>`,
                },
              ],
            },
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `*Event Rules:*\n${event.rules}`,
              },
            },
          ],
          text: `Your Secret Santa assignment: you're buying a gift for <@${receiver}>!`,
        });

        if (!sendResp.ok) {
          dmErrors.push(`<@${giver}>`);
        }
      }

      // Mark the event as picked
      await client.apps.datastore.put<typeof EventsDatastore.definition>({
        datastore: EventsDatastore.name,
        item: {
          ...event,
          status: "picked",
        },
      });

      // Post a summary to the channel
      const successCount = allParticipants.length - dmErrors.length;
      const summaryText = dmErrors.length === 0
        ? `:white_check_mark: *Secret Santa assignments sent!* All ${successCount} participants have received their DMs. Check your messages! :gift:`
        : `:warning: Assignments sent to ${successCount} of ${allParticipants.length} participants. Could not reach: ${dmErrors.join(", ")}`;

      await client.chat.postMessage({
        channel: event.channel_id as string,
        text: summaryText,
      });
    },
  );
