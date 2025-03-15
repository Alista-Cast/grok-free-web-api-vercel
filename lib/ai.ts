import { ReadableStream } from "stream/web"

// Types for our chat completion functions
export type Message = {
  role: "system" | "user" | "assistant"
  content: string
}

export type CompletionOptions = {
  model: string
  messages: Message[]
  temperature?: number
  max_tokens?: number
}

export type CompletionResponse = {
  id: string
  object: string
  created: number
  model: string
  choices: Array<{
    index: number
    message: Message
    finish_reason: string
  }>
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

/**
 * Generate a chat completion response
 */
export async function generateChatCompletion(options: CompletionOptions): Promise<CompletionResponse> {
  // In a real implementation, this would call an AI service
  // For this example, we'll simulate a response

  const { model, messages, temperature = 1, max_tokens } = options

  // Simulate processing time
  await new Promise((resolve) => setTimeout(resolve, 500))

  // Get the last user message
  const lastUserMessage = [...messages].reverse().find((m) => m.role === "user")

  if (!lastUserMessage) {
    throw new Error("No user message found")
  }

  // Generate a simple response based on the last user message
  const responseContent = `I received your message: "${lastUserMessage.content}". This is a simulated response.`

  // Calculate token usage (simplified)
  const promptTokens = messages.reduce((acc, m) => acc + m.content.length / 4, 0)
  const completionTokens = responseContent.length / 4

  return {
    id: `chatcmpl-${Date.now().toString(36)}${Math.random().toString(36).substr(2, 5)}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: responseContent,
        },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: Math.ceil(promptTokens),
      completion_tokens: Math.ceil(completionTokens),
      total_tokens: Math.ceil(promptTokens + completionTokens),
    },
  }
}

/**
 * Generate a streaming chat completion response
 */
export async function generateChatCompletionStream(options: CompletionOptions): Promise<ReadableStream> {
  const { model, messages } = options

  // Get the last user message
  const lastUserMessage = [...messages].reverse().find((m) => m.role === "user")

  if (!lastUserMessage) {
    throw new Error("No user message found")
  }

  // Generate a simple response based on the last user message
  const responseContent = `I received your message: "${lastUserMessage.content}". This is a simulated streaming response.`

  // Create a response ID
  const responseId = `chatcmpl-${Date.now().toString(36)}${Math.random().toString(36).substr(2, 5)}`

  // Create a streaming response
  return new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()

      // Send the initial response with role
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            id: responseId,
            object: "chat.completion.chunk",
            created: Math.floor(Date.now() / 1000),
            model,
            choices: [
              {
                index: 0,
                delta: {
                  role: "assistant",
                },
                finish_reason: null,
              },
            ],
          })}\n\n`,
        ),
      )

      // Wait a bit to simulate processing
      await new Promise((resolve) => setTimeout(resolve, 300))

      // Split the response into words and stream them
      const words = responseContent.split(" ")

      for (const word of words) {
        // Send each word as a chunk
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              id: responseId,
              object: "chat.completion.chunk",
              created: Math.floor(Date.now() / 1000),
              model,
              choices: [
                {
                  index: 0,
                  delta: {
                    content: word + " ",
                  },
                  finish_reason: null,
                },
              ],
            })}\n\n`,
          ),
        )

        // Wait a bit between words to simulate typing
        await new Promise((resolve) => setTimeout(resolve, 100))
      }

      // Send the completion message
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            id: responseId,
            object: "chat.completion.chunk",
            created: Math.floor(Date.now() / 1000),
            model,
            choices: [
              {
                index: 0,
                delta: {},
                finish_reason: "stop",
              },
            ],
          })}\n\n`,
        ),
      )

      // Send the [DONE] message
      controller.enqueue(encoder.encode("data: [DONE]\n\n"))

      // Close the stream
      controller.close()
    },
  })
}

