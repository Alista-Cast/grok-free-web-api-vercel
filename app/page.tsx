export default function Home() {
  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-4">Grok API Proxy</h1>
      <p className="mb-4 text-lg">
        This service provides an OpenAI-compatible API interface for Grok AI models, connecting to the official Grok
        API.
      </p>

      <div className="mb-8">
        <h2 className="text-2xl font-semibold mt-6 mb-2">Available Endpoints:</h2>
        <ul className="list-disc pl-6 space-y-2">
          <li>
            <code className="bg-gray-100 px-2 py-1 rounded">/v1/models</code> - Get available models
          </li>
          <li>
            <code className="bg-gray-100 px-2 py-1 rounded">/v1/chat/completions</code> - Chat completion API
            (OpenAI-compatible)
          </li>
        </ul>
      </div>

      <div className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Authentication</h2>
        <p className="mb-4">
          Authentication requires a special format with both bearer token and auth token from Grok:
        </p>
        <div className="bg-gray-100 p-4 rounded-md mb-4">
          <code>Authorization: Bearer YOUR_BEARER_TOKEN,YOUR_AUTH_TOKEN</code>
        </div>
        <p className="text-gray-700">
          You can obtain these tokens by logging into Grok and extracting them from your browser's network requests.
          <strong> Both tokens are required for the API to work properly.</strong>
        </p>
      </div>

      <div className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Example Request</h2>
        <pre className="bg-gray-100 p-4 rounded-md overflow-x-auto">
          {`POST /v1/chat/completions
Content-Type: application/json
Authorization: Bearer YOUR_BEARER_TOKEN,YOUR_AUTH_TOKEN

{
  "model": "grok-3",
  "messages": [
    {"role": "user", "content": "Hello, how are you?"}
  ],
  "stream": true
}`}
        </pre>
      </div>

      <div className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Available Models</h2>
        <ul className="list-disc pl-6 space-y-2">
          <li>
            <strong>grok-3</strong> - Standard Grok model
          </li>
          <li>
            <strong>grok-3t</strong> - Grok model with reasoning capabilities
          </li>
          <li>
            <strong>grok-3ds</strong> - Grok model with deep search capabilities
          </li>
        </ul>
      </div>

      <div className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Conversation History</h2>
        <p className="mb-4">
          The API maintains conversation history for each session. You can include a <code>conversation_id</code> in
          your requests to continue an existing conversation.
        </p>
        <p className="text-gray-700">If no conversation ID is provided, a new one will be generated automatically.</p>
      </div>

      <div>
        <h2 className="text-2xl font-semibold mb-4">Try It Out</h2>
        <a
          href="/test-client"
          className="inline-block bg-blue-600 text-white px-6 py-3 rounded-md hover:bg-blue-700 transition-colors"
        >
          Go to Test Client
        </a>
      </div>
    </div>
  )
}

