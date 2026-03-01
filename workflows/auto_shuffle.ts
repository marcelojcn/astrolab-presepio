import { DefineWorkflow, Schema } from "deno-slack-sdk/mod.ts";
import { AutoShuffleFunction } from "../functions/auto_shuffle.ts";

export const AutoShuffleWorkflow = DefineWorkflow({
  callback_id: "auto_shuffle_workflow",
  title: "Secret Santa Auto Shuffle",
  input_parameters: {
    properties: {
      event_id: {
        type: Schema.types.string,
      },
      channel_id: {
        type: Schema.slack.types.channel_id,
      },
    },
    required: ["event_id", "channel_id"],
  },
});

AutoShuffleWorkflow.addStep(AutoShuffleFunction, {
  event_id: AutoShuffleWorkflow.inputs.event_id,
  channel_id: AutoShuffleWorkflow.inputs.channel_id,
});

export default AutoShuffleWorkflow;
