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

// ── KEY FLAG ──────────────────────────────────────────────────────────────────
// startEditMessage internally calls endEditMessage to clear the previous session.
// Without this flag our after("endEditMessage") patch would immediately reset
// editMode → null the moment we call startEditMessage, so the user's submit
// would fall through to the real Discord API.
let isStartingEdit = false;
// ─────────────────────────────────────────────────────────────────────────────

const patches: (() => void)[] = [];

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

                        // Guard: don't let our endEditMessage patch reset state
                        // during the internal endEditMessage that startEditMessage fires
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

                        // Same guard — critical for Edit Time
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

        // Intercept editMessage — block real API call for our local edits
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
                        return; // ← DO NOT call orig() — no API request
                    }

                    if (editMode === "time") {
                        const newTimestamp = parseTimeInput(
                            message.content,
                            baseMessage.timestamp
                        );
                        if (newTimestamp) {
                            const live =
                                MessageStore.getMessage(channelId, messageId) ?? baseMessage;
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
                        activeEditId = null;
                        return; // ← DO NOT call orig() — no API request
                    }
                }
            }

            // Normal edit (not ours) — let Discord handle it
            return orig(...args);
        }));

        // Detect user pressing Escape / tapping away to cancel edit
        patches.push(after("endEditMessage", Messages, () => {
            // IMPORTANT: skip reset if WE triggered endEditMessage via startEditMessage
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
