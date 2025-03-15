import { type NextRequest, NextResponse } from "next/server"
import { conversations, convertTweetLinks, encodeChatId, ROLE_TO_SENDER, SENDER_TO_ROLE } from "@/lib/grok-utils"
import { fetchWithRetry } from "@/lib/grok-utils"

// Grok API URL
const GROK_API_URL = "https://grok.x.com/2/grok/add_response.json"

export async function POST(request: NextRequest) {
  console.log(`Received request to ${request.nextUrl.pathname}`)

  try {
    // Parse request body
    let requestData
    try {
      requestData = await request.json()
      console.log("Request body parsed successfully")
    } catch (e) {
      console.error("Failed to parse request body:", e)
      return NextResponse.json({ error: { message: "Invalid request body. Could not parse JSON." } }, { status: 400 })
    }

    // Validate request body
    if (!requestData || !requestData.messages || !requestData.messages.length) {
      console.error("Invalid request body: missing or empty messages")
      return NextResponse.json(
        { error: { message: "Invalid request body. Expected non-empty 'messages' array." } },
        { status: 400 },
      )
    }

    // Get the last user message
    const lastUserMessage = [...requestData.messages].reverse().find((m) => m.role === "user")
    if (!lastUserMessage) {
      console.error("No user message found in the request")
      return NextResponse.json({ error: { message: "No user message found in the request." } }, { status: 400 })
    }

    // Check authentication
    const authHeader = request.headers.get("authorization")
    if (!authHeader) {
      console.error("Authorization header is missing")
      return NextResponse.json({ error: { message: "Authorization header is missing" } }, { status: 401 })
    }

    let authBearer, authToken
    try {
      ;[authBearer, authToken] = authHeader.split("Bearer ")[1].split(",")
    } catch (e) {
      console.error("Invalid Authorization header format:", e)
      return NextResponse.json(
        { error: { message: "Invalid Authorization header format. Expected 'Bearer $AUTH_BEARER,$AUTH_TOKEN'" } },
        { status: 400 },
      )
    }

    // Get the conversation ID if present, otherwise generate a new one
    const conversationId = requestData.conversation_id || `${Date.now()}`

    // Retrieve or initialize conversation history
    if (!conversations[conversationId]) {
      conversations[conversationId] = []
      console.log(`New conversation started: ${conversationId}`)
    } else {
      console.log(`Continuing conversation: ${conversationId}`)
    }

    // Append new messages to the conversation history
    conversations[conversationId] = [...conversations[conversationId], ...requestData.messages]

    // Prepare headers for Grok API
    const grokRequestHeaders = {
      authorization: `Bearer ${authBearer}`,
      "content-type": "application/json; charset=UTF-8",
      "accept-encoding": "gzip, deflate, br, zstd",
      cookie: `auth_token=${authToken}`,
    }

    // Prepare the request body for Grok
    const grokRequestBody = {
      responses: [],
      grokModelOptionId: "grok-3", // default model
      isDeepsearch: false,
      isReasoning: false,
    }

    // Check if the requested model is grok-3t
    if (requestData.model === "grok-3t") {
      grokRequestBody.isReasoning = true
    }

    // Check if the requested model is grok-3ds
    if (requestData.model === "grok-3ds") {
      grokRequestBody.isDeepsearch = true
    }

    // Construct Grok's 'responses' from the entire conversation history
    for (const message of conversations[conversationId]) {
      grokRequestBody.responses.push({
        message: message.content,
        sender: ROLE_TO_SENDER[message.role] || 1, // Default to user
        fileAttachments: [],
      })
    }

    // Check if streaming is requested
    const streamMode = requestData.stream || false
    console.log(`Stream mode: ${streamMode}`)

    if (streamMode) {
      // Handle streaming response
      console.log("Setting up streaming response")
      return handleStreamingResponse(grokRequestHeaders, grokRequestBody, conversationId)
    } else {
      // Handle non-streaming response
      console.log("Setting up non-streaming response")
      return handleNonStreamingResponse(grokRequestHeaders, grokRequestBody, conversationId)
    }
  } catch (error) {
    // Log the full error
    console.error("Unexpected error in /v1/chat/completions:", error)

    // Return a proper error response
    return NextResponse.json(
      {
        error: {
          message: `Server error: ${error instanceof Error ? error.message : String(error)}`,
          type: "server_error",
          stack: error instanceof Error ? error.stack : undefined,
        },
      },
      { status: 500 },
    )
  }
}

async function handleNonStreamingResponse(
  grokRequestHeaders: Record<string, string>,
  grokRequestBody: any,
  conversationId: string,
) {
  try {
    // Make request to Grok API
    const grokResponse = await fetchWithRetry(GROK_API_URL, {
      method: "POST",
      headers: grokRequestHeaders,
      body: JSON.stringify(grokRequestBody),
    })

    // Get response headers
    const dateHeader = grokResponse.headers.get("date")
    const openaiCreatedTime = dateHeader
      ? Math.floor(new Date(dateHeader).getTime() / 1000)
      : Math.floor(Date.now() / 1000)

    const userChatItemId = grokResponse.headers.get("userChatItemId") || Date.now().toString()
    const openaiChunkId = encodeChatId(userChatItemId)
    const openaiModel = grokRequestBody.grokModelOptionId

    // Read the response as a stream
    const reader = grokResponse.body?.getReader()
    if (!reader) {
      throw new Error("No response body from Grok API")
    }

    // Accumulate all response content
    let fullContent = ""
    const decoder = new TextDecoder()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = decoder.decode(value)
      const lines = chunk.split("\n")

      for (const line of lines) {
        if (!line.trim()) continue

        try {
          const grokData = JSON.parse(line)
          if (grokData.result && "sender" in grokData.result) {
            const result = grokData.result
            // Check if sender is ASSISTANT (string) or 2 (number)
            if (result.sender === "ASSISTANT" || result.sender === 2) {
              const messageContent = convertTweetLinks(result.message || "")
              const isThinking = result.isThinking || false

              // Only accumulate non-thinking content
              if (!isThinking && messageContent) {
                fullContent += messageContent
              }
            }
          }
        } catch (e) {
          console.warn("Could not parse JSON from Grok response:", line)
        }
      }
    }

    // If no content was received, provide a default response
    if (!fullContent) {
      fullContent = "Sorry, I couldn't generate a response at this time. Please try again later."
    }

    // Add the assistant's response to conversation history
    conversations[conversationId].push({
      role: "assistant",
      content: fullContent,
    })

    // Build the OpenAI format response
    const openai_response = {
      id: openaiChunkId,
      object: "chat.completion",
      created: openaiCreatedTime,
      model: openaiModel,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: fullContent,
          },
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: Math.floor(JSON.stringify(grokRequestBody.responses).length / 4),
        completion_tokens: Math.floor(fullContent.length / 4),
        total_tokens: Math.floor((JSON.stringify(grokRequestBody.responses).length + fullContent.length) / 4),
      },
    }

    return NextResponse.json(openai_response)
  } catch (error) {
    console.error("Error in non-streaming response:", error)
    return NextResponse.json(
      {
        error: {
          message: `Grok API request failed: ${error instanceof Error ? error.message : String(error)}`,
          type: "api_error",
        },
      },
      { status: 500 },
    )
  }
}

async function handleStreamingResponse(
  grokRequestHeaders: Record<string, string>,
  grokRequestBody: any,
  conversationId: string,
) {
  try {
    // Create a stream for the response
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder()

        try {
          // Make request to Grok API
          const grokResponse = await fetchWithRetry(GROK_API_URL, {
            method: "POST",
            headers: grokRequestHeaders,
            body: JSON.stringify(grokRequestBody),
          })

          // Get response headers
          const dateHeader = grokResponse.headers.get("date")
          const openaiCreatedTime = dateHeader
            ? Math.floor(new Date(dateHeader).getTime() / 1000)
            : Math.floor(Date.now() / 1000)

          const userChatItemId = grokResponse.headers.get("userChatItemId") || Date.now().toString()
          const openaiChunkId = encodeChatId(userChatItemId)
          const openaiModel = grokRequestBody.grokModelOptionId

          // Read the response as a stream
          const reader = grokResponse.body?.getReader()
          if (!reader) {
            throw new Error("No response body from Grok API")
          }

          // Track if stop signal has been sent
          let stopSignalSent = false
          const decoder = new TextDecoder()

          // Variables to track thinking state
          let isCurrentlyThinking = false
          let accumulatedThinking = ""
          let normalContent = ""

          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            const chunk = decoder.decode(value)
            const lines = chunk.split("\n")

            for (const line of lines) {
              if (!line.trim()) continue

              try {
                const grokData = JSON.parse(line)

                if (grokData.result && "sender" in grokData.result) {
                  const result = grokData.result

                  // Determine the role
                  let role = SENDER_TO_ROLE[result.sender] || "assistant"
                  if (result.sender === "ASSISTANT") {
                    role = "assistant"
                  }

                  // Convert tweet links in the message
                  const messageContent = convertTweetLinks(result.message || "")

                  // Check if this is a thinking message
                  const isThinking = result.isThinking || false

                  // Handle thinking state transitions
                  if (isThinking && !isCurrentlyThinking) {
                    // Starting to think - send opening tag
                    isCurrentlyThinking = true
                    accumulatedThinking = messageContent

                    // Send the opening thinking tag
                    const openingThinkingChunk = {
                      id: openaiChunkId,
                      object: "chat.completion.chunk",
                      created: openaiCreatedTime,
                      model: openaiModel,
                      choices: [
                        {
                          index: 0,
                          delta: { content: "<think>\n" },
                          finish_reason: null,
                        },
                      ],
                    }
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(openingThinkingChunk)}\n\n`))

                    // Send the first thinking content
                    const thinkingContentChunk = {
                      id: openaiChunkId,
                      object: "chat.completion.chunk",
                      created: openaiCreatedTime,
                      model: openaiModel,
                      choices: [
                        {
                          index: 0,
                          delta: { content: messageContent },
                          finish_reason: null,
                        },
                      ],
                    }
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(thinkingContentChunk)}\n\n`))
                  } else if (isThinking && isCurrentlyThinking) {
                    // Continue thinking - accumulate content
                    accumulatedThinking += messageContent

                    // Send the continuing thinking content
                    const thinkingContentChunk = {
                      id: openaiChunkId,
                      object: "chat.completion.chunk",
                      created: openaiCreatedTime,
                      model: openaiModel,
                      choices: [
                        {
                          index: 0,
                          delta: { content: messageContent },
                          finish_reason: null,
                        },
                      ],
                    }
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(thinkingContentChunk)}\n\n`))
                  } else if (!isThinking && isCurrentlyThinking) {
                    // Finished thinking - send closing tag
                    isCurrentlyThinking = false

                    // Send the closing thinking tag
                    const closingThinkingChunk = {
                      id: openaiChunkId,
                      object: "chat.completion.chunk",
                      created: openaiCreatedTime,
                      model: openaiModel,
                      choices: [
                        {
                          index: 0,
                          delta: { content: "\n</think>\n\n" },
                          finish_reason: null,
                        },
                      ],
                    }
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(closingThinkingChunk)}\n\n`))

                    // Now send the normal content if there is any
                    if (messageContent) {
                      normalContent += messageContent
                      const normalContentChunk = {
                        id: openaiChunkId,
                        object: "chat.completion.chunk",
                        created: openaiCreatedTime,
                        model: openaiModel,
                        choices: [
                          {
                            index: 0,
                            delta: { content: messageContent },
                            finish_reason: null,
                          },
                        ],
                      }
                      controller.enqueue(encoder.encode(`data: ${JSON.stringify(normalContentChunk)}\n\n`))
                    }
                  } else if (!isThinking && !isCurrentlyThinking) {
                    // Normal content - just send it
                    normalContent += messageContent

                    // Create the OpenAI format chunk for normal content
                    const openaiChunk = {
                      id: openaiChunkId,
                      object: "chat.completion.chunk",
                      created: openaiCreatedTime,
                      model: openaiModel,
                      choices: [
                        {
                          index: 0,
                          delta: { role, content: messageContent },
                          finish_reason: null,
                        },
                      ],
                    }

                    // Send the chunk
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(openaiChunk)}\n\n`))
                  }

                  // Add assistant's response to conversation history (only normal content)
                  if (role === "assistant" && !isThinking && messageContent) {
                    // We'll add the complete message at the end
                  }
                } else if (grokData.result && "isSoftStop" in grokData.result && grokData.result.isSoftStop === true) {
                  // If we're still in thinking mode, close it
                  if (isCurrentlyThinking) {
                    isCurrentlyThinking = false
                    const closingThinkingChunk = {
                      id: openaiChunkId,
                      object: "chat.completion.chunk",
                      created: openaiCreatedTime,
                      model: openaiModel,
                      choices: [
                        {
                          index: 0,
                          delta: { content: "\n</think>\n\n" },
                          finish_reason: null,
                        },
                      ],
                    }
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(closingThinkingChunk)}\n\n`))
                  }

                  // Send stop signal
                  const openaiChunkStop = {
                    id: openaiChunkId,
                    object: "chat.completion.chunk",
                    created: openaiCreatedTime,
                    model: openaiModel,
                    choices: [
                      {
                        index: 0,
                        delta: {},
                        finish_reason: "stop",
                      },
                    ],
                  }
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(openaiChunkStop)}\n\n`))
                  stopSignalSent = true
                }
              } catch (e) {
                console.warn("Could not parse JSON from Grok response:", line)
              }
            }
          }

          // If we're still in thinking mode, close it
          if (isCurrentlyThinking) {
            isCurrentlyThinking = false
            const closingThinkingChunk = {
              id: openaiChunkId,
              object: "chat.completion.chunk",
              created: openaiCreatedTime,
              model: openaiModel,
              choices: [
                {
                  index: 0,
                  delta: { content: "\n</think>\n\n" },
                  finish_reason: null,
                },
              ],
            }
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(closingThinkingChunk)}\n\n`))
          }

          // If no stop signal was sent, send one now
          if (!stopSignalSent) {
            const openaiChunkStop = {
              id: openaiChunkId,
              object: "chat.completion.chunk",
              created: openaiCreatedTime,
              model: openaiModel,
              choices: [
                {
                  index: 0,
                  delta: {},
                  finish_reason: "stop",
                },
              ],
            }
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(openaiChunkStop)}\n\n`))
          }

          // Add the complete normal content to conversation history
          if (normalContent) {
            conversations[conversationId].push({
              role: "assistant",
              content: normalContent,
            })
          }

          // Send the [DONE] message
          controller.enqueue(encoder.encode("data: [DONE]\n\n"))
        } catch (error) {
          console.error("Error in streaming response:", error)

          // Send error as a chunk
          const errorChunk = {
            error: {
              message: `Grok API request failed: ${error instanceof Error ? error.message : String(error)}`,
              type: "api_error",
              param: null,
              code: null,
            },
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorChunk)}\n\n`))
          controller.enqueue(encoder.encode("data: [DONE]\n\n"))
        } finally {
          controller.close()
        }
      },
    })

    // Return the stream
    return new NextResponse(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    })
  } catch (error) {
    console.error("Error setting up streaming response:", error)
    return NextResponse.json(
      {
        error: {
          message: `Failed to set up streaming response: ${error instanceof Error ? error.message : String(error)}`,
          type: "server_error",
        },
      },
      { status: 500 },
    )
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
  })
}

