// © 2026 Oscar Knap - Alle rechten voorbehouden

import type { LiveAudioElement } from "../liveAudioElement";
import type { extension } from "./types";

type volumeReturn = {
    /** Number between 0 and 1 */
    setVolume: (volume: number) => void;
    /** Number between 0 and 1 */
    volume: number | null;
};

type volume = {
    name: 'volume';
    init: (liveAudioElement: LiveAudioElement<extension[]>) => volumeReturn;
};

export const volume: volume = {
    name: 'volume',
    init: (liveAudioElement: LiveAudioElement<extension[]>) => {
        return {
            setVolume: (volume: number) => {
                if (volume < 0 || volume > 1) {
                    throw new Error('Volume must be between 0 and 1');
                }

                if (liveAudioElement.audio) {
                    liveAudioElement.audio.volume = volume;
                }
            },
            get volume() {
                if (liveAudioElement.audio) {
                    return liveAudioElement.audio.volume;
                }

                return null;
            },
        };
    }
} as const satisfies extension;
