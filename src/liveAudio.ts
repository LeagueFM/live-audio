// © 2026 Oscar Knap - Alle rechten voorbehouden

const maxRetries = 3;
const retryResetTime = 1000 * 15;

/** After how much time of not receiving packets do we retry the connection */
const noPacketRetryTime = 1000 * 8;

/** How long to wait for the first fetch to complete */
const fetchTimeout = 1000 * 6;

export class LiveAudio {
    src: string;
    url: string | null = null;
    totalSeconds: number = 0;
    active: boolean = false;
    legacy: boolean = false;
    fatalError: boolean = false;

    mediaSource: MediaSource | null = null;
    reader: ReadableStreamDefaultReader<Uint8Array<ArrayBuffer>> | null = null;

    onTotalSecondsCallbacks: ((totalSeconds: number) => void)[] = [];
    onUrlCallbacks: ((url: string) => void)[] = [];
    onFatalErrorCallbacks: (() => void)[] = [];

    #noPacketCheckInterval: ReturnType<typeof setInterval> | null = null;
    lastPacketTime: null | number = null;
    #innerStartIdentifier: Symbol | null = null;

    constructor(src: string) {
        this.src = src;
        this.updateLegacy();
    }

    onTotalSeconds(callback: (totalSeconds: number) => void) {
        this.onTotalSecondsCallbacks.push(callback);
    }

    onUrl(callback: (url: string) => void) {
        this.onUrlCallbacks.push(callback);
    }

    onFatalError(callback: () => void) {
        this.onFatalErrorCallbacks.push(callback);
    }

    offTotalSeconds(callback: (totalSeconds: number) => void) {
        this.onTotalSecondsCallbacks = this.onTotalSecondsCallbacks.filter(cb => cb !== callback);
    }

    offUrl(callback: (url: string) => void) {
        this.onUrlCallbacks = this.onUrlCallbacks.filter(cb => cb !== callback);
    }

    offFatalError(callback: () => void) {
        this.onFatalErrorCallbacks = this.onFatalErrorCallbacks.filter(cb => cb !== callback);
    }

    updateLegacy() {
        try {
            if (this.legacy) return;

            if (
                typeof window === 'undefined'
                || !("MediaSource" in window)
                || !MediaSource.isTypeSupported('audio/mpeg')
            ) {
                console.warn('LiveAudio legacy mode enabled');
                this.legacy = true;
                this.totalSeconds = 0;
                this.mediaSource = null;
                this.reader = null;
                this.#innerStartIdentifier = null;

                this.url = this.src;
            }
        } catch (e) {
            console.warn('LiveAudio error: updateLegacy', e);
            this.#fatalError();
        }
    }

    #startLegacy() {
        if (this.fatalError) {
            console.warn('LiveAudio error: #startLegacy called after fatal error');
            return;
        }

        try {
            this.active = true;
            this.totalSeconds = 0;
            this.mediaSource = null;
            this.reader = null;

            try {
                if (this.url && this.url.startsWith('blob:')) {
                    URL.revokeObjectURL(this.url);
                    this.url = this.src;
                }
            } catch (e) {
                console.warn('LiveAudio error: revokeObjectURL', e);
            }

            this.#innerStartIdentifier = null;

            this.url = this.src;

            for (const callback of this.onUrlCallbacks) {
                try {
                    callback(this.url);
                } catch (e) {
                    console.warn('LiveAudio error: onUrl callback', e);
                }
            }
        } catch (e) {
            console.warn('LiveAudio error: #startLegacy', e);
            this.#fatalError();
        }
    }

    start() {
        if (this.fatalError) {
            console.warn('LiveAudio error: start called after fatal error');
            return;
        }

        try {

            if (this.legacy) {
                this.#startLegacy();
                return;
            }

            this.active = true;
            this.totalSeconds = 0;

            for (const callback of this.onTotalSecondsCallbacks) {
                try {
                    callback(this.totalSeconds);
                } catch (e) {
                    console.warn('LiveAudio error: onTotalSeconds callback', e);
                }
            }

            this.#createNewMediaSource(0);
        } catch (e) {
            console.warn('LiveAudio error: start', e);
            this.#fatalError();
        }
    }

    #fatalError() {
        if (this.fatalError) return;

        this.fatalError = true;
        this.active = false;

        for (const callback of this.onFatalErrorCallbacks) {
            try {
                callback();
            } catch (e) {
                console.warn('LiveAudio error: onFatalError callback', e);
            }
        }
    }

    #createNewMediaSource(retries: number) {
        if (this.fatalError) {
            console.warn('LiveAudio error: #createNewMediaSource called after fatal error');
            return;
        }

        try {
            try {
                if (this.url && this.url.startsWith('blob:')) {
                    URL.revokeObjectURL(this.url);
                    if (this.legacy) {
                        this.url = this.src;
                    } else {
                        this.url = null;
                    }
                }
            } catch (e) {
                console.warn('LiveAudio error: revokeObjectURL', e);
            }

            this.#innerStartIdentifier = null;

            this.mediaSource = new MediaSource();
            this.mediaSource.addEventListener("sourceopen", () => this.#innerStart(retries), { once: true });

            this.totalSeconds = 0;

            for (const callback of this.onTotalSecondsCallbacks) {
                try {
                    callback(this.totalSeconds);
                } catch (e) {
                    console.warn('LiveAudio error: onTotalSeconds callback', e);
                }
            }

            try {
                this.url = URL.createObjectURL(this.mediaSource);
            } catch (e) {
                console.warn('LiveAudio error: createObjectURL', e);
                this.#fatalError();
                return;
            }

            for (const callback of this.onUrlCallbacks) {
                try {
                    callback(this.url);
                } catch (e) {
                    console.warn('LiveAudio error: onUrl callback', e);
                }
            }
        } catch (e) {
            console.warn('LiveAudio error: #createNewMediaSource', e);
            this.#fatalError();
        }
    }

    async #innerStart(retries: number) {
        if (this.fatalError) {
            console.warn('LiveAudio error: #innerStart called after fatal error');
            return;
        }

        try {
            if (!this.mediaSource) {
                console.warn('LiveAudio error: #innerStart called without mediaSource');
                this.#fatalError();
                return;
            }

            const startTime = Date.now();
            let currentInnerStartIdentifier = Symbol('innerStartIdentifier');
            this.#innerStartIdentifier = currentInnerStartIdentifier;

            let retried = false;
            const tryRetry = () => {
                try {
                    if (retried) return;
                    if (this.#innerStartIdentifier !== currentInnerStartIdentifier) return;
                    if (!this.active) return;
                    if (this.fatalError) return;
                    retried = true;

                    const retryTime = Date.now();
                    let currentRetries = retries;

                    if (retryTime - startTime > retryResetTime) {
                        currentRetries = 0;
                    }

                    currentRetries++;

                    if (currentRetries >= maxRetries) {
                        console.warn('LiveAudio error: max retries reached');
                        this.#fatalError();
                        return;
                    }

                    this.#createNewMediaSource(currentRetries);
                } catch (e) {
                    console.warn('LiveAudio error: tryRetry', e);
                    this.#fatalError();
                    return;
                }
            };

            if (this.#noPacketCheckInterval) {
                clearInterval(this.#noPacketCheckInterval);
                this.#noPacketCheckInterval = null;
            }
            let currentInterval = setInterval(() => {
                if (this.#noPacketCheckInterval !== currentInterval) {
                    console.warn('LiveAudio error: #noPacketCheckInterval interval was not cleared before it was removed');
                    return;
                }

                if (!this.lastPacketTime) return;

                if (Date.now() - this.lastPacketTime > noPacketRetryTime) {
                    console.warn(`LiveAudio error: did not receive an audio packet for ${noPacketRetryTime}ms`)
                    tryRetry();
                    return;
                }
            }, noPacketRetryTime);
            this.#noPacketCheckInterval = currentInterval;

            const sourceBuffer = this.mediaSource.addSourceBuffer("audio/mpeg");

            const abortController = new AbortController();
            let fetchFinished = false;
            let fetchAborted = false;

            setTimeout(() => {
                if (fetchFinished || fetchAborted) return;

                abortController.abort(`Timeout of ${fetchTimeout}ms exceeded`);
                fetchAborted = true;
            }, fetchTimeout);

            let res: Response;
            try {
                res = await fetch(this.src, { signal: abortController.signal });
                fetchFinished = true;
            } catch (e) {
                fetchFinished = true;

                if (!fetchAborted) {
                    fetchAborted = true;
                    abortController.abort('Fetch no longer needed');
                }

                console.warn('LiveAudio fetch failed', e);
                tryRetry();
                return;
            }
            try {
                if (!res.body) {
                    console.warn('LiveAudio error: fetch body was empty');
                    tryRetry();
                    return;
                }

                this.reader = res.body.getReader();

                while (this.active && this.#innerStartIdentifier === currentInnerStartIdentifier && !this.fatalError) {
                    let value: Uint8Array<ArrayBuffer> | undefined = undefined;
                    let done: boolean;
                    try {
                        ({ value, done } = await this.reader.read());
                    } catch (e) {
                        console.warn("LiveAudio error", e);
                        tryRetry();
                        return;
                    }
                    if (done || !value) {
                        console.warn("LiveAudio server closed connection");
                        tryRetry();
                        return;
                    }

                    if (!this.active) return;
                    if (this.#innerStartIdentifier !== currentInnerStartIdentifier) return;
                    if (this.fatalError) return;

                    this.lastPacketTime = Date.now();

                    try {
                        await new Promise((resolve, reject) => {
                            sourceBuffer.addEventListener("updateend", resolve, { once: true });
                            try {
                                sourceBuffer.appendBuffer(value);
                            } catch (e) {
                                reject(e);
                            }
                        });
                    } catch (e) {
                        console.warn("LiveAudio error", e);
                        tryRetry();
                        return;
                    }

                    const buffered = sourceBuffer.buffered;

                    let latestBuffered = null;

                    for (let i = 0; i < buffered.length; i++) {
                        const end = buffered.end(i);
                        if (latestBuffered === null || end > latestBuffered) {
                            latestBuffered = end;
                        }
                    }

                    if (latestBuffered !== null) {
                        this.totalSeconds = latestBuffered;

                        for (const callback of this.onTotalSecondsCallbacks) {
                            try {
                                callback(this.totalSeconds);
                            } catch (e) {
                                console.warn('LiveAudio error: onTotalSeconds callback', e);
                            }
                        }
                    }
                }
            } finally {
                if (!fetchAborted) {
                    fetchAborted = true;
                    abortController.abort('Fetch no longer needed');
                }
            }
        } catch (e) {
            console.warn('LiveAudio error: #innerStart', e);
            this.#fatalError();
            return;
        }
    }

    stop() {
        this.active = false;
        try {
            this.lastPacketTime = null;
            this.#innerStartIdentifier = null;
            if (this.url) {
                if (this.url.startsWith('blob:')) {
                    URL.revokeObjectURL(this.url);
                }
                if (this.legacy) {
                    this.url = this.src;
                } else {
                    this.url = null;
                }
            }
            if (this.#noPacketCheckInterval) {
                clearInterval(this.#noPacketCheckInterval);
                this.#noPacketCheckInterval = null;
            }
        } catch (e) {
            console.warn('LiveAudio error: stop', e);
            this.#fatalError();
        }
    }
}
