"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"

export default function TestClient() {
  const [input, setInput] = useState("Hello, how are you?")
  const [response, setResponse] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const handleSubmit = async () => {
    setLoading(true)
    setResponse("")
    setError("")

    try {
      const res = await fetch("/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer YOUR_BEARER_TOKEN,YOUR_AUTH_TOKEN", // Replace with your tokens
        },
        body: JSON.stringify({
          model: "grok-3",
          messages: [{ role: "user", content: input }],
          stream: true,
        }),
      })

      if (!res.ok) {
        const errorText = await res.text()
        throw new Error(`API error: ${res.status} - ${errorText}`)
      }

      const reader = res.body?.getReader()
      if (!reader) throw new Error("No response body")

      const decoder = new TextDecoder()
      let responseText = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        console.log("Received chunk:", chunk)

        // Process SSE format
        const lines = chunk.split("\n")
        for (const line of lines) {
          if (line.startsWith("data: ") && line !== "data: [DONE]") {
            try {
              const data = JSON.parse(line.substring(6))
              if (data.choices && data.choices[0].delta && data.choices[0].delta.content) {
                responseText += data.choices[0].delta.content
                setResponse(responseText)
              }
            } catch (e) {
              console.warn("Failed to parse chunk:", line, e)
            }
          }
        }
      }
    } catch (err) {
      console.error("Error:", err)
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container mx-auto p-4 max-w-3xl">
      <Card>
        <CardHeader>
          <CardTitle>Grok API Test Client</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <label className="block mb-2 text-sm font-medium">Your message:</label>
              <Textarea value={input} onChange={(e) => setInput(e.target.value)} rows={4} className="w-full" />
            </div>

            <Button onClick={handleSubmit} disabled={loading || !input.trim()} className="w-full">
              {loading ? "Sending..." : "Send to Grok"}
            </Button>

            {error && (
              <div className="p-4 bg-red-50 text-red-700 rounded-md">
                <p className="font-medium">Error:</p>
                <p>{error}</p>
              </div>
            )}

            {response && (
              <div>
                <label className="block mb-2 text-sm font-medium">Response:</label>
                <div className="p-4 bg-gray-50 rounded-md whitespace-pre-wrap">{response}</div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

