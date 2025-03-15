"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Info } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

// Standard OpenAI-compatible endpoint
const API_ENDPOINT = "/v1/chat/completions"

export default function TestClient() {
  const [message, setMessage] = useState("Hello, how are you?")
  const [model, setModel] = useState("grok-3")
  const [stream, setStream] = useState(false)
  const [response, setResponse] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [bearerToken, setBearerToken] = useState("")
  const [authToken, setAuthToken] = useState("")
  const [tokenError, setTokenError] = useState(false)
  const [requestDetails, setRequestDetails] = useState<any>(null)
  const [responseDetails, setResponseDetails] = useState<any>(null)
  const [rawResponse, setRawResponse] = useState("")

  const handleSubmit = async () => {
    if (!message.trim()) return

    // Reset state
    setTokenError(false)
    setLoading(true)
    setResponse("")
    setError("")
    setRequestDetails(null)
    setResponseDetails(null)
    setRawResponse("")

    try {
      // Prepare request details for debugging
      const requestBody = {
        model,
        messages: [{ role: "user", content: message }],
        stream,
      }

      // Prepare headers - we'll include auth if provided, but it's not required for mock mode
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      }

      // Add authorization header if both tokens are provided
      if (bearerToken && authToken) {
        headers["Authorization"] = `Bearer ${bearerToken},${authToken}`
      }

      setRequestDetails({
        url: API_ENDPOINT,
        method: "POST",
        headers: { ...headers },
        body: JSON.stringify(requestBody, null, 2),
      })

      console.log(`Sending request to ${API_ENDPOINT}`)
      const res = await fetch(API_ENDPOINT, {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
      })

      // Save response details for debugging
      setResponseDetails({
        status: res.status,
        statusText: res.statusText,
        headers: Object.fromEntries([...res.headers.entries()]),
      })
      console.log("Response status:", res.status, res.statusText)

      if (!res.ok) {
        // Read the response as text first
        const textResponse = await res.text()
        console.error("Error response:", textResponse)
        setRawResponse(textResponse)

        // Try to parse as JSON if it looks like JSON
        let errorMessage = textResponse
        if (textResponse.trim().startsWith("{")) {
          try {
            const errorData = JSON.parse(textResponse)
            errorMessage = errorData.error?.message || JSON.stringify(errorData)
          } catch (e) {
            // If parsing fails, use the text response as is
            console.warn("Failed to parse error response as JSON:", e)
          }
        }

        throw new Error(`Server error (${res.status}): ${errorMessage}`)
      }

      if (stream) {
        // Handle streaming response
        console.log("Processing streaming response")

        // Use the ReadableStream API directly
        const reader = res.body?.getReader()
        if (!reader) throw new Error("No response body")

        const decoder = new TextDecoder()
        let responseText = ""
        let rawResponseText = ""

        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            const chunk = decoder.decode(value)
            console.log("Received chunk:", chunk)
            rawResponseText += chunk
            setRawResponse((prev) => prev + chunk)

            // Process SSE format
            const lines = chunk.split("\n\n")
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
        } catch (streamError) {
          console.error("Error reading stream:", streamError)
          throw new Error(`Error reading stream: ${streamError.message}`)
        }
      } else {
        // Handle regular response - read as text first
        console.log("Processing regular response")
        const textResponse = await res.text()
        setRawResponse(textResponse)
        console.log("Response text:", textResponse.substring(0, 200) + (textResponse.length > 200 ? "..." : ""))

        try {
          // Try to parse as JSON
          const data = JSON.parse(textResponse)
          console.log("Parsed JSON response:", data)

          if (data.choices && data.choices[0] && data.choices[0].message) {
            setResponse(data.choices[0].message.content)
          } else {
            console.warn("Unexpected response format:", data)
            setResponse(JSON.stringify(data, null, 2))
          }
        } catch (jsonError) {
          // If JSON parsing fails, use the text response
          console.error("Failed to parse response as JSON:", jsonError)
          setResponse(textResponse)
        }
      }
    } catch (err) {
      console.error("Error in handleSubmit:", err)
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
          <CardDescription>Test the Grok API with your own credentials (optional)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <Alert className="bg-blue-50 border-blue-200">
              <Info className="h-4 w-4 text-blue-500" />
              <AlertDescription className="text-blue-700">
                This client uses the standard OpenAI-compatible endpoint: <code>/v1/chat/completions</code>
              </AlertDescription>
            </Alert>

            <div className="space-y-4">
              <h3 className="text-lg font-medium">Authentication (Optional)</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="bearer-token">Bearer Token</Label>
                  <Input
                    id="bearer-token"
                    value={bearerToken}
                    onChange={(e) => setBearerToken(e.target.value)}
                    placeholder="Your Grok Bearer Token (optional)"
                    className="w-full"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="auth-token">Auth Token</Label>
                  <Input
                    id="auth-token"
                    value={authToken}
                    onChange={(e) => setAuthToken(e.target.value)}
                    placeholder="Your Grok Auth Token (optional)"
                    className="w-full"
                  />
                </div>
              </div>

              <div className="text-sm text-gray-500 mt-1">
                <p>
                  Format: <code>Bearer YOUR_BEARER_TOKEN,YOUR_AUTH_TOKEN</code>
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-medium">Request Options</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="model">Model</Label>
                  <Select value={model} onValueChange={setModel}>
                    <SelectTrigger id="model">
                      <SelectValue placeholder="Select a model" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="grok-3">Grok 3</SelectItem>
                      <SelectItem value="grok-3t">Grok 3 Think</SelectItem>
                      <SelectItem value="grok-3ds">Grok 3 DeepSearch</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center space-x-2 pt-8">
                  <Switch id="stream" checked={stream} onCheckedChange={setStream} />
                  <Label htmlFor="stream">Stream response</Label>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="message">Your message</Label>
              <Textarea
                id="message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                className="w-full"
              />
            </div>

            <Button onClick={handleSubmit} disabled={loading || !message.trim()} className="w-full">
              {loading ? "Sending..." : "Send to Grok"}
            </Button>

            {error && (
              <div className="p-4 bg-red-50 text-red-700 rounded-md">
                <p className="font-medium">Error:</p>
                <p>{error}</p>

                <div className="mt-4">
                  <p className="font-medium">Request Details:</p>
                  <pre className="text-xs mt-2 overflow-auto p-2 bg-red-100 rounded">
                    {JSON.stringify(requestDetails, null, 2)}
                  </pre>
                </div>

                {responseDetails && (
                  <div className="mt-4">
                    <p className="font-medium">Response Details:</p>
                    <pre className="text-xs mt-2 overflow-auto p-2 bg-red-100 rounded">
                      {JSON.stringify(responseDetails, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}

            {(response || rawResponse) && (
              <div className="space-y-2">
                <Tabs defaultValue="formatted">
                  <TabsList>
                    <TabsTrigger value="formatted">Formatted Response</TabsTrigger>
                    <TabsTrigger value="raw">Raw Response</TabsTrigger>
                  </TabsList>
                  <TabsContent value="formatted">
                    <div className="p-4 bg-gray-50 rounded-md whitespace-pre-wrap">{response}</div>
                  </TabsContent>
                  <TabsContent value="raw">
                    <pre className="p-4 bg-gray-50 rounded-md overflow-auto text-xs">{rawResponse}</pre>
                  </TabsContent>
                </Tabs>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

