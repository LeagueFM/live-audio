// © 2026 Oscar Knap - Alle rechten voorbehouden

import type { extension } from './extensions/types';
import { LiveAudioElement } from './liveAudioElement';

/** The minimal target buffer */
const minimalTargetBuffer = 2;

/** The ideal target buffer if we don't have to wait */
const preferableTargetBuffer = 10;

export type smartLiveAudioElementState = 'nothing' | 'loading' | 'waiting' | 'playing';

export class SmartLiveAudioElement<extensions extends readonly extension[]> {
    src: string;
    extensions: extensions;

    targetBuffer: number;
    currentBuffer: number | null = null;
    state: smartLiveAudioElementState = 'nothing';
    fatalError: boolean = false;

    liveAudioElement: LiveAudioElement<extensions>;

    onTargetBufferCallbacks: ((currentTargetBuffer: number) => void)[] = [];
    onCurrentBufferCallbacks: ((currentBuffer: number | null) => void)[] = [];
    onStateCallbacks: ((state: smartLiveAudioElementState) => void)[] = [];
    onFatalErrorCallbacks: (() => void)[] = [];

    constructor(src: string, extensions: extensions) {
        this.src = src;
        this.extensions = extensions;
        this.targetBuffer = preferableTargetBuffer;
        this.liveAudioElement = new LiveAudioElement(src, this.targetBuffer, extensions);

        this.liveAudioElement.onCurrentBuffer(currentBuffer => {
            this.currentBuffer = currentBuffer;

            for (const callback of this.onCurrentBufferCallbacks) {
                try {
                    callback(this.currentBuffer);
                } catch (e) {
                    console.warn('SmartLiveAudioElement error: onCurrentBuffer callback', e);
                }
            }
        });

        this.liveAudioElement.onFatalError(() => {
            this.#fatalError();
        });

        this.liveAudioElement.onState(state => {
            this.state = state;

            for (const callback of this.onStateCallbacks) {
                try {
                    callback(this.state);
                } catch (e) {
                    console.warn('SmartLiveAudioElement error: onState callback', e);
                }
            }

            if (this.state === "nothing" || this.state === "loading") {
                try {
                    this.#setTargetBuffer(preferableTargetBuffer);
                } catch (e) {
                    console.warn('SmartLiveAudioElement error: #setTargetBuffer', e);
                    // not a fatal error
                }
            }

            if (this.state === "waiting") {
                try {
                    this.#setTargetBuffer(minimalTargetBuffer);
                } catch (e) {
                    console.warn('SmartLiveAudioElement error: #setTargetBuffer', e);
                    // not a fatal error
                }
            }
        });
    }

    #fatalError() {
        this.fatalError = true;

        for (const callback of this.onFatalErrorCallbacks) {
            try {
                callback();
            } catch (e) {
                console.warn('SmartLiveAudioElement error: onFatalError callback', e);
            }
        }

        if (!this.liveAudioElement.fatalError) {
            try {
                this.liveAudioElement.setStateNothing();
            } catch (e) {
                console.warn('SmartLiveAudioElement error: liveAudioElement.setStateNothing', e);
                // not a fatal error
            }
        }
    }

    #setTargetBuffer(newTargetBuffer: number) {
        try {
            if (newTargetBuffer === this.targetBuffer) return;

            this.targetBuffer = newTargetBuffer;
            this.liveAudioElement.setTargetBuffer(newTargetBuffer);

            for (const callback of this.onTargetBufferCallbacks) {
                try {
                    callback(this.targetBuffer);
                } catch (e) {
                    console.warn('SmartLiveAudioElement error: onTargetBuffer callback', e);
                }
            }
        } catch (e) {
            console.warn('SmartLiveAudioElement error: #setTargetBuffer', e);
            // not a fatal error
        }
    }

    setStatePlaying() {
        try {
            let totalSeconds = this.liveAudioElement.liveAudio.totalSeconds;

            if (totalSeconds > minimalTargetBuffer) {
                if (totalSeconds > preferableTargetBuffer) {
                    this.#setTargetBuffer(preferableTargetBuffer);
                } else {
                    this.#setTargetBuffer(Math.floor(totalSeconds * 10) / 10);
                }
            } else {
                this.#setTargetBuffer(minimalTargetBuffer);
            }

            this.liveAudioElement.setStatePlaying();
        } catch (e) {
            console.warn('SmartLiveAudioElement error: setStatePlaying', e);
            this.#fatalError();
        }
    }

    setStateLoading() {
        try {
            this.liveAudioElement.setStateLoading();
        } catch (e) {
            console.warn('SmartLiveAudioElement error: setStateLoading', e);
            this.#fatalError();
        }
    }

    setStateNothing() {
        try {
            this.liveAudioElement.setStateNothing();
        } catch (e) {
            console.warn('SmartLiveAudioElement error: setStateNothing', e);
            this.#fatalError();
        }
    }

    onTargetBuffer(callback: (currentTargetBuffer: number) => void) {
        this.onTargetBufferCallbacks.push(callback);
    }

    onCurrentBuffer(callback: (currentBuffer: number | null) => void) {
        this.onCurrentBufferCallbacks.push(callback);
    }

    onState(callback: (state: smartLiveAudioElementState) => void) {
        this.onStateCallbacks.push(callback);
    }

    onFatalError(callback: () => void) {
        this.onFatalErrorCallbacks.push(callback);
    }

    offTargetBuffer(callback: (currentTargetBuffer: number) => void) {
        this.onTargetBufferCallbacks = this.onTargetBufferCallbacks.filter(cb => cb !== callback);
    }

    offCurrentBuffer(callback: (currentBuffer: number | null) => void) {
        this.onCurrentBufferCallbacks = this.onCurrentBufferCallbacks.filter(cb => cb !== callback);
    }

    offState(callback: (state: smartLiveAudioElementState) => void) {
        this.onStateCallbacks = this.onStateCallbacks.filter(cb => cb !== callback);
    }

    offFatalError(callback: () => void) {
        this.onFatalErrorCallbacks = this.onFatalErrorCallbacks.filter(cb => cb !== callback);
    }
}
