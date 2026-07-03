/// <reference types="nativewind/types" />

declare module "expo-clipboard" {
  export function setStringAsync(text: string): Promise<void>;
  export function getStringAsync(): Promise<string>;
}

declare module "expo-print" {
  export function printToFileAsync(options: {
    html: string;
    base64?: boolean;
  }): Promise<{ uri: string }>;
}

declare module "expo-sharing" {
  export function isAvailableAsync(): Promise<boolean>;
  export function shareAsync(
    url: string,
    options?: { mimeType?: string; UTI?: string; dialogTitle?: string }
  ): Promise<void>;
}
