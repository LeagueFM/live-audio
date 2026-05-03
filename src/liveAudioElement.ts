// © 2026 Oscar Knap - Alle rechten voorbehouden

import type { extension, extensionsToCombined } from './extensions/types';
import { LiveAudio } from './liveAudio';

const maxRetries = 4;
const retryResetTime = 1000 * 20;

export type liveAudioElementState = 'nothing' | 'loading' | 'waiting' | 'playing';

export class LiveAudioElement<extensions extends readonly extension[]> {
    src: string;
    targetBuffer: number;
    extensions: extensions;

    currentBuffer: number | null = null;
    state: liveAudioElementState = 'nothing';
    fatalError: boolean = false;
    custom: extensionsToCombined<extensions>;
    totalWaitingTime: number = 0;

    audio: HTMLAudioElement | null = null;
    liveAudio!: LiveAudio;

    onCurrentBufferCallbacks: ((currentBuffer: number | null) => void)[] = [];
    onStateCallbacks: ((state: liveAudioElementState) => void)[] = [];
    onFatalErrorCallbacks: (() => void)[] = [];
    onTotalWaitingTimeCallbacks: ((totalWaitingTime: number) => void)[] = [];

    #retries = 0;
    #lastRetryTime: number | null = null;
    #unmountLiveAudio: () => void = () => { };

    #lastAudioPlayTime: number | null = null;

    #lastWaitingStart: number | null = null;
    #beforeWaitingTime: number = 0;
    #waitingUpdateInterval: ReturnType<typeof setInterval> | null = null;

    constructor(src: string, targetBuffer: number, extensions: extensions) {
        this.src = src;
        this.targetBuffer = targetBuffer;
        this.extensions = extensions;

        try {
            this.#createLiveAudio();
        } catch (e) {
            console.warn('LiveAudioElement error: #createLiveAudio', e);
            this.#fatalError();
        }

        let newCustom = {};

        for (const extension of extensions) {
            const returned = extension.init(this) ?? {};
            newCustom = {
                ...newCustom,
                ...returned
            };
        }

        this.custom = newCustom as extensionsToCombined<extensions>;
    }

    #updateWaitingTimeState() {
        try {
            if (this.fatalError) {
                this.#updateTotalWaitingTime();
                this.#lastWaitingStart = null;
                this.#beforeWaitingTime = 0;

                if (this.#waitingUpdateInterval) {
                    clearInterval(this.#waitingUpdateInterval);
                    this.#waitingUpdateInterval = null;
                }

                return;
            }

            if (this.state === 'nothing') {
                this.totalWaitingTime = 0;
                this.#lastWaitingStart = null;
                this.#beforeWaitingTime = 0;

                if (this.#waitingUpdateInterval) {
                    clearInterval(this.#waitingUpdateInterval);
                    this.#waitingUpdateInterval = null;
                }

                for (const callback of this.onTotalWaitingTimeCallbacks) {
                    try {
                        callback(this.totalWaitingTime);
                    } catch (e) {
                        console.warn('LiveAudioElement error: onTotalWaitingTime callback', e);
                    }
                }

                return;
            }

            if (this.state === 'waiting' && this.#lastWaitingStart === null) {
                this.#updateTotalWaitingTime();
                this.#beforeWaitingTime = this.totalWaitingTime;
                this.#lastWaitingStart = Date.now();
            }
            if (this.state !== 'waiting' && this.#lastWaitingStart !== null) {
                this.#updateTotalWaitingTime();
                this.#lastWaitingStart = null;
                this.#beforeWaitingTime = 0;
            }

            if (this.state === 'waiting' && this.#waitingUpdateInterval === null) {
                this.#waitingUpdateInterval = setInterval(() => {
                    this.#updateTotalWaitingTime();
                }, 100);
            }
            if (this.state !== 'waiting' && this.#waitingUpdateInterval !== null) {
                clearInterval(this.#waitingUpdateInterval);
                this.#waitingUpdateInterval = null;
            }
        } catch (e) {
            console.warn('LiveAudioElement error: #updateWaitingTimeState', e);
            // not a fatal error
        }
    }

    #updateTotalWaitingTime() {
        try {
            if (!this.#lastWaitingStart) return;

            let lastWaitingTime = (Date.now() - this.#lastWaitingStart) / 1000;
            this.totalWaitingTime = this.#beforeWaitingTime + lastWaitingTime;

            for (const callback of this.onTotalWaitingTimeCallbacks) {
                try {
                    callback(this.totalWaitingTime);
                } catch (e) {
                    console.warn('LiveAudioElement error: onTotalWaitingTime callback', e);
                }
            }
        } catch (e) {
            console.warn('LiveAudioElement error: #updateTotalWaitingTime', e);
            // not a fatal error
        }
    }

    #fatalError() {
        if (this.fatalError) return;

        this.fatalError = true;
        this.state = 'nothing';

        try {
            if (this.audio) {
                this.#removeAudio();
            }
        } catch (e) {
            console.warn('LiveAudioElement error: #removeAudio', e);
        }

        try {
            this.#unmountLiveAudio();
        } catch (e) {
            console.warn('LiveAudioElement error: #unmountLiveAudio', e);
        }

        for (const callback of this.onStateCallbacks) {
            try {
                callback(this.state);
            } catch (e) {
                console.warn('LiveAudioElement error: onState callback', e);
            }
        }

        try {
            this.#updateCurrentBuffer();
        } catch (e) {
            console.warn('LiveAudioElement error: #updateCurrentBuffer', e);
        }

        try {
            this.#updateWaitingTimeState();
        } catch (e) {
            console.warn('LiveAudioElement error: #updateWaitingTimeState', e);
        }

        for (const callback of this.onFatalErrorCallbacks) {
            try {
                callback();
            } catch (e) {
                console.warn('LiveAudioElement error: onFatalError callback', e);
            }
        }
    }

    #retry() {
        if (this.fatalError) return;

        try {
            let currentRetries = this.#retries;
            if (this.#lastRetryTime && Date.now() - this.#lastRetryTime > retryResetTime) {
                currentRetries = 0;
            }
            currentRetries++;

            if (currentRetries >= maxRetries) {
                console.warn('LiveAudioElement error: max retries reached');

                this.#fatalError();
                return;
            }

            this.#retries = currentRetries;
            this.#lastRetryTime = Date.now();

            if (this.audio) {
                this.#removeAudio();
            }

            this.#unmountLiveAudio();

            this.#createLiveAudio();

            if (this.state === 'loading' || this.state === 'waiting' || this.state === 'playing') {
                this.#createAudio();
            }

            if (this.state === 'loading' || this.state === 'waiting' || this.state === 'playing') {
                this.liveAudio.start();
            }

            if (this.state === 'playing') {
                // true because we are already in playing state, but audio should still be played
                this.#setStatePlayingInternal(true);
            }
        } catch (e) {
            console.warn('LiveAudioElement error: #retry', e);
            this.#fatalError();
        }
    }

    #createLiveAudio() {
        if (this.fatalError) {
            console.warn('LiveAudioElement error: #createLiveAudio called after fatal error');
            return;
        }

        try {
            let currentLiveAudio = new LiveAudio(this.src);

            const urlListener = (url: string) => {
                if (this.liveAudio !== currentLiveAudio) return;
                if (this.fatalError) return;

                try {
                    if (this.audio) {
                        this.audio.src = url;
                    }

                    if (this.state === 'playing') {
                        // true because we are already in playing state, but audio should still be played
                        this.#setStatePlayingInternal(true);
                    }
                } catch (e) {
                    console.warn('LiveAudioElement error: urlListener', e);
                    this.#fatalError();
                }
            };

            const totalSecondsListener = (totalSeconds: number) => {
                if (this.liveAudio !== currentLiveAudio) return;
                if (this.fatalError) return;

                try {
                    this.#updateCurrentBuffer();
                } catch (e) {
                    console.warn('LiveAudioElement error: #updateCurrentBuffer', e);
                    // updateCurrentBuffer erroring is not a fatal error
                }
            };

            const fatalErrorListener = () => {
                if (this.liveAudio !== currentLiveAudio) return;
                if (this.fatalError) return;

                try {
                    this.#retry();
                } catch (e) {
                    console.warn('LiveAudioElement error: #retry', e);
                    this.#fatalError();
                }
            };

            currentLiveAudio.onUrl(urlListener);
            currentLiveAudio.onTotalSeconds(totalSecondsListener);
            currentLiveAudio.onFatalError(fatalErrorListener);

            this.#unmountLiveAudio = () => {
                currentLiveAudio.offUrl(urlListener);
                currentLiveAudio.offTotalSeconds(totalSecondsListener);
                currentLiveAudio.offFatalError(fatalErrorListener);
                currentLiveAudio.stop();

                this.#unmountLiveAudio = () => { };
            };

            this.liveAudio = currentLiveAudio;
        } catch (e) {
            console.warn('LiveAudioElement error: #createLiveAudio', e);
            this.#fatalError();
        }
    }

    #updateCurrentBuffer() {
        if (this.fatalError) {
            this.currentBuffer = null;

            for (const callback of this.onCurrentBufferCallbacks) {
                try {
                    callback(this.currentBuffer);
                } catch (e) {
                    console.warn('LiveAudioElement error: onCurrentBuffer callback', e);
                }
            }

            return;
        }

        try {
            if (this.liveAudio.legacy) {
                this.currentBuffer = null;

                for (const callback of this.onCurrentBufferCallbacks) {
                    try {
                        callback(this.currentBuffer);
                    } catch (e) {
                        console.warn('LiveAudioElement error: onCurrentBuffer callback', e);
                    }
                }

                return;
            }

            if ((this.state === 'playing' || this.state === 'waiting') && this.audio && this.audio.currentTime !== null) {
                if (this.liveAudio.totalSeconds === 0) {
                    this.currentBuffer = 0;
                } else {
                    let newCurrentBuffer = this.liveAudio.totalSeconds - this.audio.currentTime;
                    newCurrentBuffer = Math.round(newCurrentBuffer * 100) / 100;
                    this.currentBuffer = newCurrentBuffer;
                }
            } else {
                this.currentBuffer = null;
            }

            for (const callback of this.onCurrentBufferCallbacks) {
                try {
                    callback(this.currentBuffer);
                } catch (e) {
                    console.warn('LiveAudioElement error: onCurrentBuffer callback', e);
                }
            }

            if (this.state === 'waiting' && this.audio && (this.liveAudio.totalSeconds - this.audio.currentTime) >= this.targetBuffer) {
                try {
                    this.setStatePlaying();
                } catch (e) {
                    console.warn('LiveAudioElement error: setStatePlaying', e);
                    this.#fatalError();
                }
            }
        } catch (e) {
            console.warn('LiveAudioElement error: #updateCurrentBuffer', e);
            this.currentBuffer = null;
            // not a fatal error
        }
    }

    #createAudio() {
        if (this.fatalError) {
            console.warn('LiveAudioElement error: #createAudio called after fatal error');
            return;
        }

        try {
            if (this.audio) {
                this.#removeAudio();
            }

            console.debug('new Audio(', this.liveAudio.url ?? undefined, ')');
            let currentAudio = new Audio(this.liveAudio.url ?? undefined);

            currentAudio.addEventListener('error', (e) => {
                if (this.audio !== currentAudio) return;
                if (this.fatalError) return;

                try {
                    console.warn('LiveAudioElement HTMLAudioElement error', currentAudio.error, e);

                    this.#retry();
                } catch (e) {
                    console.warn('LiveAudioElement error: error listener', e);
                    this.#fatalError();
                }
            });

            currentAudio.addEventListener('pause', () => {
                if (this.audio !== currentAudio) return;
                if (this.fatalError) return;

                try {
                    if (this.state === 'playing') this.setStateLoading();
                } catch (e) {
                    console.warn('LiveAudioElement error: pause listener', e);
                    this.#fatalError();
                }
            });

            currentAudio.addEventListener('play', () => {
                if (this.audio !== currentAudio) return;
                if (this.fatalError) return;

                try {
                    if (this.state === 'nothing' || this.state === 'loading') this.setStatePlaying();
                } catch (e) {
                    console.warn('LiveAudioElement error: play listener', e);
                    this.#fatalError();
                }
            });

            currentAudio.addEventListener('waiting', () => {
                if (this.audio !== currentAudio) return;
                if (this.fatalError) return;

                try {
                    // if play is called, waiting event is fired shortly after while there is still data
                    if (this.#lastAudioPlayTime && Date.now() - this.#lastAudioPlayTime < 200) return;

                    if (this.state === 'playing') {
                        this.state = 'waiting';

                        for (const callback of this.onStateCallbacks) {
                            try {
                                callback(this.state);
                            } catch (e) {
                                console.warn('LiveAudioElement error: onState callback', e);
                            }
                        }

                        try {
                            this.#updateCurrentBuffer();
                        } catch (e) {
                            console.warn('LiveAudioElement error: #updateCurrentBuffer', e);
                            // not a fatal error
                        }

                        try {
                            this.#updateWaitingTimeState();
                        } catch (e) {
                            console.warn('LiveAudioElement error: #updateWaitingTimeState', e);
                            // not a fatal error
                        }
                    }

                    if (!currentAudio.paused) {
                        currentAudio.pause();
                    }
                } catch (e) {
                    console.warn('LiveAudioElement error: waiting listener', e);
                    this.#fatalError();
                }
            })

            currentAudio.addEventListener('timeupdate', () => {
                if (this.audio !== currentAudio) return;

                try {
                    this.#updateCurrentBuffer();
                } catch (e) {
                    console.warn('LiveAudioElement error: timeupdate listener', e);
                    // not a fatal error
                }
            });

            this.audio = currentAudio;
        } catch (e) {
            console.warn('LiveAudioElement error: #createAudio', e);
            this.#fatalError();
        }
    }

    #removeAudio() {
        try {
            if (this.audio) {
                this.audio.pause();
                this.audio.src = "";
                this.audio.load();

                this.audio.remove();
                this.audio = null;

                try {
                    this.#updateCurrentBuffer();
                } catch (e) {
                    console.warn('LiveAudioElement error: #updateCurrentBuffer', e);
                    // not a fatal error
                }
            }
        } catch (e) {
            console.warn('LiveAudioElement error: #removeAudio', e);
            this.#fatalError();
        }
    }

    setTargetBuffer(targetBuffer: number) {
        this.targetBuffer = targetBuffer;

        this.#updateCurrentBuffer();
    }

    onCurrentBuffer(callback: (currentBuffer: number | null) => void) {
        this.onCurrentBufferCallbacks.push(callback);
    }

    onState(callback: (state: liveAudioElementState) => void) {
        this.onStateCallbacks.push(callback);
    }

    onFatalError(callback: () => void) {
        this.onFatalErrorCallbacks.push(callback);
    }

    onTotalWaitingTime(callback: (totalWaitingTime: number) => void) {
        this.onTotalWaitingTimeCallbacks.push(callback);
    }

    offCurrentBuffer(callback: (currentBuffer: number | null) => void) {
        this.onCurrentBufferCallbacks = this.onCurrentBufferCallbacks.filter(cb => cb !== callback);
    }

    offState(callback: (state: liveAudioElementState) => void) {
        this.onStateCallbacks = this.onStateCallbacks.filter(cb => cb !== callback);
    }

    offFatalError(callback: () => void) {
        this.onFatalErrorCallbacks = this.onFatalErrorCallbacks.filter(cb => cb !== callback);
    }

    offTotalWaitingTime(callback: (totalWaitingTime: number) => void) {
        this.onTotalWaitingTimeCallbacks = this.onTotalWaitingTimeCallbacks.filter(cb => cb !== callback);
    }

    setStateNothing() {
        if (this.fatalError) {
            console.warn('LiveAudioElement error: setStateNothing called after fatal error');
            return;
        }

        try {
            if (this.state === 'playing' || this.state === 'waiting') this.setStateLoading();
            if (this.state === 'playing' || this.state === 'waiting') {
                console.warn('LiveAudioElement error: setStateLoading did not set the state to loading');
                this.#fatalError();
                return;
            }

            if (this.state === 'loading') {
                this.state = 'nothing';

                if (this.liveAudio.active) {
                    this.liveAudio.stop();
                }

                for (const callback of this.onStateCallbacks) {
                    try {
                        callback(this.state);
                    } catch (e) {
                        console.warn('LiveAudioElement error: onState callback', e);
                    }
                }

                try {
                    this.#updateCurrentBuffer();
                } catch (e) {
                    console.warn('LiveAudioElement error: #updateCurrentBuffer', e);
                    // not a fatal error
                }

                try {
                    this.#updateWaitingTimeState();
                } catch (e) {
                    console.warn('LiveAudioElement error: #updateWaitingTimeState', e);
                    // not a fatal error
                }
            }

            if (this.audio) {
                this.#removeAudio();
            }
        } catch (e) {
            console.warn('LiveAudioElement error: setStateNothing', e);
            this.#fatalError();
        }
    }

    setStateLoading() {
        if (this.fatalError) {
            console.warn('LiveAudioElement error: setStateLoading called after fatal error');
            return;
        }

        try {
            if (!this.audio) this.#createAudio();
            if (!this.audio) {
                console.warn('LiveAudioElement error: #createAudio did not create audio');
                this.#fatalError();
                return;
            }

            if (this.state === 'playing') {
                this.state = 'loading';
                this.audio.pause();

                for (const callback of this.onStateCallbacks) {
                    try {
                        callback(this.state);
                    } catch (e) {
                        console.warn('LiveAudioElement error: onState callback', e);
                    }
                }

                try {
                    this.#updateCurrentBuffer();
                } catch (e) {
                    console.warn('LiveAudioElement error: #updateCurrentBuffer', e);
                    // not a fatal error
                }

                try {
                    this.#updateWaitingTimeState();
                } catch (e) {
                    console.warn('LiveAudioElement error: #updateWaitingTimeState', e);
                    // not a fatal error
                }
            }
            if (this.state === 'waiting') {
                this.state = 'loading';

                for (const callback of this.onStateCallbacks) {
                    try {
                        callback(this.state);
                    } catch (e) {
                        console.warn('LiveAudioElement error: onState callback', e);
                    }
                }

                try {
                    this.#updateCurrentBuffer();
                } catch (e) {
                    console.warn('LiveAudioElement error: #updateCurrentBuffer', e);
                    // not a fatal error
                }

                try {
                    this.#updateWaitingTimeState();
                } catch (e) {
                    console.warn('LiveAudioElement error: #updateWaitingTimeState', e);
                    // not a fatal error
                }
            }

            if (this.state === 'nothing') {
                this.state = 'loading';

                if (!this.liveAudio.active) {
                    this.liveAudio.start();
                }

                for (const callback of this.onStateCallbacks) {
                    try {
                        callback(this.state);
                    } catch (e) {
                        console.warn('LiveAudioElement error: onState callback', e);
                    }
                }

                try {
                    this.#updateCurrentBuffer();
                } catch (e) {
                    console.warn('LiveAudioElement error: #updateCurrentBuffer', e);
                    // not a fatal error
                }
            }
        } catch (e) {
            console.warn('LiveAudioElement error: setStateLoading', e);
            this.#fatalError();
        }
    }

    setStatePlaying() {
        if (this.fatalError) {
            console.warn('LiveAudioElement error: setStatePlaying called after fatal error');
            return;
        }

        this.#setStatePlayingInternal(false);
    }

    #setStatePlayingInternal(skipAlreadyGoodStateCheck: boolean) {
        if (this.fatalError) {
            console.warn('LiveAudioElement error: #setStatePlayingInternal called after fatal error');
            return;
        }

        try {
            if (this.state === 'nothing') this.setStateLoading();
            if (this.state === 'nothing') {
                console.warn('LiveAudioElement error: setStateLoading did not set the state to loading');
                this.#fatalError();
                return;
            }
            if (!this.audio) {
                console.warn('LiveAudioElement error: setStatePlaying called, but audio element has not been created');
                this.#fatalError();
                return;
            }

            if (this.liveAudio.totalSeconds < this.targetBuffer && !this.liveAudio.legacy) {
                if (this.state === 'waiting' && !skipAlreadyGoodStateCheck) return;

                this.state = 'waiting';

                for (const callback of this.onStateCallbacks) {
                    try {
                        callback(this.state);
                    } catch (e) {
                        console.warn('LiveAudioElement error: onState callback', e);
                    }
                }

                try {
                    this.#updateCurrentBuffer();
                } catch (e) {
                    console.warn('LiveAudioElement error: #updateCurrentBuffer', e);
                    // not a fatal error
                }

                try {
                    this.#updateWaitingTimeState();
                } catch (e) {
                    console.warn('LiveAudioElement error: #updateWaitingTimeState', e);
                    // not a fatal error
                }

                return;
            }

            if (this.state === 'playing' && !skipAlreadyGoodStateCheck) return;
            this.state = 'playing';

            if (this.liveAudio.legacy) {

                const buffered = this.audio.buffered;

                let latestBuffered = null;

                for (let i = 0; i < buffered.length; i++) {
                    const end = buffered.end(i);
                    if (latestBuffered === null || end > latestBuffered) {
                        latestBuffered = end;
                    }
                }

                if (latestBuffered !== null) {
                    this.audio.currentTime = latestBuffered - this.targetBuffer;
                }

            } else {
                this.audio.currentTime = this.liveAudio.totalSeconds - this.targetBuffer;
            }

            this.#lastAudioPlayTime = Date.now();
            this.audio.play();

            for (const callback of this.onStateCallbacks) {
                try {
                    callback(this.state);
                } catch (e) {
                    console.warn('LiveAudioElement error: onState callback', e);
                }
            }

            try {
                this.#updateCurrentBuffer();
            } catch (e) {
                console.warn('LiveAudioElement error: #updateCurrentBuffer', e);
                // not a fatal error
            }

            try {
                this.#updateWaitingTimeState();
            } catch (e) {
                console.warn('LiveAudioElement error: #updateWaitingTimeState', e);
                // not a fatal error
            }
        } catch (e) {
            console.warn('LiveAudioElement error: #setStatePlayingInternal', e);
            this.#fatalError();
        }
    }

}

