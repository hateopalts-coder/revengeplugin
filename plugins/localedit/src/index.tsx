import { findByProps } from "@vendetta/metro";
import { instead } from "@vendetta/patcher";
import { showToast } from "@vendetta/ui/toasts";

const TAG = "[DoubleTapTest]";

// Force Discord's native double-tap-to-react setting ON so that
// handleAddDefaultDoubleTapReaction actually fires on every double-tap.
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

const patches: (() => void)[] = [];
let retryTimer: ReturnType<typeof setInterval> | undefined;

function tryPatchReaction(): boolean {
    const exps = findByProps("handleAddDefaultDoubleTapReaction") as any;
    if (typeof exps?.handleAddDefaultDoubleTapReaction !== "function") return false;

    patches.push(
        instead("handleAddDefaultDoubleTapReaction", exps, (args: any[]) => {
            // TEST ONLY: prove the hook fires. Replace this with real logic
            // once you confirm the toast shows up on double-tap.
            showToast("Double tap hook fired!");
            console.log(TAG, "HOOK FIRED, message id:", args?.[0]?.id);
            return undefined; // suppress the default reaction
        }),
    );
    return true;
}

export default {
    onLoad() {
        enable();
        const patched = tryPatchReaction();

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
    },

    onUnload() {
        if (retryTimer) clearInterval(retryTimer);
        retryTimer = undefined;
        for (const p of patches) p();
        patches.length = 0;
    },
};
