import { findByProps, findByStoreName } from "@vendetta/metro";
import { FluxDispatcher } from "@vendetta/metro/common";
import { instead } from "@vendetta/patcher";
import { showToast } from "@vendetta/ui/toasts";

const TAG = "[DoubleTapLocalEdit]";

const MessageStore = findByStoreName("MessageStore");
const Messages = findByProps("sendMessage", "startEditMessage", "editMessage");

// ---------- double-tap detection (from GeasturesPlus) ----------

const DOUBLE_TAP_WINDOW_MS = 300; // time allowed between the two taps that count as "double tap"

let pendingId: string | null = null;
let pendingMessage: any = null;
let pendingChannel: any = null;
let windowTimer: ReturnType<typeof setTimeout> | null = null;

function clearPending() {
    if (windowTimer) clearTimeout(windowTimer);
    windowTimer = null;
    pendingId = null;
    pendingMessage = null;
    pendingChannel = null;
}

// Call this from wherever your tap gesture is detected (e.g. the same hook
// GeasturesPlus used: handleAddDefaultDoubleTapReaction), passing the message
// and channel Discord gives you. Two taps on the SAME message within the
// window = a double tap -> start a local edit.
function onDoubleTap(message: any, channel: any) {
    if (!message) return;
    const id = message.id;

    const isSecondTap = pendingId !== null && pendingId === id;

    if (isSecondTap) {
        clearPending();
        beginLocalEdit(message, channel);
        return;
    }

    if (pendingId !== null) clearPending();
    pendingId = id;
    pendingMessage = message;
    pendingChannel = channel;
    windowTimer = setTimeout(clearPending, DOUBLE_TAP_WINDOW_MS);
}

// ---------- local edit logic (from EditTime) ----------

const edits = new Map<string, any>();
let editMode: "content" | null = null;
let activeEditId: string | null = null;
let isStartingEdit = false;

function beginLocalEdit(message: any, channel: any) {
    const currentMessage = MessageStore?.getMessage?.(channel?.id ?? message.channel_id, message.id) ?? message;
    if (!currentMessage) return;

    editMode = "content";
    activeEditId = currentMessage.id;
    edits.set(currentMessage.id, JSON.parse(JSON.stringify(currentMessage)));

    try {
        isStartingEdit = true;
        Messages.startEditMessage(currentMessage.channel_id, currentMessage.id, currentMessage.content);
    } catch (e) {
        console.error(TAG, "startEditMessage failed", e);
        showToast("Couldn't start local edit.");
        edits.delete(currentMessage.id);
        editMode = null;
        activeEditId = null;
    } finally {
        isStartingEdit = false;
    }
}

const patches: Array<() => void> = [];

export default {
    onLoad() {
        // Hook the same native double-tap signal GeasturesPlus used.
        const exps = findByProps("handleAddDefaultDoubleTapReaction") as any;
        if (typeof exps?.handleAddDefaultDoubleTapReaction === "function") {
            patches.push(
                instead("handleAddDefaultDoubleTapReaction", exps, (args: any[]) => {
                    try {
                        onDoubleTap(args[0], args[1]);
                    } catch (e) {
                        console.error(TAG, "double-tap hook error", e);
                    }
                    return undefined; // suppress the default reaction
                }),
            );
        } else {
            console.error(TAG, "handleAddDefaultDoubleTapReaction not found");
        }

        // Intercept the real editMessage call and, if we're in a local-edit
        // session, rewrite the message locally instead of hitting the API.
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
            }),
        );

        // Clean up edit-mode state if the user backs out of the edit box
        // without sending (e.g. taps the X / presses back).
        patches.push(
            instead("endEditMessage", Messages, (args: any[], orig: (...a: any[]) => any) => {
                const result = orig(...args);
                if (!isStartingEdit && editMode !== null) {
                    editMode = null;
                    activeEditId = null;
                }
                return result;
            }),
        );
    },

    onUnload() {
        for (const p of patches) p();
        patches.length = 0;
        clearPending();
        edits.clear();
        editMode = null;
        activeEditId = null;
        isStartingEdit = false;
    },
};
