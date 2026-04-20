// © 2026 Oscar Knap - Alle rechten voorbehouden

import type { LiveAudioElement } from "../liveAudioElement";

export type extension = {
    name: string;
    init: (liveAudioElement: LiveAudioElement<extension[]>) => object;
};

type InitReturns<T extends readonly extension[]> = ReturnType<T[number]["init"]>;

type UnionToIntersection<U> =
    (U extends any ? (x: U) => void : never) extends
    (x: infer I) => void ? I : never;

export type extensionsToCombined<T extends readonly extension[]> = UnionToIntersection<InitReturns<T>>;
