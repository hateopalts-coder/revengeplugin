import { registerCommand, unregisterAllCommands } from "@vendetta/commands";
import { findByProps, findByStoreName, findByDisplayName } from "@vendetta/metro";
import { FluxDispatcher, i18n } from "@vendetta/metro/common";
import { before, after, instead } from "@vendetta/patcher";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { Forms } from "@vendetta/ui/components";
import { findInReactTree } from "@vendetta/utils";
import { showToast } from "@vendetta/ui/toasts";

const LazyActionSheet = findByProps("openLazy", "hideActionSheet");
const ActionSheetRow = findByProps("ActionSheetRow")?.ActionSheetRow ?? Forms.FormRow;
const MessageStore = findByStoreName("MessageStore");
const Messages = findByProps("sendMessage", "startEditMessage", "editMessage");

const edits = new Map();
let editMode: "content" | null = null;
let activeEditId: string | null = null;
let isStartingEdit = false;

const patches: Array<() => void> = [];

function log(...args: any[]) {
    console.log("[EditTime]", ...args);
}

// Shared core logic: locally overwrite a message's content via MESSAGE_UPDATE,
// using the original message as the base so other fields (embeds, attachments,
// reactions, etc.) stay intact. Used by both the "Edit Locally" action sheet
// button and the /localedit slash command.
function applyLocalEdit(channelId: string, messageId: string, newContent: string) {
    const currentMessage = MessageStore.getMessage(channelId, messageId);
    if (!currentMessage) return false;

    const baseMessage = edits.get(messageId) ?? JSON.parse(JSON.stringify(currentMessage));

    FluxDispatcher.dispatch({
        type: "MESSAGE_UPDATE",
        message: { ...baseMessage, content: newContent, edited_timestamp: null },
        otherPluginBypass: true,
    });

    edits.delete(messageId);
    return true;
}

const loadCommands = () => {
    registerCommand({
        name: "localedit",
        description: "Locally edit a message's content (only visible to you)",
        options: [
            {
                name: "messageid",
                description: "The ID of the message to edit",
                type: 3, // STRING
                required: true,
            },
            {
                name: "text",
                description: "The new content to show locally",
                type: 3, // STRING
                required: true,
            },
        ],
        execute: (args, ctx) => {
            const messageId = args.find((a: any) => a.name === "messageid")?.value;
            const text = args.find((a: any) => a.name === "text")?.value;
            const channelId = ctx?.channel?.id;

            if (!channelId || !messageId || text === undefined) {
                showToast("Missing channel, message ID, or text.");
                return;
            }

            const success = applyLocalEdit(channelId, messageId, text);
            showToast(success ? "Message edited locally." : "Message not found in this channel.");
        },
    });
};

export default {
    onLoad() {
        loadCommands();

        patches.push(
            before("openLazy", LazyActionSheet, ([component, key, msg]: any[]) => {
                const message = msg?.message;
                if (key !== "MessageLongPressActionSheet" || !message) return;

                component.then((instance: any) => {
                    const unpatch = after("default", instance, (_: any, res: any) => {
                        setTimeout(unpatch, 0);

                        const buttons = findInReactTree(res, (x: any) => x?.[0]?.type?.name === "ActionSheetRow");
                        if (!buttons) return;

                        const currentMessage = MessageStore.getMessage(message.channel_id, message.id) ?? message;
                        if (buttons.some((b: any) => b?.props?.label === "Edit Locally")) return;

                        const position = Math.max(
                            buttons.findIndex((x: any) => x?.props?.message === i18n.Messages.MARK_UNREAD),
                            0
                        );

                        const handleEditContent = () => {
                            editMode = "content";
                            activeEditId = currentMessage.id;
                            edits.set(currentMessage.id, JSON.parse(JSON.stringify(currentMessage)));
                            LazyActionSheet.hideActionSheet();
                            isStartingEdit = true;
                            Messages.startEditMessage(currentMessage.channel_id, currentMessage.id, currentMessage.content);
                            isStartingEdit = false;
                        };

                        buttons.splice(
                            position,
                            0,
                            <ActionSheetRow
                                label="Edit Locally"
                                icon={<ActionSheetRow.Icon source={getAssetIDByName("ic_edit_24px")} />}
                                onPress={handleEditContent}
                            />
                        );
                    });
                });
            })
        );

        patches.push(
            instead("editMessage", Messages, (args: any[], orig: (...a: any[]) => any) => {
                const [channelId, messageId, message] = args;

                if (editMode === "content" && activeEditId === messageId) {
                    const baseMessage = edits.get(messageId);

                    if (baseMessage) {
                        FluxDispatcher.dispatch({
                            type: "MESSAGE_UPDATE",
                            message: { ...baseMessage, content: message.content, edited_timestamp: null },
                            otherPluginBypass: true,
                        });
                        edits.delete(messageId);
                        editMode = null;
                        activeEditId = null;
                        return;
                    }
                }

                return orig(...args);
            })
        );

        patches.push(
            after("endEditMessage", Messages, () => {
                if (isStartingEdit) return;
                if (editMode !== null) {
                    editMode = null;
                    activeEditId = null;
                }
            })
        );
    },

    onUnload() {
        unregisterAllCommands();
        for (const p of patches) p();
        patches.length = 0;
        edits.clear();
        editMode = null;
        activeEditId = null;
        isStartingEdit = false;
    },
};
