import { patcher } from "@vendetta";
import { findByDisplayName, findByName, findByProps, findByPropsAll, findByStoreName, findByTypeNameAll, findByTypeName } from "@vendetta/metro";
import { General } from "@vendetta/ui/components";
import { findInReactTree } from "@vendetta/utils";
import StatusIcons, { getUserStatuses } from "./StatusIcons";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { storage } from "@vendetta/plugin";
import Settings from "./settings";
import React from 'react';
import RerenderContainer from "./RerenderContainer";
import PresenceUpdatedContainer from "./PresenceUpdatedContainer";

const { Text, View } = General;

let unpatches: Array<() => void> = [];

// Platform emoji for the "show in chat" text label
const PLATFORM_EMOJI: Record<string, string> = {
    desktop:  "🖥️",
    mobile:   "📱",
    web:      "🌐",
    embedded: "🎮",
    vr:       "🥽",
};

const MAX_NAME_LENGTH = 20;

function truncateName(name: string): string {
    if (!name || name.length <= MAX_NAME_LENGTH) return name ?? "";
    return name.slice(0, MAX_NAME_LENGTH) + "...";
}

// Returns the first visible platform emoji for a userId, or null
function getFirstPlatformEmoji(userId: string): string | null {
    try {
        const statuses = getUserStatuses(userId);
        for (const platform of Object.keys(statuses)) {
            const storageKey = ({
                desktop: "showDesktop", mobile: "showMobile",
                web: "showWeb", embedded: "showEmbedded", vr: "showVR"
            } as Record<string, string>)[platform];
            if (storageKey && storage[storageKey] === false) continue;
            return PLATFORM_EMOJI[platform] ?? null;
        }
    } catch (e) {}
    return null;
}

export default {
    onLoad: () => {

        // ── Storage defaults ──
        storage.dmTopBar          ??= true;
        storage.userList          ??= true;
        storage.profileUsername   ??= true;
        storage.removeDefaultMobile ??= true;
        storage.fallbackColors    ??= false;
        storage.oldUserListIcons  ??= false;
        storage.showInChat        ??= false;
        storage.showDesktop       ??= true;
        storage.showMobile        ??= true;
        storage.showWeb           ??= true;
        storage.showEmbedded      ??= true;
        storage.showVR            ??= true;

        const debugLabels = false;

        // ─────────────────────────────────────────────────────────────
        // CHAT PATCH — "Show in chat"
        // Strategy: patch the ChatMessage / Message component.
        // We look for a component that receives a `message` prop with
        // an `author` object, then find the username Text and append
        // the platform emoji. Wrapped in try/catch so it can NEVER crash.
        // ─────────────────────────────────────────────────────────────
        const tryPatchChatComponent = (comp: any, label: string) => {
            if (!comp) return;
            try {
                unpatches.push(patcher.after("type", comp, (args, res) => {
                    try {
                        if (!storage.showInChat) return;

                        // Only proceed if this render has a message with an author
                        const props = args?.[0];
                        const userId: string | undefined =
                            props?.message?.author?.id ??
                            props?.author?.id ??
                            props?.userId;
                        if (!userId) return;

                        const emoji = getFirstPlatformEmoji(userId);
                        if (!emoji) return;

                        // Find the Text node that holds the author display name
                        // It's usually variant="text-md/semibold" or similar
                        const nameText = findInReactTree(res, (c: any) =>
                            c?.type === Text &&
                            typeof c?.props?.children === "string" &&
                            c?.props?.children?.length > 0 &&
                            // make sure it's not a timestamp or short system string
                            c?.props?.children?.length > 1
                        );
                        if (!nameText) return;

                        const rawName: string = nameText.props.children;
                        // Avoid double-patching
                        if (rawName.includes("🖥️") || rawName.includes("📱") || rawName.includes("🌐") || rawName.includes("🎮") || rawName.includes("🥽")) return;

                        nameText.props.children = `${truncateName(rawName)} ${emoji}`;
                    } catch (_) {}
                }));
                console.log(`[PlatformIndicators] Chat patch applied via: ${label}`);
            } catch (_) {}
        };

        // Try multiple component names — one of them should exist in the current Discord build
        tryPatchChatComponent(findByTypeName("ChatMessage"),       "ChatMessage");
        tryPatchChatComponent(findByTypeName("MessageAuthorBase"), "MessageAuthorBase");
        tryPatchChatComponent(findByTypeName("MessageAuthor"),     "MessageAuthor");
        tryPatchChatComponent(findByTypeName("UsernameText"),      "UsernameText");
        tryPatchChatComponent(findByTypeName("AuthorText"),        "AuthorText");


        // ─────────────────────────────────────────────────────────────
        // TABS V2 DM HEADER
        // ─────────────────────────────────────────────────────────────
        try {
            unpatches.push(patcher.after("default", findByName("ChannelHeader", false), (args, res) => {
                try {
                    if (!storage.dmTopBar) return;
                    if (!(res.type?.type?.name == "PrivateChannelHeader")) return;

                    patcher.after("type", res.type, (args, res) => {
                        try {
                            if (!res.props?.children?.props?.children) return;
                            const userId = findInReactTree(res, m => m.props?.user?.id)?.props?.user?.id;
                            if (!userId) return;

                            const dmTopBar = res.props?.children;
                            if (!findInReactTree(res, m => m.key == "DMTabsV2Header")) {

                                if (dmTopBar.props?.children?.props?.children[1]) {
                                    if (typeof dmTopBar.props?.children?.props?.children[1]?.type == "function") {
                                        const titleThing = dmTopBar.props?.children?.props?.children[1];
                                        const unpatchTV2HdrV2 = patcher.after("type", titleThing, (args, res) => {
                                            try {
                                                unpatchTV2HdrV2();
                                                if (!findInReactTree(res, (c) => c.key == "DMTabsV2Header-v2")) {
                                                    res.props.children[0].props.children.push(
                                                        <PresenceUpdatedContainer key="DMTabsV2Header-v2">
                                                            {debugLabels ? <Text>DTV2H-v2</Text> : <StatusIcons userId={userId} />}
                                                        </PresenceUpdatedContainer>
                                                    );
                                                }
                                            } catch (_) {}
                                        });
                                    } else {
                                        const arrowId = getAssetIDByName("arrow-right");
                                        const container1 = findInReactTree(dmTopBar, m => m.props?.children[1]?.props?.source == arrowId);
                                        container1?.props?.children?.push(
                                            <View key="DMTabsV2Header" style={{ flexDirection: 'row', justifyContent: 'center', alignContent: 'flex-start' }}>
                                                <View key="DMTabsV2HeaderIcons" style={{ flexDirection: 'row' }} />
                                            </View>
                                        );
                                    }
                                }
                            }

                            const topIcons = findInReactTree(res, m => m.key == "DMTabsV2HeaderIcons");
                            if (topIcons) {
                                topIcons.props.children = <StatusIcons userId={userId} />;
                            }
                        } catch (_) {}
                    });
                } catch (_) {}
            }));
        } catch (_) {}


        // ─────────────────────────────────────────────────────────────
        // USER PROFILE ICONS
        // ─────────────────────────────────────────────────────────────
        try {
            const UserProfileContent = findByTypeName("UserProfileContent");
            unpatches.push(patcher.after("type", UserProfileContent, (args, res) => {
                try {
                    let primaryInfo = findInReactTree(res, (c) => c?.type?.name == "PrimaryInfo");
                    patcher.after("type", primaryInfo, (args, res) => {
                        try {
                            if (res?.type?.name == "UserProfilePrimaryInfo") {
                                patcher.after("type", res, (args, res) => {
                                    try {
                                        let displayName = findInReactTree(res, (c) => c?.type?.name == "DisplayName");
                                        patcher.after("type", displayName, (args, res) => {
                                            try {
                                                let userId = args[0]?.user?.id;
                                                if (userId) {
                                                    res.props.children.push(
                                                        <PresenceUpdatedContainer key="UserProfileIcons">
                                                            <StatusIcons userId={userId} />
                                                        </PresenceUpdatedContainer>
                                                    );
                                                }
                                            } catch (_) {}
                                        });
                                    } catch (_) {}
                                });
                            }
                        } catch (_) {}
                    });
                } catch (_) {}
            }));
        } catch (_) {}


        // ─────────────────────────────────────────────────────────────
        // DISPLAY NAME PATCH (profile)
        // ─────────────────────────────────────────────────────────────
        try {
            const DisplayName = findByProps("DisplayName");
            unpatches.push(patcher.after("DisplayName", DisplayName, (args, res) => {
                try {
                    const user = args[0]?.user;
                    if (!user?.id) return;
                    if (!res) return;
                    if (!storage.profileUsername) return;
                    res.props?.children?.props?.children[0]?.props?.children?.push(<StatusIcons userId={user.id} />);
                } catch (_) {}
            }));
        } catch (_) {}


        // ─────────────────────────────────────────────────────────────
        // HIDE DEFAULT MOBILE INDICATOR
        // ─────────────────────────────────────────────────────────────
        try {
            const Status = findByName("Status", false);
            unpatches.push(patcher.before("default", Status, (args) => {
                try {
                    if (!args?.[0]) return;
                    if (!storage.removeDefaultMobile) return;
                    args[0].isMobileOnline = false;
                } catch (_) {}
            }));
        } catch (_) {}


        // ─────────────────────────────────────────────────────────────
        // GUILD MEMBER ROW (server member list)
        // ─────────────────────────────────────────────────────────────
        try {
            const Rows = findByProps("GuildMemberRow");
            if (Rows?.GuildMemberRow) {
                unpatches.push(patcher.after("type", Rows.GuildMemberRow, ([{ user }], res) => {
                    try {
                        if (!storage.userList) return;
                        if (storage.oldUserListIcons) return;
                        const statusIconsView = findInReactTree(res, (c) => c.key == "GuildMemberRowStatusIconsView");
                        if (!statusIconsView) {
                            const row = findInReactTree(res, (c) => c.props?.style?.flexDirection === "row");
                            row?.props?.children?.splice(2, 0,
                                <View key="GuildMemberRowStatusIconsView" style={{ flexDirection: 'row' }}>
                                    {debugLabels ? <Text>GMRSIV</Text> : <StatusIcons userId={user.id} />}
                                </View>
                            );
                        }
                    } catch (_) {}
                }));
            }
        } catch (_) {}


        // ─────────────────────────────────────────────────────────────
        // USER ROW (tabs v2 member list)
        // ─────────────────────────────────────────────────────────────
        let patchedAvatar = false;
        const rowPatch = ([{ user }]: any, res: any) => {
            try {
                if (!storage.userList) return;
                const modifiedStatusIcons = findInReactTree(res?.props?.label, (c) => c.key == "TabsV2MemberListStatusIconsView");
                if (!modifiedStatusIcons) {
                    res.props.label = (
                        <View
                            style={{ justifyContent: storage.oldUserListIcons ? "space-between" : "flex-start", flexDirection: "row", alignItems: "center" }}
                            key="TabsV2MemberListStatusIconsView">
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
                }
            } catch (_) {}
        };

        try {
            findByTypeNameAll("UserRow").forEach((UserRow) =>
                unpatches.push(patcher.after("type", UserRow, rowPatch))
            );
        } catch (_) {}


        // ─────────────────────────────────────────────────────────────
        // DM LIST (newest redesign)
        // ─────────────────────────────────────────────────────────────
        try {
            const MessagesItemChannelContent = findByTypeName("MessagesItemChannelContent");
            unpatches.push(patcher.after("type", MessagesItemChannelContent, (args, res) => {
                try {
                    const channel = args[0]?.channel;
                    if (channel?.recipients?.length == 1) {
                        const userId = channel.recipients[0];
                        const textContainer = findInReactTree(res, m => m?.props?.children?.[0]?.props?.variant == "redesign/channel-title/semibold");
                        textContainer?.props?.children?.push(
                            <View key="TabsV2RedesignDMListIcons" style={{ flexDirection: 'row' }}>
                                {debugLabels ? <Text>TV2RDMLI</Text> : <StatusIcons userId={userId} />}
                            </View>
                        );
                    }
                } catch (_) {}
            }));
        } catch (_) {}

    },

    onUnload: () => {
        unpatches.forEach(u => { try { u(); } catch (_) {} });
    },

    settings: () => <Settings />
};
