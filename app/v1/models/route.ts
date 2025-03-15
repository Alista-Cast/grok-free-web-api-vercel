import { NextResponse } from "next/server"

// Constants - matching the exact models from the Python script
const MODELS = [
  {
    id: "grok-3",
    object: "model",
    created: 1145141919,
    owned_by: "yilongma",
  },
  {
    id: "grok-3t",
    object: "model",
    created: 1145141919,
    owned_by: "yilongma",
  },
  {
    id: "grok-3ds",
    object: "model",
    created: 1145141919,
    owned_by: "yilongma",
  },
]

export async function GET() {
  // Return the models in the same format as the Python implementation
  return NextResponse.json({ object: "list", data: MODELS })
}

// Handle OPTIONS requests for CORS
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  })
}

