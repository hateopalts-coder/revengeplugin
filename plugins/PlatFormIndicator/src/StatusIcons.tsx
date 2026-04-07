import { findByStoreName } from '@vendetta/metro';
import React from 'react';
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

let presenceCache: any;
let cacheHits      = 0;
let cacheTimeout: any;

function getPresenceWithCache() {
    if (!cacheTimeout) {
        cacheTimeout = setTimeout(() => {
            cacheHits = 0;
            cacheTimeout = null;
        }, 5000);
    }
    if (!presenceCache || cacheHits === 0) presenceCache = PresenceStore.getState();
    cacheHits = (cacheHits + 1) % 20;
    return presenceCache;
}

/**
 * Returns a map of { platform: status } for a given userId.
 * Exported so index.tsx can use it too.
 */
export function getUserStatuses(userId: string): Record<string, string> {
    try {
        // Always re-fetch current user ID so self-status works correctly
        const myId = UserStore.getCurrentUser()?.id;

        if (userId === myId) {
            return Object.values(SessionsStore.getSessions()).reduce((acc: any, s: any) => {
                if (s?.clientInfo?.client && s.clientInfo.client !== "unknown")
                    acc[s.clientInfo.client] = s.status;
                return acc;
            }, {} as Record<string, string>);
        }

        return getPresenceWithCache()?.clientStatuses?.[userId] ?? {};
    } catch (_) {
        return {};
    }
}

export default function StatusIcons({ userId, size }: { userId: string; size?: number }) {
    useProxy(storage);

    const iconSize = size ?? 16;
    const statuses = getUserStatuses(userId);

    const platforms = Object.keys(statuses).filter(p => {
        const key = PLATFORM_STORAGE_KEYS[p];
        return !key || storage[key] !== false;
    });

    return (
        <>
            {platforms.map(p =>
                <StatusIcon
                    key={p}
                    platform={p}
                    color={getStatusColor(statuses[p], storage.fallbackColors)}
                    iconSize={iconSize}
                />
            )}
        </>
    );
}
