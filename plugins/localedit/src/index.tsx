import { findByProps, findByStoreName } from "@vendetta/metro";
import { FluxDispatcher, i18n } from "@vendetta/metro/common";
import { before, after } from "@vendetta/patcher";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { Forms } from "@vendetta/ui/components";
import { showInputAlert } from "@vendetta/ui/alerts";
import { findInReactTree } from "@vendetta/utils";

const LazyActionSheet = findByProps("openLazy", "hideActionSheet");
const ActionSheetRow = findByProps("ActionSheetRow")?.ActionSheetRow ?? Forms.FormRow;
const MessageStore = findByStoreName("MessageStore");
const UserStore = findByStoreName("UserStore");
const Messages = findByProps("sendMessage", "startEditMessage", "editMessage");

const edits = new Map<string, any>();
let isEditing = false;
let patches: (() => void)[] = [];

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

                    // ── Fix 1: removed the self-user guard so own messages are included ──

                    if (buttons.some(b => b?.props?.label === "Edit Locally")) return;

                    const position = Math.max(
                        buttons.findIndex((x: any) => x.props.message === i18n.Messages.MARK_UNREAD),
                        0
                    );

                    // ── Button 1: Edit Locally (content) ──
                    const handleEditContent = () => {
                        isEditing = true;
                        if (!edits.has(currentMessage.id)) {
                            edits.set(currentMessage.id, JSON.parse(JSON.stringify(currentMessage)));
                        }
                        LazyActionSheet.hideActionSheet();
                        Messages.startEditMessage(currentMessage.channel_id, currentMessage.id, currentMessage.content);
                    };

                    // ── Button 2: Edit Time (timestamp) ──
                    const handleEditTime = () => {
                        LazyActionSheet.hideActionSheet();

                        const existing = new Date(currentMessage.timestamp ?? Date.now());
                        const hh = String(existing.getHours()).padStart(2, "0");
                        const mm = String(existing.getMinutes()).padStart(2, "0");

                        showInputAlert({
                            title: "Edit Message Time",
                            placeholder: `${hh}:${mm}`,
                            initialValue: `${hh}:${mm}`,
                            confirmText: "Apply",
                            cancelText: "Cancel",
                            onConfirm: (input: string) => {
                                const match = input.trim().match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
                                if (!match) return;

                                const [, newHH, newMM] = match;
                                const newDate = new Date(existing);
                                newDate.setHours(Number(newHH), Number(newMM), 0, 0);

                                const base = edits.get(currentMessage.id)
                                    ?? JSON.parse(JSON.stringify(currentMessage));
                                edits.set(currentMessage.id, base);

                                FluxDispatcher.dispatch({
                                    type: "MESSAGE_UPDATE",
                                    message: {
                                        ...base,
                                        // Keep current locally-edited content if already edited
                                        content: (MessageStore.getMessage(currentMessage.channel_id, currentMessage.id) ?? currentMessage).content,
                                        timestamp: newDate.toISOString(),
                                        edited_timestamp: null,
                                    },
                                    otherPluginBypass: true,
                                });
                            },
                        });
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
            const [, messageId, message] = args;

            if (isEditing) {
                const baseMessage = edits.get(messageId);
                if (!baseMessage) return;

                FluxDispatcher.dispatch({
                    type: "MESSAGE_UPDATE",
                    message: {
                        ...baseMessage,
                        content: message.content,
                        edited_timestamp: null,
                    },
                    otherPluginBypass: true,
                });
                return false;
            }
        }));

        patches.push(after("endEditMessage", Messages, () => {
            if (isEditing) {
                isEditing = false;
            }
        }));
    },

    onUnload() {
        patches.forEach(p => p());
        patches = [];
        edits.clear();
    }
};
