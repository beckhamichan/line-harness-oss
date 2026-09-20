import { z } from "zod";

const broadcastMessageSchema = z.object({
  type: z.enum(["text", "image", "flex"]),
  content: z.string().min(1),
  altText: z.string().nullable().optional(),
});

export const broadcastMessagesSchema = z.array(broadcastMessageSchema).min(1).max(5);

type BroadcastMessage = z.infer<typeof broadcastMessageSchema>;
type MessageFields = {
  messages?: BroadcastMessage[];
  messageType?: "text" | "image" | "flex";
  messageContent?: string;
  altText?: string | null;
};

function rejectMixedMessageFields(input: MessageFields): void {
  if (
    input.messages !== undefined &&
    (input.messageType !== undefined || input.messageContent !== undefined || input.altText !== undefined)
  ) {
    throw new Error("messages cannot be combined with messageType, messageContent, or altText");
  }
}

export function buildCreateDraftInput(input: MessageFields & {
  title?: string;
  targetType?: "all" | "tag";
  targetTagId?: string | null;
  scheduledAt?: string | null;
  accountId?: string;
}): Record<string, unknown> {
  rejectMixedMessageFields(input);
  if (!input.title || (input.messages === undefined && (!input.messageType || !input.messageContent))) {
    throw new Error("title and either messages or messageType/messageContent are required for create_draft");
  }

  const result: Record<string, unknown> = {
    title: input.title,
    targetType: input.targetType ?? "all",
  };
  if (input.messages !== undefined) result.messages = input.messages;
  if (input.messageType !== undefined) result.messageType = input.messageType;
  if (input.messageContent !== undefined) result.messageContent = input.messageContent;
  if (input.altText !== undefined) result.altText = input.altText;
  if (input.targetTagId) result.targetTagId = input.targetTagId;
  if (input.scheduledAt) result.scheduledAt = input.scheduledAt;
  if (input.accountId) result.lineAccountId = input.accountId;
  return result;
}

export function buildUpdateInput(input: MessageFields & {
  title?: string;
  targetType?: "all" | "tag";
  targetTagId?: string | null;
  scheduledAt?: string | null;
}): Record<string, unknown> {
  rejectMixedMessageFields(input);

  const result: Record<string, unknown> = {};
  if (input.title !== undefined) result.title = input.title;
  if (input.messages !== undefined) result.messages = input.messages;
  if (input.messageType !== undefined) result.messageType = input.messageType;
  if (input.messageContent !== undefined) result.messageContent = input.messageContent;
  if (input.altText !== undefined) result.altText = input.altText;
  if (input.targetType !== undefined) result.targetType = input.targetType;
  if (input.targetTagId !== undefined) result.targetTagId = input.targetTagId;
  if (input.scheduledAt !== undefined) result.scheduledAt = input.scheduledAt;
  return result;
}
