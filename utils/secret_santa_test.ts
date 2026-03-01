import {
  assertEquals,
  assertNotEquals,
  assertNotStrictEquals,
} from "@std/assert";
import { createDerangement, shuffle } from "./secret_santa.ts";

Deno.test("shuffle - returns the same elements", () => {
  const input = ["a", "b", "c", "d"];
  const result = shuffle(input);
  assertEquals(result.length, input.length);
  assertEquals([...result].sort(), [...input].sort());
});

Deno.test("shuffle - does not mutate the original array", () => {
  const input = ["a", "b", "c"];
  const copy = [...input];
  shuffle(input);
  assertEquals(input, copy);
});

Deno.test("shuffle - returns a new array instance", () => {
  const input = ["a", "b", "c"];
  const result = shuffle(input);
  assertNotStrictEquals(result, input); // different reference, not deep equality
});

Deno.test("createDerangement - no self-assignments across 100 runs", () => {
  const users = ["U1", "U2", "U3", "U4", "U5"];
  for (let i = 0; i < 100; i++) {
    const result = createDerangement(users);
    assertNotEquals(result, null);
    if (result) {
      for (let j = 0; j < users.length; j++) {
        assertNotEquals(
          result[j],
          users[j],
          `Self-assignment detected at index ${j}: ${result[j]}`,
        );
      }
    }
  }
});

Deno.test("createDerangement - preserves all participants", () => {
  const users = ["U1", "U2", "U3"];
  const result = createDerangement(users);
  assertNotEquals(result, null);
  assertEquals([...result!].sort(), [...users].sort());
});

Deno.test("createDerangement - works with minimum of 2 users", () => {
  // With 2 users the only valid derangement is [B, A]
  const users = ["U1", "U2"];
  const result = createDerangement(users);
  assertNotEquals(result, null);
  assertEquals(result, ["U2", "U1"]);
});

Deno.test("createDerangement - returns null for a single user", () => {
  // No valid derangement exists for a list of one element
  const result = createDerangement(["U1"]);
  assertEquals(result, null);
});

Deno.test("createDerangement - works with large lists", () => {
  const users = Array.from({ length: 50 }, (_, i) => `U${i}`);
  const result = createDerangement(users);
  assertNotEquals(result, null);
  if (result) {
    assertEquals(result.length, users.length);
    assertEquals([...result].sort(), [...users].sort());
    for (let i = 0; i < users.length; i++) {
      assertNotEquals(result[i], users[i]);
    }
  }
});
