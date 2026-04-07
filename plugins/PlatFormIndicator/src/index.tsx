import { patcher } from "@vendetta";
import { findByName, findByProps, findByStoreName, findByTypeNameAll, findByTypeName } from "@vendetta/metro";
import { General } from "@vendetta/ui/components";
import { findInReactTree } from "@vendetta/utils";
import StatusIcons, { getUserStatuses } from "./StatusIcons";
import { getAssetIDByName } from "@vendetta/ui/assets";
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

        const debugLabels = false;


        // ═══════════════════════════════════════════════════════════════
        // DM TOP BAR  (PrivateChannelHeader — naam ke bagal icons)
        // FIX: guard so we only patch res.type ONCE, not on every re-render
        // ═══════════════════════════════════════════════════════════════
        let patchedPrivateChannelHeader = false;

        try {
            unpatches.push(patcher.after("default", findByName("ChannelHeader", false), (args, res) => {
                try {
                    if (!storage.dmTopBar) return;
                    if (res?.type?.type?.name !== "PrivateChannelHeader") return;

                    // ── KEY CRASH FIX: only add this inner patch ONCE ──
                    if (patchedPrivateChannelHeader) return;
                    patchedPrivateChannelHeader = true;

                    unpatches.push(patcher.after("type", res.type, (args, res) => {
                        try {
                            if (!res?.props?.children?.props?.children) return;

                            const userId = findInReactTree(res, m => m?.props?.user?.id)?.props?.user?.id;
                            if (!userId) return;

                            const dmTopBar = res.props?.children;

                            if (findInReactTree(res, m => m.key === "DMTabsV2Header")) return; // already injected

                            const child1 = dmTopBar?.props?.children?.props?.children?.[1];
                            if (!child1) return;

                            if (typeof child1.type === "function") {
                                // v2 path — patch titleThing once then self-unpatch
                                let patchedTitleThing = false;
                                const titleThing = child1;
                                const unpatchTitle = patcher.after("type", titleThing, (args, res) => {
                                    try {
                                        if (patchedTitleThing) { unpatchTitle(); return; }
                                        patchedTitleThing = true;
                                        unpatchTitle();
                                        const children = res?.props?.children?.[0]?.props?.children;
                                        if (Array.isArray(children) && !findInReactTree(res, c => c?.key === "DMTabsV2Header-v2")) {
                                            children.push(
                                                <PresenceUpdatedContainer key="DMTabsV2Header-v2">
                                                    <StatusIcons userId={userId} />
                                                </PresenceUpdatedContainer>
                                            );
                                        }
                                    } catch (_) {}
                                });
                            } else {
                                // v1 path
                                const arrowId = getAssetIDByName("arrow-right");
                                const container1 = findInReactTree(dmTopBar, m => m?.props?.children?.[1]?.props?.source === arrowId);
                                if (container1 && !findInReactTree(res, m => m?.key === "DMTabsV2Header")) {
                                    container1.props?.children?.push(
                                        <View key="DMTabsV2Header" style={{ flexDirection: 'row', justifyContent: 'center', alignContent: 'flex-start' }}>
                                            <View key="DMTabsV2HeaderIcons" style={{ flexDirection: 'row' }} />
                                        </View>
                                    );
                                }
                            }

                            const topIcons = findInReactTree(res, m => m?.key === "DMTabsV2HeaderIcons");
                            if (topIcons) topIcons.props.children = <StatusIcons userId={userId} />;

                        } catch (_) {}
                    }));
                } catch (_) {}
            }));
        } catch (_) {}


        // ═══════════════════════════════════════════════════════════════
        // CHAT MESSAGES — platform icon next to author name
        // Strategy: inject a <StatusIcons> View AFTER the username Text.
        // We use a View wrapper, NOT text mutation → no crash risk.
        // Tries the same component-discovery pattern as the DM list patch.
        // ═══════════════════════════════════════════════════════════════
        const injectChatIcons = (args: any, res: any) => {
            try {
                if (!storage.showInChat) return;

                // Pull userId from wherever this component stores it
                const userId: string | undefined =
                    args?.[0]?.message?.author?.id ??
                    args?.[0]?.author?.id ??
                    args?.[0]?.userId;
                if (!userId) return;

                // Find the author name Text — it's typically semibold
                const nameText = findInReactTree(res, (c: any) =>
                    c?.type === Text &&
                    (c?.props?.variant?.includes?.("semibold") || c?.props?.style?.fontWeight === "700" || c?.props?.style?.fontWeight === "bold") &&
                    typeof c?.props?.children === "string" &&
                    (c?.props?.children as string).length > 0
                );
                if (!nameText) return;

                // Find nameText's parent View and inject StatusIcons as sibling
                const parentRow = findInReactTree(res, (c: any) =>
                    Array.isArray(c?.props?.children) &&
                    c.props.children.includes(nameText)
                );
                if (!parentRow) return;

                // Avoid double-injection
                if (findInReactTree(parentRow, (c: any) => c?.key === "ChatMsgPlatformIcons")) return;

                const nameIndex = parentRow.props.children.indexOf(nameText);
                parentRow.props.children.splice(nameIndex + 1, 0,
                    <View
                        key="ChatMsgPlatformIcons"
                        style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 4 }}>
                        <PresenceUpdatedContainer>
                            <StatusIcons userId={userId} size={12} />
                        </PresenceUpdatedContainer>
                    </View>
                );
            } catch (_) {}
        };

        // Try every plausible chat message component name
        const chatTypeNames = [
            "ChatMessage",
            "MessageContent",
            "Message",
            "BaseMessage",
            "MessageAuthor",
            "MessageAuthorBase",
            "NativeMessage",
        ];
        chatTypeNames.forEach(name => {
            try {
                const comp = findByTypeName(name);
                if (comp) {
                    unpatches.push(patcher.after("type", comp, injectChatIcons));
                    console.log(`[PlatformIndicators] chat patch: found ${name}`);
                }
            } catch (_) {}
        });


        // ═══════════════════════════════════════════════════════════════
        // DM LIST (newest redesign)
        // ═══════════════════════════════════════════════════════════════
        try {
            const MessagesItemChannelContent = findByTypeName("MessagesItemChannelContent");
            if (MessagesItemChannelContent) {
                unpatches.push(patcher.after("type", MessagesItemChannelContent, (args, res) => {
                    try {
                        const channel = args?.[0]?.channel;
                        if (channel?.recipients?.length !== 1) return;
                        const userId = channel.recipients[0];
                        const textContainer = findInReactTree(res, m => m?.props?.children?.[0]?.props?.variant === "redesign/channel-title/semibold");
                        if (textContainer && !findInReactTree(textContainer, c => c?.key === "TV2RDMLIcons")) {
                            textContainer.props.children.push(
                                <View key="TV2RDMLIcons" style={{ flexDirection: 'row' }}>
                                    <StatusIcons userId={userId} />
                                </View>
                            );
                        }
                    } catch (_) {}
                }));
            }
        } catch (_) {}


        // ═══════════════════════════════════════════════════════════════
        // USER PROFILE ICONS
        // ═══════════════════════════════════════════════════════════════
        try {
            const UserProfileContent = findByTypeName("UserProfileContent");
            if (UserProfileContent) {
                unpatches.push(patcher.after("type", UserProfileContent, (args, res) => {
                    try {
                        const primaryInfo = findInReactTree(res, c => c?.type?.name === "PrimaryInfo");
                        patcher.after("type", primaryInfo, (args, res) => {
                            try {
                                if (res?.type?.name !== "UserProfilePrimaryInfo") return;
                                patcher.after("type", res, (args, res) => {
                                    try {
                                        const displayName = findInReactTree(res, c => c?.type?.name === "DisplayName");
                                        patcher.after("type", displayName, (args, res) => {
                                            try {
                                                const userId = args?.[0]?.user?.id;
                                                if (!userId) return;
                                                if (findInReactTree(res, c => c?.key === "UserProfileIcons")) return;
                                                res.props.children.push(
                                                    <PresenceUpdatedContainer key="UserProfileIcons">
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


        // ═══════════════════════════════════════════════════════════════
        // DISPLAY NAME (profile header)
        // ═══════════════════════════════════════════════════════════════
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
        // GUILD MEMBER ROW
        // ═══════════════════════════════════════════════════════════════
        try {
            const Rows = findByProps("GuildMemberRow");
            if (Rows?.GuildMemberRow) {
                unpatches.push(patcher.after("type", Rows.GuildMemberRow, ([{ user }], res) => {
                    try {
                        if (!storage.userList || storage.oldUserListIcons) return;
                        if (findInReactTree(res, c => c?.key === "GuildMemberRowStatusIconsView")) return;
                        const row = findInReactTree(res, c => c?.props?.style?.flexDirection === "row");
                        row?.props?.children?.splice(2, 0,
                            <View key="GuildMemberRowStatusIconsView" style={{ flexDirection: 'row' }}>
                                {debugLabels ? <Text>GMRSIV</Text> : <StatusIcons userId={user.id} />}
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
                if (findInReactTree(res?.props?.label, c => c?.key === "TabsV2MemberListStatusIconsView")) return;
                res.props.label = (
                    <View
                        key="TabsV2MemberListStatusIconsView"
                        style={{ justifyContent: storage.oldUserListIcons ? "space-between" : "flex-start", flexDirection: "row", alignItems: "center" }}>
                        {res.props.label}
                        <View key="TabsV2MemberListStatusIconsView" style={{ flexDirection: 'row' }}>
                            {debugLabels ? <Text>TV2MLSIV</Text> : <StatusIcons userId={user.id} />}
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
            findByTypeNameAll("UserRow").forEach(UserRow =>
                unpatches.push(patcher.after("type", UserRow, rowPatch))
            );
        } catch (_) {}

    },

    onUnload: () => {
        unpatches.forEach(u => { try { u(); } catch (_) {} });
    },

    settings: () => <Settings />
};
