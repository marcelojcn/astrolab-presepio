import { assertEquals } from "@std/assert";
import { AutoShuffleWorkflow } from "./auto_shuffle.ts";

Deno.test("AutoShuffleWorkflow - has correct callback_id", () => {
  assertEquals(
    AutoShuffleWorkflow.definition.callback_id,
    "auto_shuffle_workflow",
  );
});

Deno.test("AutoShuffleWorkflow - has event_id input parameter", () => {
  const props = AutoShuffleWorkflow.definition.input_parameters?.properties ??
    {};
  assertEquals("event_id" in props, true);
});

Deno.test("AutoShuffleWorkflow - has channel_id input parameter", () => {
  const props = AutoShuffleWorkflow.definition.input_parameters?.properties ??
    {};
  assertEquals("channel_id" in props, true);
});

Deno.test("AutoShuffleWorkflow - requires event_id and channel_id", () => {
  const required = (AutoShuffleWorkflow.definition.input_parameters?.required ??
    []) as string[];
  assertEquals(required.includes("event_id"), true);
  assertEquals(required.includes("channel_id"), true);
});
