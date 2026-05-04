import { findByProps, findByStoreName } from "@vendetta/metro";
import { FluxDispatcher, i18n } from "@vendetta/metro/common";
import { before, after, instead } from "@vendetta/patcher";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { Forms } from "@vendetta/ui/components";
import { findInReactTree } from "@vendetta/utils";

const LazyActionSheet = findByProps("openLazy", "hideActionSheet");
const ActionSheetRow = findByProps("ActionSheetRow")?.ActionSheetRow ?? Forms.FormRow;
const MessageStore = findByStoreName("MessageStore");
const Messages = findByProps("sendMessage", "startEditMessage", "editMessage");

const edits = new Map<string, any>();
let editMode: "content" | "time" | null = null;
let activeEditId: string | null = null;

let isStartingEdit = false;

const patches: (() => void)[] = [];

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

                    const currentMessage =
                        MessageStore.getMessage(message.channel_id, message.id) ?? message;

                    if (buttons.some((b: any) => b?.props?.label === "Edit Locally")) return;

                    const position = Math.max(
                        buttons.findIndex((x: any) =>
                            x?.props?.message === i18n.Messages.MARK_UNREAD
                        ),
                        0
                    );

                    const handleEditContent = () => {
                        editMode = "content";
                        activeEditId = currentMessage.id;
                        edits.set(currentMessage.id, JSON.parse(JSON.stringify(currentMessage)));
                        LazyActionSheet.hideActionSheet();

                        isStartingEdit = true;
                        Messages.startEditMessage(
                            currentMessage.channel_id,
                            currentMessage.id,
                            currentMessage.content
                        );
                        isStartingEdit = false;
                    };

                    const handleEditTime = () => {
                        editMode = "time";
                        activeEditId = currentMessage.id;
                        edits.set(currentMessage.id, JSON.parse(JSON.stringify(currentMessage)));
                        LazyActionSheet.hideActionSheet();

                        isStartingEdit = true;
                        Messages.startEditMessage(
                            currentMessage.channel_id,
                            currentMessage.id,
                            formatTimeForEdit(currentMessage.timestamp)
                        );
                        isStartingEdit = false;
                    };

                    buttons.splice(
                        position, 0,
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

        patches.push(instead("editMessage", Messages, (args, orig) => {
            const [channelId, messageId, message] = args;

            if (editMode !== null && activeEditId === messageId) {
                const baseMessage = edits.get(messageId);

                if (baseMessage) {
                    if (editMode === "content") {
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
                        activeEditId = null;
                        return;
                    }

                    if (editMode === "time") {
                        const live =
                            MessageStore.getMessage(channelId, messageId) ?? baseMessage;
                        FluxDispatcher.dispatch({
                            type: "MESSAGE_UPDATE",
                            message: {
                                ...baseMessage,
                                content: live.content,
                                timestamp: message.content,
                                edited_timestamp: null,
                            },
                            otherPluginBypass: true,
                        });
                        editMode = null;
                        activeEditId = null;
                        return;
                    }
                }
            }

            return orig(...args);
        }));

        patches.push(after("endEditMessage", Messages, () => {
            if (isStartingEdit) return;

            if (editMode !== null) {
                editMode = null;
                activeEditId = null;
            }
        }));
    },

    onUnload() {
        for (const p of patches) p();
        patches.length = 0;
        edits.clear();
        editMode = null;
        activeEditId = null;
        isStartingEdit = false;
    },
};
