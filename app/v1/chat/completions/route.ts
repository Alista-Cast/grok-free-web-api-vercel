import { type NextRequest, NextResponse } from "next/server"
import crypto from "crypto"

// Constants
const GROK_API_URL = "https://grok.x.com/2/grok/add_response.json"

// Conversation history store (in-memory for simplicity)
// Note: This will reset on each deployment or server restart
// For production, use a database like Vercel KV or another persistent store
const conversations: Record<string, any[]> = {}

// Role mappings
const SENDER_TO_ROLE: Record<number, string> = {
  1: "user",
  2: "assistant",
}

const ROLE_TO_SENDER: Record<string, number> = {
  user: 1,
  assistant: 2,
}

// Helper functions
function convertTweetLinks(message: string): string {
  // Match [link](#tweet=number) format
  const pattern = /\[link\]$$#tweet=(\d+)$$/g
  // Replace with [link](https://x.com/elonmusk/status/number)
  return message.replace(pattern, (_, tweetId) => `[link](https://x.com/elonmusk/status/${tweetId})`)
}

function encodeChatId(grokId: string | number): string {
  // Use SHA256 to generate a fixed-length hash
  const hash = crypto.createHash("sha256").update(String(grokId)).digest()
  // Take the first 24 bytes and convert to base64
  const b64Str = hash.slice(0, 24).toString("base64")
  // Replace special characters
  const cleanB64 = b64Str.replace(/\+/g, "x").replace(/\//g, "y").replace(/=/g, "z")
  return `chatcmpl-${cleanB64.slice(0, 32)}`
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  })
}

export async function POST(req: NextRequest) {
  console.log("Received request to /v1/chat/completions")

  try {
    // Parse request body
    let openaiRequestData
    try {
      openaiRequestData = await req.json()
      console.log("Request body:", JSON.stringify(openaiRequestData))
    } catch (e) {
      console.error("Failed to parse request body:", e)
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
    }

    // Check authorization header
    const authHeader = req.headers.get("authorization")
    if (!authHeader) {
      return NextResponse.json({ error: "Authorization header is missing" }, { status: 401 })
    }

    let authBearer, authToken
    try {
      const authParts = authHeader.split("Bearer ")[1].split(",")
      authBearer = authParts[0]
      authToken = authParts[1]
    } catch (e) {
      return NextResponse.json(
        { error: "Invalid Authorization header format. Expected 'Bearer $AUTH_BEARER,$AUTH_TOKEN'" },
        { status: 400 },
      )
    }

    // Validate request body
    if (!openaiRequestData || !openaiRequestData.messages) {
      return NextResponse.json({ error: "Invalid request body. Expected 'messages' in request body" }, { status: 400 })
    }

    const messages = openaiRequestData.messages
    if (!messages.length) {
      return NextResponse.json({ error: "'messages' cannot be empty" }, { status: 400 })
    }

    // Get or create conversation ID
    const conversationId = openaiRequestData.conversation_id || String(Date.now())

    // Initialize or retrieve conversation history
    if (!conversations[conversationId]) {
      conversations[conversationId] = []
      console.log(`New conversation started: ${conversationId}`)
    } else {
      console.log(`Continuing conversation: ${conversationId}`)
    }

    // Append new messages to conversation history
    conversations[conversationId] = [...conversations[conversationId], ...messages]

    // Prepare Grok request headers
    const grokRequestHeaders = {
      authorization: `Bearer ${authBearer}`,
      "content-type": "application/json; charset=UTF-8",
      "accept-encoding": "gzip, deflate, br, zstd",
      cookie: `auth_token=${authToken}`,
    }

    // Prepare Grok request body
    const grokRequestBody: any = {
      responses: [],
      grokModelOptionId: "grok-3", // default model
      isDeepsearch: false,
      isReasoning: false,
    }

    // Set model options based on requested model
    if (openaiRequestData.model === "grok-3t") {
      grokRequestBody.isReasoning = true
    }

    if (openaiRequestData.model === "grok-3ds") {
      grokRequestBody.isDeepsearch = true
    }

    // Construct Grok's 'responses' from conversation history
    for (const message of conversations[conversationId]) {
      grokRequestBody.responses.push({
        message: message.content,
        sender: ROLE_TO_SENDER[message.role] || 1, // Default to user
        fileAttachments: [],
      })
    }

    // Create a TransformStream for streaming the response
    const encoder = new TextEncoder()
    const stream = new TransformStream()
    const writer = stream.writable.getWriter()

    // Start processing in the background
    processGrokResponse(grokRequestHeaders, grokRequestBody, writer, conversationId).catch((error) => {
      console.error("Error processing Grok response:", error)
      const errorChunk = {
        error: {
          message: `Grok API request failed: ${error.message}`,
          type: "api_error",
          param: null,
          code: null,
        },
      }
      writer.write(encoder.encode(`data: ${JSON.stringify(errorChunk)}\n\n`))
      writer.write(encoder.encode("data: [DONE]\n\n"))
      writer.close()
    })

    // Return the stream response
    return new NextResponse(stream.readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    })
  } catch (error) {
    console.error("Unexpected error:", error)
    return NextResponse.json(
      { error: `Unexpected error: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 },
    )
  }
}

async function processGrokResponse(
  headers: Record<string, string>,
  body: any,
  writer: WritableStreamDefaultWriter<Uint8Array>,
  conversationId: string,
) {
  const encoder = new TextEncoder()
  let stopSignalSent = false

  try {
    // Make request to Grok API
    const response = await fetch(GROK_API_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      throw new Error(`Grok API returned ${response.status}: ${await response.text()}`)
    }

    if (!response.body) {
      throw new Error("Grok API returned no response body")
    }

    // Get creation timestamp
    const dateStr = response.headers.get("date")
    const openaiCreatedTime = dateStr ? Math.floor(new Date(dateStr).getTime() / 1000) : Math.floor(Date.now() / 1000)

    // Get or generate ID
    const grokId = response.headers.get("userChatItemId") || Date.now().toString()
    const openaiChunkId = encodeChatId(grokId)
    const openaiModel = body.grokModelOptionId

    // Process the stream
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""

    while (true) {
      const { done, value } = await reader.read()

      if (done) {
        break
      }

      // Decode the chunk and add to buffer
      buffer += decoder.decode(value, { stream: true })

      // Process complete lines in the buffer
      let lineEnd
      while ((lineEnd = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, lineEnd).trim()
        buffer = buffer.slice(lineEnd + 1)

        if (!line) continue

        try {
          const grokData = JSON.parse(line)

          if (grokData.result && "sender" in grokData.result) {
            const result = grokData.result
            const role = SENDER_TO_ROLE[result.sender] || "assistant"
            let messageContent = convertTweetLinks(result.message || "")

            // Check for thinking status
            const isThinking = result.isThinking || false
            if (isThinking) {
              messageContent = "<Thinking>\n" + messageContent + "\n</Thinking>\n\n"
            }

            const openaiChunk = {
              id: openaiChunkId,
              choices: [
                {
                  index: 0,
                  delta: { role, content: messageContent },
                  logprobs: null,
                  finish_reason: null,
                },
              ],
              created: openaiCreatedTime,
              model: openaiModel,
              object: "chat.completion.chunk",
            }

            await writer.write(encoder.encode(`data: ${JSON.stringify(openaiChunk)}\n\n`))

            // Append assistant's response to conversation history
            if (role === "assistant" && conversations[conversationId]) {
              conversations[conversationId].push({
                role: "assistant",
                content: messageContent,
              })
            }
          } else if (grokData.result && grokData.result.isSoftStop === true) {
            const openaiChunkStop = {
              id: openaiChunkId,
              choices: [
                {
                  index: 0,
                  delta: {},
                  logprobs: null,
                  finish_reason: "stop",
                },
              ],
              created: openaiCreatedTime,
              model: openaiModel,
              object: "chat.completion.chunk",
            }

            await writer.write(encoder.encode(`data: ${JSON.stringify(openaiChunkStop)}\n\n`))
            stopSignalSent = true
          }
        } catch (e) {
          console.warn(`Could not parse JSON: ${line}`, e)
        }
      }
    }

    // Send stop signal if not already sent
    if (!stopSignalSent) {
      const openaiChunkStop = {
        id: openaiChunkId,
        choices: [
          {
            index: 0,
            delta: {},
            logprobs: null,
            finish_reason: "stop",
          },
        ],
        created: openaiCreatedTime,
        model: openaiModel,
        object: "chat.completion.chunk",
      }

      await writer.write(encoder.encode(`data: ${JSON.stringify(openaiChunkStop)}\n\n`))
    }

    // Send done signal
    await writer.write(encoder.encode("data: [DONE]\n\n"))
  } catch (error) {
    throw error
  } finally {
    await writer.close()
  }
}

