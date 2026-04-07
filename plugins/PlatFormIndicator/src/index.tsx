import { patcher } from "@vendetta";
import {
    findByName, findByProps, findByPropsAll,
    findByStoreName, findByTypeNameAll, findByTypeName
} from "@vendetta/metro";
import { General } from "@vendetta/ui/components";
import { findInReactTree } from "@vendetta/utils";
import StatusIcons, { getUserStatuses } from "./StatusIcons";
import { storage } from "@vendetta/plugin";
import Settings from "./settings";
import React from 'react';
import PresenceUpdatedContainer from "./PresenceUpdatedContainer";

const { Text, View } = General;

let unpatches: Array<() => void> = [];

export default {
    onLoad: () => {

        // ── Storage defaults ──
        storage.dmTopBar            ??= true;
        storage.userList            ??= true;
        storage.profileUsername     ??= true;
        storage.removeDefaultMobile ??= true;
        storage.fallbackColors      ??= false;
        storage.oldUserListIcons    ??= false;
        storage.showInChat          ??= false;
        storage.showDesktop         ??= true;
        storage.showMobile          ??= true;
        storage.showWeb             ??= true;
        storage.showEmbedded        ??= true;
        storage.showVR              ??= true;

        // ═══════════════════════════════════════════════════════════════
        // CHAT MESSAGES — platform icon next to author name
        //
        // Approach 1 (BD-inspired): find the message author component
        //   that has `decorations` prop, patch BEFORE render and push
        //   into decorations[1] — same as BetterDiscord's patchChat().
        //
        // Approach 2 (fallback): try common TypeName strings and inject
        //   a <StatusIcons> View next to the author Text node.
        // ═══════════════════════════════════════════════════════════════

        // Approach 1 — decorations-based (BD port)
        (() => {
            try {
                // BD uses: Webpack.getWithKey(byStrings(".guildMemberAvatar&&null!="))
                // For Revenge we search for a module whose exported function
                // accepts a `message` prop that has `author` and `decorations`.
                // Try several findByProps combos — first match wins.
                const candidates = [
                    ...findByPropsAll("message", "decorations", "author"),
                    ...findByPropsAll("decorations", "message"),
                ];

                for (const mod of candidates) {
                    // mod might be the component directly or an object with a key
                    const keys = Object.keys(mod ?? {});
                    for (const key of keys) {
                        try {
                            if (typeof mod[key] !== "function") continue;

                            const unpatch = patcher.before(key, mod, (args) => {
                                try {
                                    if (!storage.showInChat) return;
                                    const mainProps = args?.[0];
                                    if (!mainProps?.message?.author?.id) return;
                                    if (!mainProps?.decorations) return;

                                    const userId: string = mainProps.message.author.id;
                                    const statuses = getUserStatuses(userId);
                                    if (!Object.keys(statuses).length) return;

                                    // Inject into decorations[1] exactly like BD
                                    const target = mainProps.decorations?.[1];
                                    if (!Array.isArray(target)) {
                                        mainProps.decorations[1] = target ? [target] : [];
                                    }
                                    // avoid double-inject
                                    if (mainProps.decorations[1].some((c: any) => c?.key === "PIChat")) return;

                                    mainProps.decorations[1].unshift(
                                        <View
                                            key="PIChat"
                                            style={{ flexDirection: 'row', alignItems: 'center', marginRight: 4 }}>
                                            <PresenceUpdatedContainer>
                                                <StatusIcons userId={userId} size={14} />
                                            </PresenceUpdatedContainer>
                                        </View>
                                    );
                                } catch (_) {}
                            });
                            unpatches.push(unpatch);
                            console.log(`[PI] chat patch (decorations) → key: ${key}`);
                        } catch (_) {}
                    }
                }
            } catch (_) {}
        })();

        // Approach 2 — TypeName fallback
        (() => {
            const chatTypeNames = [
                "Message", "MessageCozy", "MessageCompact",
                "MessageListItem", "ChannelMessage", "MessageContent",
                "ChatMessage", "MessageAuthor", "MessageHeader",
                "MessageAuthorBase", "NativeMessage",
            ];

            const injectViaTree = (args: any, res: any) => {
                try {
                    if (!storage.showInChat) return;
                    const userId: string | undefined =
                        args?.[0]?.message?.author?.id ??
                        args?.[0]?.author?.id;
                    if (!userId) return;

                    const statuses = getUserStatuses(userId);
                    if (!Object.keys(statuses).length) return;

                    // Find semibold author Text node
                    const nameText = findInReactTree(res, (c: any) =>
                        c?.type === Text &&
                        typeof c?.props?.children === "string" &&
                        c.props.children.length > 1 &&
                        (c?.props?.variant?.includes?.("semibold") ||
                         c?.props?.style?.fontWeight === "700" ||
                         c?.props?.style?.fontWeight === "bold")
                    );
                    if (!nameText) return;

                    // Find parent row and inject sibling
                    const parentRow = findInReactTree(res, (c: any) =>
                        Array.isArray(c?.props?.children) &&
                        c.props.children.includes(nameText)
                    );
                    if (!parentRow) return;
                    if (findInReactTree(parentRow, (c: any) => c?.key === "PIChat2")) return;

                    const idx = parentRow.props.children.indexOf(nameText);
                    parentRow.props.children.splice(idx + 1, 0,
                        <View
                            key="PIChat2"
                            style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 4 }}>
                            <StatusIcons userId={userId} size={14} />
                        </View>
                    );
                } catch (_) {}
            };

            chatTypeNames.forEach(name => {
                try {
                    const comp = findByTypeName(name);
                    if (comp) {
                        unpatches.push(patcher.after("type", comp, injectViaTree));
                        console.log(`[PI] chat patch (tree) → TypeName: ${name}`);
                    }
                } catch (_) {}
            });
        })();


        // ═══════════════════════════════════════════════════════════════
        // USER PROFILE ICONS
        // ═══════════════════════════════════════════════════════════════
        try {
            const UserProfileContent = findByTypeName("UserProfileContent");
            if (UserProfileContent) {
                unpatches.push(patcher.after("type", UserProfileContent, (args, res) => {
                    try {
                        const primaryInfo = findInReactTree(res, (c: any) => c?.type?.name === "PrimaryInfo");
                        if (!primaryInfo) return;
                        patcher.after("type", primaryInfo, (_args, pRes) => {
                            try {
                                if (pRes?.type?.name !== "UserProfilePrimaryInfo") return;
                                patcher.after("type", pRes, (_a2, r2) => {
                                    try {
                                        const displayName = findInReactTree(r2, (c: any) => c?.type?.name === "DisplayName");
                                        if (!displayName) return;
                                        patcher.after("type", displayName, (dArgs, dRes) => {
                                            try {
                                                const userId = dArgs?.[0]?.user?.id;
                                                if (!userId) return;
                                                if (findInReactTree(dRes, (c: any) => c?.key === "UserProfilePI")) return;
                                                dRes.props.children.push(
                                                    <PresenceUpdatedContainer key="UserProfilePI">
                                                        <StatusIcons userId={userId} />
                                                    </PresenceUpdatedContainer>
                                                );
                                            } catch (_) {}
                                        });
                                    } catch (_) {}
                                });
                            } catch (_) {}
                        });
                    } catch (_) {}
                }));
            }
        } catch (_) {}

        // ── DisplayName patch (profile) ──
        try {
            const DisplayName = findByProps("DisplayName");
            if (DisplayName) {
                unpatches.push(patcher.after("DisplayName", DisplayName, (args, res) => {
                    try {
                        if (!storage.profileUsername) return;
                        const user = args?.[0]?.user;
                        if (!user?.id || !res) return;
                        res.props?.children?.props?.children?.[0]?.props?.children?.push(
                            <StatusIcons userId={user.id} />
                        );
                    } catch (_) {}
                }));
            }
        } catch (_) {}


        // ═══════════════════════════════════════════════════════════════
        // HIDE DEFAULT MOBILE INDICATOR
        // ═══════════════════════════════════════════════════════════════
        try {
            const Status = findByName("Status", false);
            if (Status) {
                unpatches.push(patcher.before("default", Status, (args) => {
                    try {
                        if (!storage.removeDefaultMobile || !args?.[0]) return;
                        args[0].isMobileOnline = false;
                    } catch (_) {}
                }));
            }
        } catch (_) {}


        // ═══════════════════════════════════════════════════════════════
        // GUILD MEMBER ROW (server member list)
        // ═══════════════════════════════════════════════════════════════
        try {
            const Rows = findByProps("GuildMemberRow");
            if (Rows?.GuildMemberRow) {
                unpatches.push(patcher.after("type", Rows.GuildMemberRow, ([{ user }]: any, res: any) => {
                    try {
                        if (!storage.userList || storage.oldUserListIcons) return;
                        if (findInReactTree(res, (c: any) => c?.key === "GMR-PI")) return;
                        const row = findInReactTree(res, (c: any) => c?.props?.style?.flexDirection === "row");
                        row?.props?.children?.splice(2, 0,
                            <View key="GMR-PI" style={{ flexDirection: 'row' }}>
                                <StatusIcons userId={user.id} />
                            </View>
                        );
                    } catch (_) {}
                }));
            }
        } catch (_) {}


        // ═══════════════════════════════════════════════════════════════
        // USER ROW (tabs v2 member list)
        // ═══════════════════════════════════════════════════════════════
        let patchedAvatar = false;
        const rowPatch = ([{ user }]: any, res: any) => {
            try {
                if (!storage.userList) return;
                if (findInReactTree(res?.props?.label, (c: any) => c?.key === "TV2-PI")) return;
                res.props.label = (
                    <View
                        key="TV2-PI"
                        style={{
                            justifyContent: storage.oldUserListIcons ? "space-between" : "flex-start",
                            flexDirection: "row",
                            alignItems: "center"
                        }}>
                        {res.props.label}
                        <View style={{ flexDirection: 'row' }}>
                            <StatusIcons userId={user.id} />
                        </View>
                    </View>
                );
                if (!patchedAvatar && res.props?.icon?.type) {
                    try {
                        unpatches.push(patcher.before("type", res.props.icon.type, (args) => {
                            if (storage.removeDefaultMobile) args[0].isMobileOnline = false;
                        }));
                        patchedAvatar = true;
                    } catch (_) {}
                }
            } catch (_) {}
        };

        try {
            findByTypeNameAll("UserRow").forEach((UserRow: any) =>
                unpatches.push(patcher.after("type", UserRow, rowPatch))
            );
        } catch (_) {}


        // ═══════════════════════════════════════════════════════════════
        // DM LIST (newest redesign) — icons next to DM name in list
        // ═══════════════════════════════════════════════════════════════
        try {
            const MessagesItemChannelContent = findByTypeName("MessagesItemChannelContent");
            if (MessagesItemChannelContent) {
                unpatches.push(patcher.after("type", MessagesItemChannelContent, (args, res) => {
                    try {
                        if (!storage.dmTopBar) return;
                        const channel = args?.[0]?.channel;
                        if (channel?.recipients?.length !== 1) return;
                        const userId = channel.recipients[0];
                        const textContainer = findInReactTree(res, (m: any) =>
                            m?.props?.children?.[0]?.props?.variant === "redesign/channel-title/semibold"
                        );
                        if (!textContainer) return;
                        if (findInReactTree(textContainer, (c: any) => c?.key === "DMLI-PI")) return;
                        textContainer.props.children.push(
                            <View key="DMLI-PI" style={{ flexDirection: 'row' }}>
                                <StatusIcons userId={userId} />
                            </View>
                        );
                    } catch (_) {}
                }));
            }
        } catch (_) {}

    },

    onUnload: () => {
        unpatches.forEach(u => { try { u(); } catch (_) {} });
    },

    settings: () => <Settings />
};
