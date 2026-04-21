// © 2026 Oscar Knap - Alle rechten voorbehouden

import type { LiveAudioElement } from "../liveAudioElement";
import type { extension } from "./types";

export const muted = {
    name: 'muted',
    init: (liveAudioElement: LiveAudioElement<readonly extension[]>) => {
        return {
            setMuted: (muted: boolean) => {
                if (liveAudioElement.audio) {
                    liveAudioElement.audio.muted = muted;
                }
            },
            get muted() {
                if (liveAudioElement.audio) {
                    return liveAudioElement.audio.muted;
                }

                return null;
            },
        };
    }
} as const satisfies extension;
