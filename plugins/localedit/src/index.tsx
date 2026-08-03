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

// messageId → custom text jo user ne likha
const customTimeOverrides = new Map();

const edits = new Map();
let editMode = null;
let activeEditId = null;
let isStartingEdit = false;

const patches = [];

function log(...args) {
console.log("[EditTime]", ...args);
}

function formatTimeForEdit(timestamp) {
const d = new Date(timestamp ?? Date.now());
const h = d.getHours();
const m = String(d.getMinutes()).padStart(2, "0");
const ampm = h >= 12 ? "PM" : "AM";
const h12 = h % 12 || 12;
return ${h12}:${m} ${ampm};
}

// ── Helper: React tree mein timestamp text dhundo aur replace karo ───────────
function replaceTimestampText(tree, override) {
const timeEl = findInReactTree(tree, x => x?.type === "time");
if (timeEl?.props) {
if (typeof timeEl.props.children === "string") timeEl.props.children = override;
if (timeEl.props["aria-label"]) timeEl.props["aria-label"] = override;
if (timeEl.props.dateTime !== undefined) timeEl.props.dateTime = override;
log("Replaced via <time> element");
return true;
}

const textEl = findInReactTree(tree, x =>  
    typeof x?.props?.children === "string" &&  
    /^\d{1,2}:\d{2}(\s?(AM|PM))?$/i.test(x.props.children.trim())  
);  
if (textEl?.props) {  
    textEl.props.children = override;  
    if (textEl.props.accessibilityLabel) textEl.props.accessibilityLabel = override;  
    log("Replaced via regex-matched text node");  
    return true;  
}  

const shortTextEl = findInReactTree(tree, x =>  
    typeof x?.props?.children === "string" &&  
    x.props.children.length < 15 &&  
    x.props.children.includes(":")  
);  
if (shortTextEl?.props) {  
    shortTextEl.props.children = override;  
    log("Replaced via generic short text node");  
    return true;  
}  

log("!! No timestamp node found in tree to replace");  
return false;

}

// ── Strategy dhundo aur debug karo ────────────────────────────────────────────
function patchTimestampRenderer() {
const directModule =
findByProps("MessageTimestamp") ??
findByProps("getMessageTimestampTooltip") ??
findByDisplayName("MessageTimestamp", false);

log("Strategy A directModule:", directModule ? Object.keys(directModule) : null);  

if (directModule) {  
    const compKey = directModule.MessageTimestamp ? "MessageTimestamp" : "default";  
    if (typeof directModule[compKey] === "function") {  
        try {  
            patches.push(after(compKey, directModule, ([props], res) => {  
                if (!res) return;  
                const msgId = props?.id ?? props?.messageId ?? props?.message?.id;  
                if (!msgId) return;  
                log("Strategy A fired for msgId:", msgId, "hasOverride:", customTimeOverrides.has(msgId));  
                if (!customTimeOverrides.has(msgId)) return;  
                replaceTimestampText(res, customTimeOverrides.get(msgId));  
            }));  
            log("Strategy A patch attached");  
        } catch (e) {  
            log("Strategy A failed:", e);  
        }  
    }  
}  

const messageModule =  
    findByProps("cozyMessage", "isSystemMessage") ??  
    findByProps("renderCozyMessage") ??  
    findByProps("renderAttachments", "isEdited") ??  
    findByProps("headerText", "isSystemMessage");  

log("Strategy B messageModule:", messageModule ? Object.keys(messageModule) : null);  

if (messageModule) {  
    const fnKey = Object.keys(messageModule).find(k => typeof messageModule[k] === "function");  
    if (fnKey) {  
        try {  
            patches.push(after(fnKey, messageModule, ([props], res) => {  
                if (!res) return;  
                const msgId = props?.message?.id;  
                if (!msgId) return;  
                log("Strategy B fired for msgId:", msgId, "hasOverride:", customTimeOverrides.has(msgId));  
                if (!customTimeOverrides.has(msgId)) return;  
                replaceTimestampText(res, customTimeOverrides.get(msgId));  
            }));  
            log("Strategy B patch attached on key:", fnKey);  
        } catch (e) {  
            log("Strategy B failed:", e);  
        }  
    }  
}  

const fmtModule =  
    findByProps("getMessageTimestamp") ??  
    findByProps("formatTimestamp", "humanize") ??  
    findByProps("calendarFormat");  

log("Strategy C fmtModule:", fmtModule ? Object.keys(fmtModule) : null);  

if (fmtModule) {  
    const fnKey = Object.keys(fmtModule).find(k =>  
        typeof fmtModule[k] === "function" &&  
        ["getMessageTimestamp", "formatTimestamp", "calendarFormat"].includes(k)  
    );  
    if (fnKey) {  
        try {  
            patches.push(instead(fnKey, fmtModule, (args, orig) => {  
                const result = orig(...args);  
                for (const [msgId, override] of customTimeOverrides) {  
                    const msg = MessageStore.getMessage?.("", msgId);  
                    if (msg && typeof result === "string") {  
                        const formatted = formatTimeForEdit(msg.timestamp);  
                        if (result === formatted) {  
                            log("Strategy C matched and overrode:", result, "->", override);  
                            return override;  
                        }  
                    }  
                }  
                return result;  
            }));  
            log("Strategy C patch attached on key:", fnKey);  
        } catch (e) {  
            log("Strategy C failed:", e);  
        }  
    }  
}

}

export default {
onLoad() {
patchTimestampRenderer();

patches.push(before("openLazy", LazyActionSheet, ([component, key, msg]) => {  
        const message = msg?.message;  
        if (key !== "MessageLongPressActionSheet" || !message) return;  

        component.then(instance => {  
            const unpatch = after("default", instance, (_, res) => {  
                setTimeout(unpatch, 0);  

                const buttons = findInReactTree(res, x => x?.[0]?.type?.name === "ActionSheetRow");  
                if (!buttons) return;  

                const currentMessage = MessageStore.getMessage(message.channel_id, message.id) ?? message;  
                if (buttons.some(b => b?.props?.label === "Edit Locally")) return;  

                const position = Math.max(  
                    buttons.findIndex(x => x?.props?.message === i18n.Messages.MARK_UNREAD),  
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
                        message: { ...baseMessage, content: message.content, edited_timestamp: null },  
                        otherPluginBypass: true,  
                    });  
                    editMode = null;  
                    activeEditId = null;  
                    return;  
                }  

                if (editMode === "time") {  
                    customTimeOverrides.set(messageId, message.content);  
                    log("Time override set:", messageId, "->", message.content);  

                    const live = MessageStore.getMessage(channelId, messageId) ?? baseMessage;  

                    // PRIMARY FIX: timestamp field ko hi custom text bana do.  
                    // Renderer patch (Strategy A/B/C) bhi saath mein chalega agar mila.  
                    FluxDispatcher.dispatch({  
                        type: "MESSAGE_UPDATE",  
                        message: {  
                            ...baseMessage,  
                            content: live.content,  
                            edited_timestamp: null,  
                            timestamp: message.content, // 👈 direct override, string ban jayega  
                        },  
                        otherPluginBypass: true,  
                    });  

                    // FORCE re-render trigger — kai components sirf message object  
                    // reference change pe re-render karte hain  
                    setTimeout(() => {  
                        FluxDispatcher.dispatch({  
                            type: "MESSAGE_UPDATE",  
                            message: {  
                                ...baseMessage,  
                                content: live.content,  
                                edited_timestamp: null,  
                                timestamp: message.content,  
                            },  
                            otherPluginBypass: true,  
                        });  
                    }, 50);  

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
    customTimeOverrides.clear();  
    editMode = null;  
    activeEditId = null;  
    isStartingEdit = false;  
},

};
