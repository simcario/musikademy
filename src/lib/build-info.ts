/** Identità della build in esecuzione, fissata da next.config.ts al momento della compilazione. */
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0";
export const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";
export const BUILD_TIME = process.env.NEXT_PUBLIC_BUILD_TIME ?? "";

export interface BuildInfo {
  version: string;
  buildId: string;
  buildTime: string;
}

export const BUILD_INFO: BuildInfo = { version: APP_VERSION, buildId: BUILD_ID, buildTime: BUILD_TIME };
