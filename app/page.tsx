export default function Home() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Grok API Proxy</h1>
      <p className="mb-4">This is a proxy service that converts OpenAI API requests to Grok API requests.</p>
      <h2 className="text-xl font-semibold mt-6 mb-2">Available Endpoints:</h2>
      <ul className="list-disc pl-6">
        <li className="mb-2">
          <code className="bg-gray-100 px-2 py-1 rounded">/v1/models</code> - Get available models
        </li>
        <li className="mb-2">
          <code className="bg-gray-100 px-2 py-1 rounded">/v1/chat/completions</code> - Chat completions API
        </li>
      </ul>
    </div>
  )
}

