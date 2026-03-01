import { DefineWorkflow, Schema } from "deno-slack-sdk/mod.ts";
import { SetupSecretSantaFunction } from "../functions/setup_secret_santa.ts";

export const StartSecretSantaWorkflow = DefineWorkflow({
  callback_id: "start_secret_santa_workflow",
  title: "Start Secret Santa",
  description: "Configure and launch a Secret Santa event in a channel",
  input_parameters: {
    properties: {
      interactivity: {
        type: Schema.slack.types.interactivity,
      },
      invoking_user: {
        type: Schema.slack.types.user_id,
      },
    },
    required: ["interactivity"],
  },
});

// Step 1: Show the admin a form to configure the event
const setupForm = StartSecretSantaWorkflow.addStep(
  Schema.slack.functions.OpenForm,
  {
    title: "Set Up Secret Santa",
    interactivity: StartSecretSantaWorkflow.inputs.interactivity,
    submit_label: "Launch Event",
    fields: {
      elements: [
        {
          name: "channel",
          title: "Channel",
          description: "The channel where the invitation will be posted",
          type: Schema.slack.types.channel_id,
        },
        {
          name: "exchange_date",
          title: "Gift Exchange Date",
          description: "The day when participants will trade presents",
          type: Schema.slack.types.date,
        },
        {
          name: "shuffle_date",
          title: "Shuffle Date & Time",
          description:
            "When assignments will be automatically sent to participants",
          type: Schema.slack.types.timestamp,
        },
        {
          name: "rules",
          title: "Rules / Description",
          description: "Gift-exchange rules that all participants will see",
          type: Schema.types.string,
          long: true,
        },
      ],
      required: ["channel", "exchange_date", "shuffle_date", "rules"],
    },
  },
);

// Step 2: Post the invitation message to the chosen channel
StartSecretSantaWorkflow.addStep(SetupSecretSantaFunction, {
  channel_id: setupForm.outputs.fields.channel,
  exchange_date: setupForm.outputs.fields.exchange_date,
  shuffle_date: setupForm.outputs.fields.shuffle_date,
  rules: setupForm.outputs.fields.rules,
  invoking_user: StartSecretSantaWorkflow.inputs.invoking_user,
});

export default StartSecretSantaWorkflow;
