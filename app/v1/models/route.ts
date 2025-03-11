import { NextResponse } from "next/server"

// Constants
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
  return NextResponse.json({ object: "list", data: MODELS })
}

