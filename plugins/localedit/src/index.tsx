import { findByProps, findByStoreName } from "@vendetta/metro";
import { FluxDispatcher } from "@vendetta/metro/common";
import { registerCommand } from "@vendetta/commands";
import { showToast } from "@vendetta/ui/toasts";

let unregister: (() => void) | undefined;

function getMessageStore(): any {
  return (
    findByStoreName("MessageStore") ?? findByProps("getMessage", "getMessages")
  );
}

function getArg(args: any[], name: string): string {
  const arg = args.find((a) => a.name === name);
  return arg?.value != null ? String(arg.value) : "";
}

// Accepts a plain message ID or a full message link
function parseMessageId(raw: string): string | undefined {
  const ids = raw.match(/\d{15,}/g);
  return ids ? ids[ids.length - 1] : undefined;
}

export default {
  onLoad() {
    unregister = registerCommand({
      name: "ledit",
      displayName: "ledit",
      description: "Edit a message only for you",
      displayDescription: "Edit a message only for you",
      applicationId: "-1",
      inputType: 1,
      type: 1,
      options: [
        {
          name: "message_id",
          displayName: "message_id",
          description: "Message ID or message link",
          displayDescription: "Message ID or message link",
          type: 3,
          required: true,
        },
        {
          name: "text",
          displayName: "text",
          description: "New text",
          displayDescription: "New text",
          type: 3,
          required: true,
        },
      ],
      execute(args: any[], ctx: any) {
        try {
          const id = parseMessageId(getArg(args, "message_id"));
          const text = getArg(args, "text");
          const channelId = ctx?.channel?.id;

          if (!id) return void showToast("Message ID is not correct");
          if (!channelId) return void showToast("Channel not found");

          const msg = getMessageStore()?.getMessage(channelId, id);
          if (!msg) return void showToast("Message not found in this channel");

          FluxDispatcher.dispatch({
            type: "MESSAGE_UPDATE",
            message: {
              id,
              channel_id: channelId,
              guild_id: msg.guild_id,
              content: text,
              edited_timestamp: new Date().toISOString(),
            },
          });
          showToast("Message edited for you only");
        } catch (e: any) {
          showToast("Error: " + (e?.message ?? e));
        }
      },
    } as any);
  },

  onUnload() {
    unregister?.();
    unregister = undefined;
  },
};
