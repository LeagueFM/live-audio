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

            navigator.mediaSession.setActionHandler('play', () => {
                liveAudioElement.setStatePlaying();
            });
            navigator.mediaSession.setActionHandler('pause', () => {
                liveAudioElement.setStateLoading();
            });
            navigator.mediaSession.setActionHandler('stop', () => {
                liveAudioElement.setStateNothing();
            });
        }

        return {
            setMetadata: (metadata: MediaMetadata) => {
                if ('mediaSession' in navigator) {
                    navigator.mediaSession.metadata = metadata;
                }
            }
        };
    }
} as const satisfies extension;
