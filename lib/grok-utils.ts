import crypto from "crypto"

// Conversation history store (in-memory for simplicity)
// For production, consider using a database or Vercel KV
export const conversations: Record<string, any[]> = {}

// Role mappings - matching the Python implementation
export const SENDER_TO_ROLE: Record<number | string, string> = {
  1: "user",
  2: "assistant",
  ASSISTANT: "assistant",
}

export const ROLE_TO_SENDER: Record<string, number> = {
  user: 1,
  assistant: 2,
}

/**
 * Convert tweet links in messages
 * Matches the Python implementation's convert_tweet_links function
 */
export function convertTweetLinks(message: string): string {
  // Match [link](#tweet=number) format
  const pattern = /\[link\]$$#tweet=(\d+)$$/g
  // Replace with [link](https://x.com/elonmusk/status/number)
  return message.replace(pattern, (_, tweetId) => `[link](https://x.com/elonmusk/status/${tweetId})`)
}

/**
 * Convert Grok ID to OpenAI format ID
 * Matches the Python implementation's encode_chat_id function
 */
export function encodeChatId(grokId: string | number): string {
  // Use SHA256 to generate a fixed-length hash
  const hash = crypto.createHash("sha256").update(String(grokId)).digest()
  // Take the first 24 bytes and convert to base64
  const b64Str = hash.slice(0, 24).toString("base64")
  // Replace special characters
  const cleanB64 = b64Str.replace(/\+/g, "x").replace(/\//g, "y").replace(/=/g, "z")
  return `chatcmpl-${cleanB64.slice(0, 32)}`
}

/**
 * Try to extract the original Grok ID from the OpenAI format ID
 * Matches the Python implementation's decode_chat_id function
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

/**
 * Configure fetch with retry logic similar to the Python implementation
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = 5,
  backoffFactor = 2,
  statusesToRetry = [429, 500, 502, 503, 504],
): Promise<Response> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      console.log(`Fetch attempt ${attempt + 1}/${retries} to ${url}`)

      // Add a timeout to the fetch request
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000) // 30 second timeout

      const fetchOptions = {
        ...options,
        signal: controller.signal,
      }

      try {
        const response = await fetch(url, fetchOptions)
        clearTimeout(timeoutId) // Clear the timeout if fetch completes

        // Log response status
        console.log(`Fetch response status: ${response.status}`)

        // If the response is ok or not in the retry list, return it
        if (response.ok || !statusesToRetry.includes(response.status)) {
          return response
        }

        // For error responses, clone the response before reading the body
        const clonedResponse = response.clone()
        const errorText = await clonedResponse.text()
        console.error(`Request failed with status ${response.status}:`, errorText)

        // Otherwise, prepare to retry
        lastError = new Error(`Request failed with status ${response.status}: ${errorText}`)
      } catch (fetchError) {
        clearTimeout(timeoutId) // Clear the timeout
        throw fetchError // Re-throw to be caught by the outer try/catch
      }
    } catch (error) {
      if (error.name === "AbortError") {
        console.error("Fetch request timed out")
        lastError = new Error("Request timed out after 30 seconds")
      } else {
        console.error("Fetch error:", error)
        lastError = error instanceof Error ? error : new Error(String(error))
      }
    }

    // Calculate backoff time
    const backoffTime = Math.pow(backoffFactor, attempt) * 1000
    console.log(`Retry attempt ${attempt + 1}/${retries} after ${backoffTime}ms`)
    await new Promise((resolve) => setTimeout(resolve, backoffTime))
  }

  throw lastError || new Error("Request failed after retries")
}

