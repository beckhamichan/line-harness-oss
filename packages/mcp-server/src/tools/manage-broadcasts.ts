import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getClient } from "../client.js";
import {
  broadcastMessagesSchema,
  buildCreateDraftInput,
  buildUpdateInput,
} from "./broadcast-input.js";

export function registerManageBroadcasts(server: McpServer): void {
  server.tool(
    "manage_broadcasts",
    "配信の管理操作。list: 一覧、get: 詳細、create_draft: 下書き作成（送信しない）、update: 更新、send: 送信、send_to_segment: セグメント配信。",
    {
      action: z
        .enum(["list", "get", "create_draft", "update", "send", "send_to_segment"])
        .describe("Action to perform"),
      broadcastId: z.string().optional().describe("Broadcast ID (required for get, update, send, send_to_segment)"),
      title: z.string().optional().describe("Broadcast title (for create_draft, update)"),
      messages: broadcastMessagesSchema.optional().describe("Ordered list of 1-5 messages (for create_draft, update)"),
      messageType: z.enum(["text", "image", "flex"]).optional().describe("Legacy single message type (for create_draft, update)"),
      messageContent: z.string().optional().describe("Legacy single message content (for create_draft, update)"),
      altText: z.string().nullable().optional().describe("Legacy single Flex alt text (for create_draft, update)"),
      targetType: z.enum(["all", "tag"]).optional().describe("Target type (for create_draft, update)"),
      targetTagId: z.string().nullable().optional().describe("Target tag ID (for create_draft, update)"),
      scheduledAt: z.string().nullable().optional().describe("ISO 8601 datetime to schedule (for create_draft, update)"),
      segmentConditions: z.string().optional().describe("JSON string of segment conditions: {operator: 'AND'|'OR', rules: [{type, value}]} (for send_to_segment)"),
      accountId: z.string().optional().describe("LINE account ID (uses default if omitted)"),
    },
    async ({ action, broadcastId, title, messages, messageType, messageContent, altText, targetType, targetTagId, scheduledAt, segmentConditions, accountId }) => {
      try {
        const client = getClient();

        if (action === "list") {
          const broadcasts = await client.broadcasts.list(accountId ? { accountId } : undefined);
          const enriched = (broadcasts as unknown as Array<Record<string, unknown>>).map((b) => ({
            ...b,
            insightStatus: b.insight_status || null,
            openRate: b.open_rate != null
              ? `${(Number(b.open_rate) * 100).toFixed(1)}%`
              : null,
            clickRate: b.click_rate != null
              ? `${(Number(b.click_rate) * 100).toFixed(1)}%`
              : null,
          }));
          return { content: [{ type: "text" as const, text: JSON.stringify({ success: true, broadcasts: enriched }, null, 2) }] };
        }

        if (action === "create_draft") {
          const input = buildCreateDraftInput({
            title,
            messages,
            messageType,
            messageContent,
            altText,
            targetType,
            targetTagId,
            scheduledAt,
            accountId,
          });
          const broadcast = await client.broadcasts.create(input as never);
          return { content: [{ type: "text" as const, text: JSON.stringify({ success: true, broadcast }, null, 2) }] };
        }

        if (!broadcastId) throw new Error("broadcastId is required for this action");

        if (action === "get") {
          const broadcast = await client.broadcasts.get(broadcastId);
          const row = broadcast as unknown as Record<string, unknown>;
          const insight = row.insight_status
            ? {
                status: row.insight_status,
                delivered: row.delivered ?? null,
                uniqueImpression: row.unique_impression ?? null,
                uniqueClick: row.unique_click ?? null,
                uniqueMediaPlayed: row.unique_media_played ?? null,
                openRate: row.open_rate != null
                  ? `${(Number(row.open_rate) * 100).toFixed(1)}%`
                  : null,
                clickRate: row.click_rate != null
                  ? `${(Number(row.click_rate) * 100).toFixed(1)}%`
                  : null,
                fetchedAt: row.insight_fetched_at ?? null,
              }
            : null;
          const enriched = {
            ...broadcast,
            insight: insight || {
              status: 'none',
              note: 'Insightデータは次回配信から自動取得されます',
            },
          };
          return { content: [{ type: "text" as const, text: JSON.stringify({ success: true, broadcast: enriched }, null, 2) }] };
        }

        if (action === "update") {
          const input = buildUpdateInput({
            title,
            messages,
            messageType,
            messageContent,
            altText,
            targetType,
            targetTagId,
            scheduledAt,
          });
          const broadcast = await client.broadcasts.update(broadcastId, input);
          return { content: [{ type: "text" as const, text: JSON.stringify({ success: true, broadcast }, null, 2) }] };
        }

        if (action === "send") {
          const broadcast = await client.broadcasts.send(broadcastId);
          return { content: [{ type: "text" as const, text: JSON.stringify({ success: true, broadcast }, null, 2) }] };
        }

        if (action === "send_to_segment") {
          if (!segmentConditions) throw new Error("segmentConditions (JSON string) is required for send_to_segment");
          const conditions = JSON.parse(segmentConditions);
          const broadcast = await client.broadcasts.sendToSegment(broadcastId, conditions);
          return { content: [{ type: "text" as const, text: JSON.stringify({ success: true, broadcast }, null, 2) }] };
        }

        throw new Error(`Unknown action: ${action}`);
      } catch (err) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ success: false, error: String(err) }) }], isError: true };
      }
    },
  );
}
