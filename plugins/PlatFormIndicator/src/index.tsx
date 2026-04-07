import { patcher } from "@vendetta";
import { findByDisplayName, findByName, findByProps, findByPropsAll, findByStoreName, findByTypeNameAll, findByTypeName } from "@vendetta/metro";
import {General} from "@vendetta/ui/components"
import { findInReactTree } from "@vendetta/utils";
import StatusIcons from "./StatusIcons";
import { getAssetByName, getAssetIDByName } from "@vendetta/ui/assets";
import { storage } from "@vendetta/plugin";
import Settings from "./settings";
import React, { useState, useEffect } from 'react';
import RerenderContainer from "./RerenderContainer";
import PresenceUpdatedContainer from "./PresenceUpdatedContainer";
const {Text,View } = General;

let unpatches = [];

// Platform label shown in chat next to username
const PLATFORM_LABELS: Record<string, string> = {
    desktop:  "🖥️",
    mobile:   "📱",
    web:      "🌐",
    embedded: "🎮",
    vr:       "🥽",
};

// Max display-name length before truncating (chars before "...")
const MAX_NAME_LENGTH = 20;

function truncateName(name: string): string {
    if (!name) return "";
    if (name.length <= MAX_NAME_LENGTH) return name;
    return name.slice(0, MAX_NAME_LENGTH) + "...";
}

export default {
    onLoad: () => {

        storage.dmTopBar          ??= true
        storage.userList          ??= true
        storage.profileUsername   ??= true
        storage.removeDefaultMobile ??= true
        storage.fallbackColors    ??= false
        storage.oldUserListIcons  ??= false
        storage.showInChat        ??= false

        // Per-platform defaults
        storage.showDesktop  ??= true
        storage.showMobile   ??= true
        storage.showWeb      ??= true
        storage.showEmbedded ??= true
        storage.showVR       ??= true

        const debugLabels = false

        //spagetti code ahead
        //i'm sorry for whoever has to interpret this


        const PresenceStore = findByStoreName("PresenceStore");
        const SessionsStore = findByStoreName("SessionsStore");
        const UserStore     = findByStoreName("UserStore");

        // ─────────────────────────────────────────────
        // Helper: get first active platform for a user
        // ─────────────────────────────────────────────
        function getFirstPlatformLabel(userId: string): string | null {
            let statuses: Record<string, string> | undefined;
            try {
                const currentUserId = UserStore.getCurrentUser()?.id;
                if (userId === currentUserId) {
                    statuses = Object.values(SessionsStore.getSessions()).reduce((acc: any, curr: any) => {
                        if (curr.clientInfo.client !== "unknown")
                            acc[curr.clientInfo.client] = curr.status;
                        return acc;
                    }, {});
                } else {
                    statuses = PresenceStore.getState()?.clientStatuses?.[userId];
                }
            } catch(e) {
                return null;
            }
            if (!statuses) return null;
            for (const platform of Object.keys(statuses)) {
                // respect per-platform toggles
                const storageKey = ({
                    desktop: "showDesktop", mobile: "showMobile",
                    web: "showWeb", embedded: "showEmbedded", vr: "showVR"
                } as any)[platform];
                if (storageKey && storage[storageKey] === false) continue;
                return PLATFORM_LABELS[platform] ?? null;
            }
            return null;
        }


        // ─────────────────────────────────────────────
        // Show-in-chat patch: patch message author name
        // ─────────────────────────────────────────────
        const MessageComponent = findByTypeName("MessageAuthor") ?? findByTypeName("MessageUsername");
        if (MessageComponent) {
            unpatches.push(patcher.after("type", MessageComponent, (args, res) => {
                if (!storage.showInChat) return;

                const userId = args[0]?.message?.author?.id ?? args[0]?.author?.id;
                if (!userId) return;

                const platformLabel = getFirstPlatformLabel(userId);
                if (!platformLabel) return;

                // Find the Text node that holds the username
                const nameNode = findInReactTree(res, (c) =>
                    c?.type === Text && typeof c?.props?.children === "string"
                );
                if (!nameNode) return;

                const rawName: string = nameNode.props.children ?? "";
                const displayName = truncateName(rawName);

                nameNode.props.children = `${displayName} ${platformLabel}`;
            }));
        }

        // Fallback: try patching the lower-level username text via UsernameText / NativeUsername
        const UsernameText = findByTypeName("UsernameText") ?? findByTypeName("NativeUsername");
        if (UsernameText) {
            unpatches.push(patcher.after("type", UsernameText, (args, res) => {
                if (!storage.showInChat) return;

                const userId = args[0]?.message?.author?.id ?? args[0]?.userId ?? args[0]?.user?.id;
                if (!userId) return;

                const platformLabel = getFirstPlatformLabel(userId);
                if (!platformLabel) return;

                const nameNode = findInReactTree(res, (c) =>
                    c?.type === Text && typeof c?.props?.children === "string"
                );
                if (!nameNode) return;

                const rawName: string = nameNode.props.children ?? "";
                const displayName = truncateName(rawName);

                nameNode.props.children = `${displayName} ${platformLabel}`;
            }));
        }


        //tabs v2 dm header
        unpatches.push(patcher.after("default",findByName("ChannelHeader",false),(args,res) => {

            if(!storage.dmTopBar) return;
            if(!(res.type?.type?.name == "PrivateChannelHeader")) return;

            patcher.after("type",res.type,(args,res) => {
                if(!res.props?.children?.props?.children) return;
                const userId = findInReactTree(res,m => m.props?.user?.id)?.props?.user?.id
                if(!userId) return;
                
                const dmTopBar = res.props?.children
                if(!findInReactTree(res,m => m.key == "DMTabsV2Header")){
                    
                    if(dmTopBar.props?.children?.props?.children[1]){
                        if(typeof dmTopBar.props?.children?.props?.children[1]?.type == "function"){

                            const titleThing = dmTopBar.props?.children?.props?.children[1]    

                            const unpatchTV2HdrV2 = patcher.after("type",titleThing, (args,res)=>{
                                unpatchTV2HdrV2()
                                if(!findInReactTree(res, (c) => c.key == "DMTabsV2Header-v2")){
                                    res.props.children[0].props.children.push(
                                        <PresenceUpdatedContainer key="DMTabsV2Header-v2">
                                            {debugLabels ? <Text>DTV2H-v2</Text> : <StatusIcons userId={userId}/>}
                                        </PresenceUpdatedContainer>
                                    )
                                }
                            })

                        } else {

                            const arrowId = getAssetIDByName("arrow-right");
                            const container1 = findInReactTree(dmTopBar, m => m.props?.children[1]?.props?.source == arrowId)

                            container1.props?.children?.push(<View 
                                key="DMTabsV2Header"    
                                style={{
                                flexDirection: 'row',
                                justifyContent: 'center',
                                alignContent: 'flex-start'
                            }}>
                                <View 
                                    key="DMTabsV2HeaderIcons"
                                    style={{
                                        flexDirection: 'row'
                                    }}></View>
                            </View>)
                        }
                    }

                }
                const topIcons = findInReactTree(res,m => m.key == "DMTabsV2HeaderIcons")
                if(topIcons){
                    topIcons.props.children = <StatusIcons userId={userId}/>
                }
                

            })
        }));


        const UserProfileContent = findByTypeName("UserProfileContent");

        unpatches.push(patcher.after("type", UserProfileContent, (args, res) => {
            let primaryInfo = findInReactTree(res, (c) => c?.type?.name == "PrimaryInfo")
            patcher.after("type",primaryInfo, (args,res)=>{
                if(res?.type?.name == "UserProfilePrimaryInfo"){
                    patcher.after("type", res, (args,res)=>{
                        let displayName = findInReactTree(res, (c) => c?.type?.name == "DisplayName")
                        
                            patcher.after("type", displayName, (args,res)=>{
                                let userId = args[0]?.user?.id
                                if(userId){
                                    res.props.children.push(
                                        <PresenceUpdatedContainer key="UserProfileIcons">
                                            <StatusIcons userId={userId}/>
                                        </PresenceUpdatedContainer>
                                    )
                                }
                            })
                    })
                }
            })
        }))
        

        const DisplayName = findByProps("DisplayName");
        unpatches.push(patcher.after("DisplayName", DisplayName, (args, res) => {
            console.log("DISPLAYNAME",args,res)
            window.dn1 = args
            window.dn2 = res
            const user = args[0]?.user;
            if (user === undefined) return;
            if(!res) return;
            if(!user.id) return;
            if(!storage.profileUsername)return;
            res.props?.children?.props?.children[0]?.props?.children?.push(<StatusIcons userId={user.id}/>)
        }));

        const Status = findByName("Status", false);
        unpatches.push(patcher.before("default", Status, (args) => {
            if(!args) return;
            if(!args[0]) return;
            if(!storage.removeDefaultMobile)return;
            args[0].isMobileOnline = false
        }))

        const Rows = findByProps("GuildMemberRow")
        if(Rows?.GuildMemberRow){
            unpatches.push(patcher.after("type", Rows.GuildMemberRow, ([{ user }], res) => {
                if(!storage.userList) return;
                if(storage.oldUserListIcons) return;
                const statusIconsView = findInReactTree(res, (c) => c.key == "GuildMemberRowStatusIconsView");
                if(!statusIconsView){
                    const row = findInReactTree(res, (c) => c.props.style.flexDirection === "row")
                    row.props.children.splice(2, 0,
                        <View 
                            key="GuildMemberRowStatusIconsView"
                            style={{
                                flexDirection: 'row'
                        }}>
                            {debugLabels ? <Text>GMRSIV</Text> : <StatusIcons userId={user.id}/>}
                        </View>
                    )
                }
            }))
        }

        let patchedAvatar = false
        // user list on tabs v2
        const rowPatch = ([{ user }], res) => {
            if(!storage.userList) return;
            
            const modifiedStatusIcons = findInReactTree(res?.props?.label, (c) => c.key == "TabsV2MemberListStatusIconsView");
            if(!modifiedStatusIcons){
                res.props.label = (
                    <View style={{
                        justifyContent: storage.oldUserListIcons ? "space-between": "flex-start",
                        flexDirection: "row",
                        alignItems: "center"
                    }}
                    key="TabsV2MemberListStatusIconsView">
                        {res.props.label}
                        <View key="TabsV2MemberListStatusIconsView" style={{
                            flexDirection: 'row'
                        }}>
                            {debugLabels ? <Text>TV2MLSIV</Text> : <StatusIcons userId={user.id}/>}
                        </View>
                    </View>
                )
                if(!patchedAvatar){
                    unpatches.push(patcher.before("type", res.props.icon.type, (args)=>{
                        if(storage.removeDefaultMobile){
                            args[0].isMobileOnline = false
                        }
                    }))
                    patchedAvatar = true
                }
            }

            
        }

        findByTypeNameAll("UserRow").forEach((UserRow) => unpatches.push(patcher.after("type", UserRow, rowPatch)))


        //Newest dm list patch
        const MessagesItemChannelContent = findByTypeName("MessagesItemChannelContent")
        unpatches.push(patcher.after("type", MessagesItemChannelContent, (args, res) => {
            const channel = args[0]?.channel
            if(channel?.recipients?.length == 1){
                const userId = channel.recipients[0]
                const textContainer = findInReactTree(res, m => m?.props?.children?.[0]?.props?.variant =="redesign/channel-title/semibold")
                textContainer?.props?.children?.push(<View key="TabsV2RedesignDMListIcons" style={{
                    flexDirection: 'row'
                }}>
                    {debugLabels ? <Text>TV2RDMLI</Text> : <StatusIcons userId={userId}/>}
                </View>)
            }
        }))

        },
    onUnload: () => {
        unpatches.forEach(u => u());

    },

    settings:()=>{
        return <Settings/>
    }

}
