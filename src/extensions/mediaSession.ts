// © 2026 Oscar Knap - Alle rechten voorbehouden

import type { LiveAudioElement } from "../liveAudioElement";
import type { extension } from "./types";

export const mediaSession = {
    name: 'mediaSession',
    init: (liveAudioElement: LiveAudioElement<readonly extension[]>) => {
        if ('mediaSession' in navigator) {
            liveAudioElement.onState(state => {
                if (state === 'nothing') {
                    navigator.mediaSession.playbackState = 'none';
                } else if (state === 'loading') {
                    navigator.mediaSession.playbackState = 'paused';
                } else if (state === 'waiting' || state === 'playing') {
                    navigator.mediaSession.playbackState = 'playing';
                }
            });
        }

        return {

        };
    }
} as const satisfies extension;
