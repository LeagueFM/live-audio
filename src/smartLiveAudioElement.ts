// © 2026 Oscar Knap - Alle rechten voorbehouden

import type { extension } from './extensions/types';
import { LiveAudioElement } from './liveAudioElement';

/** The minimal target buffer */
const minimalTargetBuffer = 2;

/** The ideal target buffer if we don't have to wait */
const preferableTargetBuffer = 10;

export type smartLiveAudioElementState = 'nothing' | 'loading' | 'waiting' | 'playing';

export class SmartLiveAudioElement<extensions extends readonly extension[]> {
    // todo: error handling

    // todo: if user has bad internet connection, change targetBuffer based on that

    // todo: add synced property: if a lot of waiting, synced goes to false, because we are largely behind the stream

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
                callback(this.currentBuffer);
            }
        });

        this.liveAudioElement.onFatalError(() => {
            this.#fatalError();
        });

        this.liveAudioElement.onState(state => {
            this.state = state;

            for (const callback of this.onStateCallbacks) {
                callback(this.state);
            }

            // todo: think more about these buffer changes
            if (this.state === "nothing" || this.state === "loading") {
                this.#setTargetBuffer(preferableTargetBuffer);
            }

            if (this.state === "waiting") {
                this.#setTargetBuffer(minimalTargetBuffer);
            }
        });
    }

    #fatalError() {
        this.fatalError = true;

        for (const callback of this.onFatalErrorCallbacks) {
            callback();
        }

        if (!this.liveAudioElement.fatalError) {
            this.liveAudioElement.setStateNothing();
        }
    }

    #setTargetBuffer(newTargetBuffer: number) {
        if (newTargetBuffer === this.targetBuffer) return;

        this.targetBuffer = newTargetBuffer;
        this.liveAudioElement.setTargetBuffer(newTargetBuffer);

        for (const callback of this.onTargetBufferCallbacks) {
            callback(this.targetBuffer);
        }
    }

    setStatePlaying() {
        // todo: think more about these buffer changes
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
    }

    setStateLoading() {
        this.liveAudioElement.setStateLoading();
    }

    setStateNothing() {
        this.liveAudioElement.setStateNothing();
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
