import { requireOptionalNativeModule } from "expo-modules-core";

type WalletAvailabilityModule = {
  isWalletInstalled(identifier: string): Promise<boolean>;
  canResolveScheme(scheme: string): Promise<boolean>;
  openUrlInPackage(
    url: string,
    packageName: string,
    clearTask: boolean,
  ): Promise<void>;
};

const WalletAvailability =
  requireOptionalNativeModule<WalletAvailabilityModule>("WalletAvailability");

export function isWalletInstalled(identifier: string): Promise<boolean> {
  if (!WalletAvailability) {
    return Promise.resolve(false);
  }
  return WalletAvailability.isWalletInstalled(identifier);
}

export function canResolveScheme(scheme: string): Promise<boolean> {
  if (!WalletAvailability) {
    return Promise.resolve(false);
  }
  return WalletAvailability.canResolveScheme(scheme);
}

export function openUrlInPackage(
  url: string,
  packageName: string,
  clearTask = false,
): Promise<void> {
  if (!WalletAvailability) {
    return Promise.reject(new Error("WalletAvailability native module is not available"));
  }
  return WalletAvailability.openUrlInPackage(url, packageName, clearTask);
}
