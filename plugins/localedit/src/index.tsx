import {
    findByProps,
    findByStoreName
} from "@vendetta/metro";

import {
    FluxDispatcher,
    i18n
} from "@vendetta/metro/common";

import {
    before,
    after,
    instead
} from "@vendetta/patcher";

import { getAssetIDByName } from "@vendetta/ui/assets";
import { Forms } from "@vendetta/ui/components";
import { findInReactTree } from "@vendetta/utils";


/* ============================================================
   MODULES
   ============================================================ */

const LazyActionSheet =
    findByProps("openLazy", "hideActionSheet");

const ActionSheetRow =
    findByProps("ActionSheetRow")?.ActionSheetRow ??
    Forms.FormRow;

const MessageStore =
    findByStoreName("MessageStore");

const Messages =
    findByProps(
        "sendMessage",
        "startEditMessage",
        "editMessage"
    );

// Same Moment export type used by Force Timestamp Locale
const moment =
    findByProps("isMoment");


/* ============================================================
   STATE
   ============================================================ */

// messageId -> custom text
const customTimeOverrides =
    new Map<string, string>();

// original timestamp milliseconds -> custom text
const overridesByTimestamp =
    new Map<number, string>();

// Original message backups
const edits =
    new Map<string, any>();

let editMode:
    "content" | "time" | null = null;

let activeEditId:
    string | null = null;

let isStartingEdit = false;

const patches:
    Array<() => void> = [];


/* ============================================================
   LOG
   ============================================================ */

function log(...args: any[]) {
    console.log("[EditTime]", ...args);
}


/* ============================================================
   TIME FORMAT FOR EDIT BOX
   ============================================================ */

function formatTimeForEdit(timestamp: any) {
    const d = new Date(
        timestamp ?? Date.now()
    );

    const h = d.getHours();

    const m = String(
        d.getMinutes()
    ).padStart(2, "0");

    const ampm =
        h >= 12 ? "PM" : "AM";

    const h12 =
        h % 12 || 12;

    return `${h12}:${m} ${ampm}`;
}


/* ============================================================
   NORMALIZE TIMESTAMP
   ============================================================ */

function timestampToMs(timestamp: any): number {
    try {
        // Already number
        if (typeof timestamp === "number") {
            return timestamp;
        }

        // Date
        if (timestamp instanceof Date) {
            return timestamp.getTime();
        }

        // Moment-like object
        if (
            timestamp &&
            typeof timestamp.valueOf === "function"
        ) {
            const value = timestamp.valueOf();

            if (typeof value === "number") {
                return value;
            }
        }

        // ISO/string
        return new Date(timestamp).getTime();

    } catch (e) {
        log(
            "timestampToMs failed:",
            timestamp,
            e
        );

        return NaN;
    }
}


/* ============================================================
   MOMENT PATCH
   ============================================================ */

function patchMomentFormatting() {
    log("Trying Moment patch...");

    if (!moment) {
        log("!! Moment module NOT FOUND");
        return;
    }

    log(
        "Moment found:",
        Object.keys(moment)
    );

    /*
     * Different builds can expose the prototype
     * differently.
     */
    const proto =
        moment.fn ??
        moment.prototype;

    if (!proto) {
        log("!! Moment prototype NOT FOUND");
        return;
    }

    log("Moment prototype FOUND");

    const methods = [
        "format",
        "calendar",
        "fromNow"
    ];

    for (const method of methods) {
        const original =
            proto[method];

        if (typeof original !== "function") {
            log(
                `moment.${method} NOT FOUND`
            );

            continue;
        }

        /*
         * IMPORTANT:
         *
         * Direct prototype patch.
         *
         * Every Moment instance shares this method.
         */
        proto[method] =
            function (...args: any[]) {

                let ms: number;

                try {
                    ms = this.valueOf();
                } catch {
                    return original.apply(
                        this,
                        args
                    );
                }

                /*
                 * Exact timestamp match
                 */
                if (
                    overridesByTimestamp.has(ms)
                ) {
                    const override =
                        overridesByTimestamp.get(ms)!;

                    log(
                        `moment.${method} MATCH`,
                        ms,
                        "->",
                        override
                    );

                    return override;
                }

                return original.apply(
                    this,
                    args
                );
            };


        /*
         * Restore original method when plugin unloads
         */
        patches.push(() => {
            proto[method] = original;
        });


        log(
            `moment.${method} PATCHED`
        );
    }
}


/* ============================================================
   PLUGIN
   ============================================================ */

export default {
    onLoad() {
        log("============================");
        log("EDIT TIME PLUGIN LOADED");
        log("============================");

        /*
         * Patch Moment before doing anything else.
         */
        patchMomentFormatting();


        /* ====================================================
           MESSAGE LONG PRESS MENU
           ==================================================== */

        patches.push(
            before(
                "openLazy",
                LazyActionSheet,

                ([
                    component,
                    key,
                    msg
                ]) => {

                    const message =
                        msg?.message;

                    if (
                        key !==
                            "MessageLongPressActionSheet" ||
                        !message
                    ) {
                        return;
                    }


                    component.then(instance => {

                        const unpatch =
                            after(
                                "default",
                                instance,

                                (_, res) => {

                                    setTimeout(
                                        unpatch,
                                        0
                                    );


                                    const buttons =
                                        findInReactTree(
                                            res,
                                            (x: any) =>
                                                x?.[0]
                                                    ?.type
                                                    ?.name ===
                                                "ActionSheetRow"
                                        );


                                    if (!buttons) {
                                        return;
                                    }


                                    const currentMessage =
                                        MessageStore.getMessage(
                                            message.channel_id,
                                            message.id
                                        ) ?? message;


                                    /*
                                     * Don't add buttons twice.
                                     */
                                    if (
                                        buttons.some(
                                            (b: any) =>
                                                b?.props
                                                    ?.label ===
                                                "Edit Locally"
                                        )
                                    ) {
                                        return;
                                    }


                                    const position =
                                        Math.max(
                                            buttons.findIndex(
                                                (x: any) =>
                                                    x?.props
                                                        ?.message ===
                                                    i18n.Messages
                                                        .MARK_UNREAD
                                            ),
                                            0
                                        );


                                    /* ========================
                                       EDIT CONTENT
                                       ======================== */

                                    const handleEditContent =
                                        () => {

                                            editMode =
                                                "content";

                                            activeEditId =
                                                currentMessage.id;


                                            edits.set(
                                                currentMessage.id,

                                                JSON.parse(
                                                    JSON.stringify(
                                                        currentMessage
                                                    )
                                                )
                                            );


                                            LazyActionSheet
                                                .hideActionSheet();


                                            isStartingEdit =
                                                true;


                                            Messages.startEditMessage(
                                                currentMessage.channel_id,
                                                currentMessage.id,
                                                currentMessage.content
                                            );


                                            isStartingEdit =
                                                false;
                                        };


                                    /* ========================
                                       EDIT TIME
                                       ======================== */

                                    const handleEditTime =
                                        () => {

                                            editMode =
                                                "time";

                                            activeEditId =
                                                currentMessage.id;


                                            edits.set(
                                                currentMessage.id,

                                                JSON.parse(
                                                    JSON.stringify(
                                                        currentMessage
                                                    )
                                                )
                                            );


                                            LazyActionSheet
                                                .hideActionSheet();


                                            isStartingEdit =
                                                true;


                                            Messages.startEditMessage(
                                                currentMessage.channel_id,
                                                currentMessage.id,

                                                formatTimeForEdit(
                                                    currentMessage.timestamp
                                                )
                                            );


                                            isStartingEdit =
                                                false;
                                        };


                                    /* ========================
                                       ADD BUTTONS
                                       ======================== */

                                    buttons.splice(
                                        position,
                                        0,

                                        <ActionSheetRow
                                            label="Edit Locally"

                                            icon={
                                                <ActionSheetRow.Icon
                                                    source={
                                                        getAssetIDByName(
                                                            "ic_edit_24px"
                                                        )
                                                    }
                                                />
                                            }

                                            onPress={
                                                handleEditContent
                                            }
                                        />,

                                        <ActionSheetRow
                                            label="Edit Time"

                                            icon={
                                                <ActionSheetRow.Icon
                                                    source={
                                                        getAssetIDByName(
                                                            "ic_clock"
                                                        )
                                                    }
                                                />
                                            }

                                            onPress={
                                                handleEditTime
                                            }
                                        />
                                    );
                                }
                            );
                    });
                }
            )
        );


        /* ====================================================
           INTERCEPT EDIT MESSAGE
           ==================================================== */

        patches.push(
            instead(
                "editMessage",
                Messages,

                (args, orig) => {

                    const [
                        channelId,
                        messageId,
                        message
                    ] = args;


                    /*
                     * Not one of our local edits?
                     *
                     * Let Discord handle normally.
                     */
                    if (
                        editMode === null ||
                        activeEditId !== messageId
                    ) {
                        return orig(...args);
                    }


                    const baseMessage =
                        edits.get(messageId);


                    if (!baseMessage) {
                        return orig(...args);
                    }


                    /* ================================
                       CONTENT EDIT
                       ================================ */

                    if (
                        editMode === "content"
                    ) {

                        FluxDispatcher.dispatch({
                            type:
                                "MESSAGE_UPDATE",

                            message: {
                                ...baseMessage,

                                content:
                                    message.content,

                                edited_timestamp:
                                    null
                            },

                            otherPluginBypass:
                                true
                        });


                        log(
                            "Local content edited:",
                            messageId
                        );


                        editMode = null;
                        activeEditId = null;

                        return;
                    }


                    /* ================================
                       TIME EDIT
                       ================================ */

                    if (
                        editMode === "time"
                    ) {

                        const override =
                            message.content;


                        /*
                         * Get ORIGINAL timestamp.
                         */
                        const originalTimestamp =
                            baseMessage.timestamp;


                        const ms =
                            timestampToMs(
                                originalTimestamp
                            );


                        log(
                            "TIME EDIT SAVE"
                        );

                        log(
                            "Message ID:",
                            messageId
                        );

                        log(
                            "Original timestamp:",
                            originalTimestamp
                        );

                        log(
                            "Timestamp ms:",
                            ms
                        );

                        log(
                            "Override:",
                            override
                        );


                        /*
                         * Store by message ID too.
                         *
                         * Useful for future renderer
                         * approaches.
                         */
                        customTimeOverrides.set(
                            messageId,
                            override
                        );


                        /*
                         * Main Moment override.
                         */
                        if (
                            Number.isFinite(ms)
                        ) {
                            overridesByTimestamp.set(
                                ms,
                                override
                            );

                            log(
                                "Moment override registered:",
                                ms,
                                "->",
                                override
                            );
                        } else {
                            log(
                                "!! INVALID TIMESTAMP MS"
                            );
                        }


                        /*
                         * Get live message.
                         */
                        const live =
                            MessageStore.getMessage(
                                channelId,
                                messageId
                            ) ?? baseMessage;


                        /*
                         * IMPORTANT:
                         *
                         * DO NOT:
                         *
                         * timestamp: override
                         *
                         * Original timestamp remains intact.
                         *
                         * We're only dispatching a fresh
                         * message object to encourage Discord
                         * to render the message again.
                         */
                        FluxDispatcher.dispatch({
                            type:
                                "MESSAGE_UPDATE",

                            message: {
                                ...live,

                                timestamp:
                                    live.timestamp,

                                edited_timestamp:
                                    live.edited_timestamp
                            },

                            otherPluginBypass:
                                true
                        });


                        editMode = null;
                        activeEditId = null;

                        return;
                    }


                    return orig(...args);
                }
            )
        );


        /* ====================================================
           EDIT CANCEL / END
           ==================================================== */

        patches.push(
            after(
                "endEditMessage",
                Messages,

                () => {

                    if (isStartingEdit) {
                        return;
                    }


                    if (
                        editMode !== null
                    ) {

                        log(
                            "Edit cancelled/ended"
                        );

                        editMode = null;
                        activeEditId = null;
                    }
                }
            )
        );
    },


    /* ========================================================
       UNLOAD
       ======================================================== */

    onUnload() {
        log(
            "EDIT TIME PLUGIN UNLOADING"
        );


        /*
         * Includes Moment method restoration.
         */
        for (
            const unpatch of patches
        ) {
            try {
                unpatch();
            } catch (e) {
                log(
                    "Unpatch error:",
                    e
                );
            }
        }


        patches.length = 0;

        edits.clear();

        customTimeOverrides.clear();

        overridesByTimestamp.clear();


        editMode = null;

        activeEditId = null;

        isStartingEdit = false;


        log(
            "EDIT TIME PLUGIN UNLOADED"
        );
    }
};
