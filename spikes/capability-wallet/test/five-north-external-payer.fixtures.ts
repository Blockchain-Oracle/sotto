import { SDK, type OfflineSDKInterface } from "@canton-network/wallet-sdk";

export const externalPayerOfflineSdk: OfflineSDKInterface = SDK.createOffline();
