import { findByProps, findByStoreName } from "@vendetta/metro";
import { FluxDispatcher } from "@vendetta/metro/common";
import { instead } from "@vendetta/patcher";
import { showToast } from "@vendetta/ui/toasts";

const TAG = "[DoubleTapLocalEdit]";

const MessageStore = findByStoreName("MessageStore");
const Messages = findByProps("sendMessage", "startEditMessage", "editMessage");

// ---------------------------------------------------------------------
// enable(): from GeasturesPlus. Forces Discord's native double-tap-to-react
// setting ON so that handleAddDefaultDoubleTapReaction actually fires on
// every double-tap. Without this, the hook below never gets called.
// ---------------------------------------------------------------------
let reactLatched = false;
function enable() {
    try {
        if (reactLatched) return;
        const DTR = findByProps("DoubleTapReactionEmoji")?.DoubleTapReactionEmoji;
        if (!DTR?.updateSetting) return;
        const s = DTR?.getSetting?.();
        DTR.updateSetting({
            disableDoubleTap: false,
            emojiId: s?.emojiId ?? null,
            emojiName: s?.emojiName ?? null,
            animated: s?.animated ?? null,
        });
        reactLatched = true;
    } catch (e) {
        console.error(TAG, "enable error", e);
    }
}

// ---------------------------------------------------------------------
// Double-tap detection: exact logic from the detection.ts you provided,
// minus the triple-tap-delete and reply branches (not needed here).
// Two taps on the SAME message id within DOUBLE_TAP_WINDOW_MS = a double
// tap -> start a local edit.
// ---------------------------------------------------------------------
const DOUBLE_TAP_WINDOW_MS = 300;

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

function resetDetection() {
    clearPending();
}

// ---------------------------------------------------------------------
// Local edit logic: exact logic from the EditTime plugin you provided
// (applyLocalEdit / editMessage instead-patch / endEditMessage cleanup),
// just triggered by double-tap instead of a long-press menu button.
// Works on ANY message, own or not.
// ---------------------------------------------------------------------
const edits = new Map<string, any>();
let editMode: "content" | null = null;
let activeEditId: string | null = null;
let isStartingEdit = false;

function beginLocalEdit(message: any, channel: any) {
    const channelId = channel?.id ?? message.channel_id;
    const currentMessage = MessageStore?.getMessage?.(channelId, message.id) ?? message;
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

const patches: (() => void)[] = [];
let retryTimer: ReturnType<typeof setInterval> | undefined;

function tryPatchReaction(): boolean {
    const exps = findByProps("handleAddDefaultDoubleTapReaction") as any;
    if (typeof exps?.handleAddDefaultDoubleTapReaction !== "function") return false;

    patches.push(
        instead("handleAddDefaultDoubleTapReaction", exps, (args: any[]) => {
            try {
                onDoubleTap(args[0], args[1]);
            } catch (e) {
                console.error(TAG, "double-tap hook error", e);
            }
            return undefined; // suppress the default reaction so it never fires
        }),
    );
    return true;
}

export default {
    onLoad() {
        enable();
        const patched = tryPatchReaction();

        // Retry until both the setting-enable and the hook attach succeed
        // (modules can load slightly after plugin onLoad on some clients).
        if (!patched || !reactLatched) {
            retryTimer = setInterval(() => {
                enable();
                if (!patches.length) tryPatchReaction();
                if (reactLatched && patches.length) {
                    if (retryTimer) clearInterval(retryTimer);
                    retryTimer = undefined;
                }
            }, 1000);
        }

        // Intercept the real editMessage call and, if we're in a local-edit
        // session, rewrite the message locally (MESSAGE_UPDATE dispatch)
        // instead of sending a real edit to Discord's API.
        patches.push(
            instead("editMessage", Messages, (args: any[], orig: (...a: any[]) => any) => {
                const [, messageId, message] = args;

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

        // If the user backs out of the edit box without sending, clear
        // edit-mode state so a stray editMessage call later doesn't misfire.
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
        if (retryTimer) clearInterval(retryTimer);
        retryTimer = undefined;
        for (const p of patches) p();
        patches.length = 0;
        resetDetection();
        edits.clear();
        editMode = null;
        activeEditId = null;
        isStartingEdit = false;
    },
};
