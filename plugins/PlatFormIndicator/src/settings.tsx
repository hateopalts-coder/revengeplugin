import { React, ReactNative } from "@vendetta/metro/common";
import { storage } from "@vendetta/plugin";
import { useProxy } from "@vendetta/storage";
import { Forms } from "@vendetta/ui/components";

const { View, ScrollView } = ReactNative;

export default function Settings() {
    useProxy(storage);

    return (
        <ScrollView>
            <View>
                <Forms.FormSwitchRow
                    label="Show icons on the DM top bar"
                    value={storage.dmTopBar ?? true}
                    onValueChange={v => storage.dmTopBar = v}
                    note=""
                />
                <Forms.FormSwitchRow
                    label="Show icons on the users and DMs list"
                    value={storage.userList ?? true}
                    onValueChange={v => storage.userList = v}
                    note=""
                />
                <Forms.FormSwitchRow
                    label="Show icons on user profiles"
                    value={storage.profileUsername ?? true}
                    onValueChange={v => storage.profileUsername = v}
                    note=""
                />
                <Forms.FormSwitchRow
                    label="Show in chat"
                    value={storage.showInChat ?? false}
                    onValueChange={v => storage.showInChat = v}
                    note="Shows platform emoji next to username in chat (long names get truncated)"
                />
                <Forms.FormSwitchRow
                    label="Hide mobile status from the normal indicator"
                    value={storage.removeDefaultMobile ?? true}
                    onValueChange={v => storage.removeDefaultMobile = v}
                    note=""
                />
                <Forms.FormSwitchRow
                    label="Theme compatibility mode"
                    value={storage.fallbackColors ?? false}
                    onValueChange={v => storage.fallbackColors = v}
                    note=""
                />
                <Forms.FormSwitchRow
                    label="Old user list icon style"
                    value={storage.oldUserListIcons ?? false}
                    onValueChange={v => storage.oldUserListIcons = v}
                    note="Moves status indicators to the right"
                />
            </View>

            <Forms.FormSection title="Platform Visibility">
                <Forms.FormSwitchRow
                    label="Desktop"
                    value={storage.showDesktop ?? true}
                    onValueChange={v => storage.showDesktop = v}
                    note=""
                />
                <Forms.FormSwitchRow
                    label="Mobile"
                    value={storage.showMobile ?? true}
                    onValueChange={v => storage.showMobile = v}
                    note=""
                />
                <Forms.FormSwitchRow
                    label="Browser / Web"
                    value={storage.showWeb ?? true}
                    onValueChange={v => storage.showWeb = v}
                    note=""
                />
                <Forms.FormSwitchRow
                    label="Console / Embedded"
                    value={storage.showEmbedded ?? true}
                    onValueChange={v => storage.showEmbedded = v}
                    note=""
                />
                <Forms.FormSwitchRow
                    label="VR"
                    value={storage.showVR ?? true}
                    onValueChange={v => storage.showVR = v}
                    note=""
                />
            </Forms.FormSection>
        </ScrollView>
    );
}
