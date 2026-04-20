// © 2026 Oscar Knap - Alle rechten voorbehouden

import type { LiveAudioElement } from "../liveAudioElement";

export type extension = {
    name: string;
    init: (liveAudioElement: LiveAudioElement<extension[]>) => object;
};
