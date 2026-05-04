import { findByProps, findByStoreName, findByDisplayName } from "@vendetta/metro";
import { FluxDispatcher, i18n } from "@vendetta/metro/common";
import { before, after, instead } from "@vendetta/patcher";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { Forms } from "@vendetta/ui/components";
import { findInReactTree } from "@vendetta/utils";

const LazyActionSheet = findByProps("openLazy", "hideActionSheet");
const ActionSheetRow = findByProps("ActionSheetRow")?.ActionSheetRow ?? Forms.FormRow;
const MessageStore = findByStoreName("MessageStore");
const Messages = findByProps("sendMessage", "startEditMessage", "editMessage");

// ── messageId → custom display text (jo user ne likha) ────────────────────────
const customTimeOverrides = new Map<string, string>();

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

// ── Timestamp text renderer ko patch karo ─────────────────────────────────────
// Discord message header mein timestamp ek sub-component hai.
// Hum multiple strategies try karte hain — jo kaam kare woh chalega.
function patchTimestampRenderer() {

    // Strategy A: Direct timestamp component dhundo
    // Discord mobile mein yeh component MessageTimestamp ya similar name se hota hai
    const directModule =
        findByProps("MessageTimestamp") ??
        findByProps("getMessageTimestampTooltip") ??
        findByDisplayName("MessageTimestamp", false);

    if (directModule) {
        const compKey = directModule.MessageTimestamp
            ? "MessageTimestamp"
            : "default";
        const target = directModule.MessageTimestamp
            ? directModule
            : directModule;

        try {
            patches.push(after(compKey, target, ([props], res) => {
                if (!res) return;
                const msgId =
                    props?.id ??
                    props?.messageId ??
                    props?.message?.id;
                if (!msgId || !customTimeOverrides.has(msgId)) return;
                const override = customTimeOverrides.get(msgId)!;
                replaceTimestampText(res, override);
            }));
            return; // kaam ho gaya
        } catch (_) { /* fallthrough */ }
    }

    // Strategy B: Higher-level message component dhundo aur usme se timestamp
    // text node ko findInReactTree se replace karo
    const messageModule =
        findByProps("cozyMessage", "isSystemMessage") ??
        findByProps("renderCozyMessage") ??
        findByProps("renderAttachments", "isEdited") ??
        findByProps("headerText", "isSystemMessage");

    if (messageModule) {
        const fnKey = Object.keys(messageModule).find(
            k => typeof messageModule[k] === "function"
        );
        if (fnKey) {
            patches.push(after(fnKey, messageModule, ([props], res) => {
                if (!res) return;
                const msgId = props?.message?.id;
                if (!msgId || !customTimeOverrides.has(msgId)) return;
                const override = customTimeOverrides.get(msgId)!;
                replaceTimestampText(res, override);
            }));
            return;
        }
    }

    // Strategy C: Time formatting utility patch — last resort
    // Discord internally calls a format function to convert ISO → "9:34 PM"
    // Hum isko wrap karke apna text inject karte hain
    const fmtModule =
        findByProps("getMessageTimestamp") ??
        findByProps("formatTimestamp", "humanize") ??
        findByProps("calendarFormat");  // moment.js

    if (fmtModule) {
        const fnKey = Object.keys(fmtModule).find(
            k => typeof fmtModule[k] === "function" &&
                 ["getMessageTimestamp", "formatTimestamp", "calendarFormat"].includes(k)
        );
        if (fnKey) {
            patches.push(instead(fnKey, fmtModule, (args, orig) => {
                const result = orig(...args);
                // result ek formatted string hai jaise "9:34 PM"
                // Hum check karte hain koi active message match karta hai
                for (const [msgId, override] of customTimeOverrides) {
                    const msg = MessageStore.getMessages
                        ? null
                        : MessageStore.getMessage?.("", msgId);
                    if (msg && typeof result === "string") {
                        const formatted = formatTimeForEdit(msg.timestamp);
                        if (result === formatted) return override;
                    }
                }
                return result;
            }));
        }
    }
}

// Helper: React tree mein timestamp text dhundo aur replace karo
function replaceTimestampText(tree: any, override: string) {
    // Case 1: <time> element (web-style)
    const timeEl = findInReactTree(tree, x => x?.type === "time");
    if (timeEl?.props) {
        if (typeof timeEl.props.children === "string") {
            timeEl.props.children = override;
        }
        if (timeEl.props["aria-label"]) timeEl.props["aria-label"] = override;
        if (timeEl.props.dateTime !== undefined) timeEl.props.dateTime = override;
        return;
    }

    // Case 2: Text node jisme time pattern ho (jaise "9:34 PM", "21:34")
    const textEl = findInReactTree(tree, x =>
        typeof x?.props?.children === "string" &&
        /^\d{1,2}:\d{2}(\s?(AM|PM))?$/i.test(x.props.children.trim())
    );
    if (textEl?.props) {
        textEl.props.children = override;
        if (textEl.props.accessibilityLabel) {
            textEl.props.accessibilityLabel = override;
        }
        return;
    }

    // Case 3: Generic short text node (timestamp aur kuch nahi hota zyada)
    const shortTextEl = findInReactTree(tree, x =>
        typeof x?.props?.children === "string" &&
        x.props.children.length < 15 &&
        x.props.children.includes(":")
    );
    if (shortTextEl?.props) {
        shortTextEl.props.children = override;
    }
}

export default {
    onLoad() {

        // ── Timestamp renderer patch ─────────────────────────────────────────
        patchTimestampRenderer();

        // ── Message long press → Edit buttons ───────────────────────────────
        patches.push(before("openLazy", LazyActionSheet, ([component, key, msg]) => {
            const message = msg?.message;
            if (key !== "MessageLongPressActionSheet" || !message) return;

            component.then(instance => {
                const unpatch = after("default", instance, (_, res) => {
                    setTimeout(unpatch, 0);

                    const buttons = findInReactTree(
                        res,
                        x => x?.[0]?.type?.name === "ActionSheetRow"
                    );
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
                            formatTimeForEdit(currentMessage.timestamp) // edit box mein current time
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

        // ── editMessage intercept ────────────────────────────────────────────
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
                        // ✅ Custom text store karo (jo user ne likha woh exactly)
                        customTimeOverrides.set(messageId, message.content);

                        const live =
                            MessageStore.getMessage(channelId, messageId) ?? baseMessage;

                        // MESSAGE_UPDATE dispatch karo — original timestamp rakho
                        // (change mat karo warna message corrupt ho sakta hai)
                        // Display override alag patch handle karega
                        FluxDispatcher.dispatch({
                            type: "MESSAGE_UPDATE",
                            message: {
                                ...baseMessage,
                                content: live.content,
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

        // ── Escape / cancel edit detect ──────────────────────────────────────
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
        customTimeOverrides.clear();
        editMode = null;
        activeEditId = null;
        isStartingEdit = false;
    },
};
