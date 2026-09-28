import AsyncStorage from "@react-native-async-storage/async-storage";
import { Buffer } from "buffer";

import type { DAppKeyPair, PetraSession } from "./petra-types";

const STORAGE_KEY = "petra_deeplink_session_v1";

interface StoredPetraSession {
  walletAddress: string;
  walletPublicKey?: string;
  dAppPublicKeyHex: string;
  dAppSecretKeyHex: string;
  sharedSecretHex: string;
}

function toStored(session: PetraSession): StoredPetraSession {
  return {
    walletAddress: session.walletAddress,
    walletPublicKey: session.walletPublicKey,
    dAppPublicKeyHex: Buffer.from(session.dAppKeyPair.publicKey).toString("hex"),
    dAppSecretKeyHex: Buffer.from(session.dAppKeyPair.secretKey).toString("hex"),
    sharedSecretHex: Buffer.from(session.sharedSecret).toString("hex"),
  };
}

function fromStored(stored: StoredPetraSession): PetraSession {
  return {
    walletAddress: stored.walletAddress,
    walletPublicKey: stored.walletPublicKey,
    dAppKeyPair: {
      publicKey: Buffer.from(stored.dAppPublicKeyHex, "hex"),
      secretKey: Buffer.from(stored.dAppSecretKeyHex, "hex"),
    },
    sharedSecret: Buffer.from(stored.sharedSecretHex, "hex"),
  };
}

export async function loadPetraSession(): Promise<PetraSession | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredPetraSession;
    if (
      !parsed?.walletAddress ||
      !parsed.dAppPublicKeyHex ||
      !parsed.dAppSecretKeyHex ||
      !parsed.sharedSecretHex
    ) {
      return null;
    }
    return fromStored(parsed);
  } catch {
    return null;
  }
}

export async function savePetraSession(session: PetraSession): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(toStored(session)));
  } catch {
    // Persistence is best-effort; in-memory session still works for this app session.
  }
}

export async function clearPetraSession(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
