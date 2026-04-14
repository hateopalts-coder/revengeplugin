import { findByProps, findByStoreName } from "@vendetta/metro";
import { FluxDispatcher, i18n } from "@vendetta/metro/common";
import { before, after } from "@vendetta/patcher";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { Forms } from "@vendetta/ui/components";
import { findInReactTree } from "@vendetta/utils";

const LazyActionSheet = findByProps("openLazy", "hideActionSheet");
const ActionSheetRow = findByProps("ActionSheetRow")?.ActionSheetRow ?? Forms.FormRow;
const MessageStore = findByStoreName("MessageStore");
const UserStore = findByStoreName("UserStore");
const Messages = findByProps("sendMessage", "startEditMessage", "editMessage");

const edits = new Map<string, any>();

// Tracks which kind of local edit is active
let editMode: "content" | "time" | null = null;

let patches: (() => void)[] = [];

// Parse "6:07 PM", "6:07PM", "18:07", or "6:07" into a full ISO timestamp
function parseTimeInput(input: string, baseTimestamp: string): string | null {
    const base = new Date(baseTimestamp ?? Date.now());

    const ampmMatch = input.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (ampmMatch) {
        let h = Number(ampmMatch[1]);
        const m = Number(ampmMatch[2]);
        const period = ampmMatch[3].toUpperCase();
        if (period === "AM" && h === 12) h = 0;
        if (period === "PM" && h !== 12) h += 12;
        if (h > 23 || m > 59) return null;
        base.setHours(h, m, 0, 0);
        return base.toISOString();
    }

    const h24Match = input.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (h24Match) {
        const h = Number(h24Match[1]);
        const m = Number(h24Match[2]);
        if (h > 23 || m > 59) return null;
        base.setHours(h, m, 0, 0);
        return base.toISOString();
    }

    return null;
}

// Format the message timestamp as "6:07 PM" to pre-fill the edit box
function formatTimeForEdit(timestamp: string): string {
    const d = new Date(timestamp ?? Date.now());
    const h = d.getHours();
    const m = String(d.getMinutes()).padStart(2, "0");
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 || 12;
    return `${h12}:${m} ${ampm}`;
}

export default {
    onLoad() {
        patches.push(before("openLazy", LazyActionSheet, ([component, key, msg]) => {
            const message = msg?.message;
            if (key !== "MessageLongPressActionSheet" || !message) return;

            component.then(instance => {
                const unpatch = after("default", instance, (_, res) => {
                    setTimeout(unpatch, 0);

                    const buttons = findInReactTree(res, x => x?.[0]?.type?.name === "ActionSheetRow");
                    if (!buttons) return;

                    const currentMessage = MessageStore.getMessage(message.channel_id, message.id) ?? message;

                    // Self-user guard removed — own messages are now included

                    if (buttons.some(b => b?.props?.label === "Edit Locally")) return;

                    const position = Math.max(
                        buttons.findIndex((x: any) => x.props.message === i18n.Messages.MARK_UNREAD),
                        0
                    );

                    // ── Edit Locally: edits message content inline ──
                    const handleEditContent = () => {
                        editMode = "content";
                        if (!edits.has(currentMessage.id)) {
                            edits.set(currentMessage.id, JSON.parse(JSON.stringify(currentMessage)));
                        }
                        LazyActionSheet.hideActionSheet();
                        Messages.startEditMessage(
                            currentMessage.channel_id,
                            currentMessage.id,
                            currentMessage.content
                        );
                    };

                    // ── Edit Time: reuses Discord's inline edit box, pre-filled with "6:07 PM" ──
                    const handleEditTime = () => {
                        editMode = "time";
                        if (!edits.has(currentMessage.id)) {
                            edits.set(currentMessage.id, JSON.parse(JSON.stringify(currentMessage)));
                        }
                        LazyActionSheet.hideActionSheet();
                        // Pre-fill the chat edit box with the current time e.g. "6:07 PM"
                        Messages.startEditMessage(
                            currentMessage.channel_id,
                            currentMessage.id,
                            formatTimeForEdit(currentMessage.timestamp)
                        );
                    };

                    buttons.splice(position, 0,
                        <ActionSheetRow
                            label="Edit Locally"
                            icon={<ActionSheetRow.Icon source={getAssetIDByName("ic_edit_24px")} />}
                            onPress={handleEditContent}
                        />,
                        <ActionSheetRow
                            label="Edit Time"
                            icon={<ActionSheetRow.Icon source={getAssetIDByName("ic_clock")} />}
                            onPress={handleEditTime}
                        />
                    );
                });
            });
        }));

        patches.push(before("editMessage", Messages, (args) => {
            const [channelId, messageId, message] = args;
            const baseMessage = edits.get(messageId);
            if (!baseMessage) return;

            if (editMode === "content") {
                // Locally update the content, keep existing timestamp
                FluxDispatcher.dispatch({
                    type: "MESSAGE_UPDATE",
                    message: {
                        ...baseMessage,
                        content: message.content,
                        edited_timestamp: null,
                    },
                    otherPluginBypass: true,
                });
                editMode = null;
                return false;
            }

            if (editMode === "time") {
                // The user typed a new time — parse it and update the timestamp only
                const newTimestamp = parseTimeInput(message.content, baseMessage.timestamp);
                if (newTimestamp) {
                    // Preserve whatever the current displayed content is
                    const live = MessageStore.getMessage(channelId, messageId) ?? baseMessage;
                    FluxDispatcher.dispatch({
                        type: "MESSAGE_UPDATE",
                        message: {
                            ...baseMessage,
                            content: live.content,
                            timestamp: newTimestamp,
                            edited_timestamp: null,
                        },
                        otherPluginBypass: true,
                    });
                }
                editMode = null;
                return false;
            }
        }));

        patches.push(after("endEditMessage", Messages, () => {
            // User pressed Escape / cancelled — reset mode
            if (editMode !== null) {
                editMode = null;
            }
        }));
    },

    onUnload() {
        patches.forEach(p => p());
        patches = [];
        edits.clear();
        editMode = null;
    }
};
