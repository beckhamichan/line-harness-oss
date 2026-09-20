import { describe, expect, it } from "vitest";
import {
  broadcastMessagesSchema,
  buildCreateDraftInput,
  buildUpdateInput,
} from "../../src/tools/broadcast-input.js";

describe("manage_broadcasts message input", () => {
  it("accepts one through five ordered text, image, and flex messages", () => {
    const messages = [
      { type: "text" as const, content: "one" },
      { type: "image" as const, content: "{\"originalContentUrl\":\"https://example.com/2.jpg\"}" },
      { type: "flex" as const, content: "{\"type\":\"bubble\"}", altText: "three" },
      { type: "text" as const, content: "four" },
      { type: "text" as const, content: "five" },
    ];

    expect(broadcastMessagesSchema.safeParse(messages.slice(0, 1)).success).toBe(true);
    expect(broadcastMessagesSchema.safeParse(messages).success).toBe(true);
    expect(buildCreateDraftInput({ title: "Five", messages })).toMatchObject({ messages });
  });

  it("rejects zero and six messages", () => {
    expect(broadcastMessagesSchema.safeParse([]).success).toBe(false);
    expect(broadcastMessagesSchema.safeParse(
      Array.from({ length: 6 }, (_, index) => ({ type: "text", content: `message-${index}` })),
    ).success).toBe(false);
  });

  it("keeps the legacy single-message create format", () => {
    expect(buildCreateDraftInput({
      title: "Legacy",
      messageType: "text",
      messageContent: "hello",
    })).toEqual({
      title: "Legacy",
      messageType: "text",
      messageContent: "hello",
      targetType: "all",
    });
  });

  it("rejects messages combined with legacy fields", () => {
    expect(() => buildCreateDraftInput({
      title: "Mixed",
      messages: [{ type: "text", content: "new" }],
      messageType: "text",
      messageContent: "legacy",
    })).toThrow("messages cannot be combined with messageType, messageContent, or altText");

    expect(() => buildUpdateInput({
      messages: [{ type: "text", content: "new" }],
      altText: "legacy",
    })).toThrow("messages cannot be combined with messageType, messageContent, or altText");
  });

  it("sends the complete messages array for updates", () => {
    const messages = [
      { type: "text" as const, content: "first" },
      { type: "flex" as const, content: "{\"type\":\"bubble\"}", altText: "second" },
    ];

    expect(buildUpdateInput({ messages })).toEqual({ messages });
  });
});
