/** Publication-path canary. The frozen QPET API replaces this in the first alpha. */
export const releaseChannel = "canary" as const;

export type QscriptionsReleaseChannel = typeof releaseChannel;
