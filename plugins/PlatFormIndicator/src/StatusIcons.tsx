import { findByStoreName } from '@vendetta/metro';
import React from 'react'
import StatusIcon from './StatusIcon';
import { getStatusColor } from './colors';

import { storage } from "@vendetta/plugin";
import { useProxy } from "@vendetta/storage";

const PresenceStore = findByStoreName("PresenceStore");
const SessionsStore = findByStoreName("SessionsStore");
const UserStore = findByStoreName("UserStore");


let statusCache;
let statusCacheHits = 0;
let statusCacheTimeout;
let currentUserId;

// Map from platform key -> storage key
const PLATFORM_STORAGE_KEYS: Record<string, string> = {
    desktop:  "showDesktop",
    mobile:   "showMobile",
    web:      "showWeb",
    embedded: "showEmbedded",
    vr:       "showVR",
};

function queryPresenceStoreWithCache(){
    if(!statusCacheTimeout){
        statusCacheTimeout = setTimeout(() => {
            statusCacheHits = 0
            statusCacheTimeout = null
        },5000);
    }

    if(!statusCache || statusCacheHits == 0){
        statusCache = PresenceStore.getState()
    }

    statusCacheHits = (statusCacheHits+1) % 20

    return statusCache
}

function getUserStatuses(userId){
    let statuses;

    if(!currentUserId){
        currentUserId = UserStore.getCurrentUser()?.id
    }

    if(userId == currentUserId){
        statuses = Object.values(SessionsStore.getSessions()).reduce((acc: any, curr: any) => {
            if (curr.clientInfo.client !== "unknown")
                acc[curr.clientInfo.client] = curr.status;
            return acc;
        }, {});
    } else {
        statuses = queryPresenceStoreWithCache()?.clientStatuses[userId]
    }
    return statuses
}

export default function StatusIcons(props) {
    useProxy(storage)

    const userId = props.userId;
    const iconSize = props.size ?? 16;

    const statuses = getUserStatuses(userId)

    // Filter platforms the user has disabled in settings
    const visiblePlatforms = Object.keys(statuses ?? {}).filter((platform) => {
        const storageKey = PLATFORM_STORAGE_KEYS[platform];
        if (!storageKey) return true; // unknown platform → show by default
        return storage[storageKey] !== false; // default true if not set
    });

    return (
        <>
            {visiblePlatforms.map((s) =>
                <StatusIcon
                    key={s}
                    platform={s}
                    color={getStatusColor(statuses[s], storage.fallbackColors)}
                    iconSize={iconSize}
                />
            )}
        </>
    )
}
