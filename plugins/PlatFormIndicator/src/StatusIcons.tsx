import { findByStoreName } from '@vendetta/metro';
import React from 'react'
import StatusIcon from './StatusIcon';
import { getStatusColor } from './colors';
import { storage } from "@vendetta/plugin";
import { useProxy } from "@vendetta/storage";

const PresenceStore = findByStoreName("PresenceStore");
const SessionsStore = findByStoreName("SessionsStore");
const UserStore     = findByStoreName("UserStore");

const PLATFORM_STORAGE_KEYS: Record<string, string> = {
    desktop:  "showDesktop",
    mobile:   "showMobile",
    web:      "showWeb",
    embedded: "showEmbedded",
    vr:       "showVR",
};

let statusCache: any;
let statusCacheHits = 0;
let statusCacheTimeout: any;

function queryPresenceStoreWithCache() {
    if (!statusCacheTimeout) {
        statusCacheTimeout = setTimeout(() => {
            statusCacheHits = 0;
            statusCacheTimeout = null;
        }, 5000);
    }
    if (!statusCache || statusCacheHits == 0) {
        statusCache = PresenceStore.getState();
    }
    statusCacheHits = (statusCacheHits + 1) % 20;
    return statusCache;
}

// Exported so index.tsx can use it for the chat patch too
export function getUserStatuses(userId: string): Record<string, string> {
    try {
        // FIX: fetch fresh every time — don't cache currentUserId in module scope
        const currentUserId = UserStore.getCurrentUser()?.id;
        if (userId === currentUserId) {
            return Object.values(SessionsStore.getSessions()).reduce((acc: any, curr: any) => {
                if (curr?.clientInfo?.client && curr.clientInfo.client !== "unknown")
                    acc[curr.clientInfo.client] = curr.status;
                return acc;
            }, {} as Record<string, string>);
        } else {
            return queryPresenceStoreWithCache()?.clientStatuses?.[userId] ?? {};
        }
    } catch (e) {
        return {};
    }
}

export default function StatusIcons(props: { userId: string; size?: number }) {
    useProxy(storage);

    const userId   = props.userId;
    const iconSize = props.size ?? 16;
    const statuses = getUserStatuses(userId);

    const visiblePlatforms = Object.keys(statuses).filter((p) => {
        const key = PLATFORM_STORAGE_KEYS[p];
        return !key || storage[key] !== false;
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
    );
}
