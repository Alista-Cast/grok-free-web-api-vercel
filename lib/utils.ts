import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

// Utility functions for the Grok API proxy

/**
 * Decodes an OpenAI format chat ID to extract the original Grok ID
 * @param openaiId The OpenAI format ID (chatcmpl-xxx)
 * @returns The original Grok ID if it can be extracted, or null
 */
export function decodeChatId(openaiId: string): number | null {
  try {
    // Remove prefix
    const b64Str = openaiId.replace("chatcmpl-", "")
    // Restore special characters
    const fixedB64 = b64Str.replace(/x/g, "+").replace(/y/g, "/").replace(/z/g, "=")
    // Base64 decode
    const buffer = Buffer.from(fixedB64 + "==", "base64")
    // Return as an integer
    return buffer.readBigUInt64BE(0)
  } catch {
    return null
  }
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

