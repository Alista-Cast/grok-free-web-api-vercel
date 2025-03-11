import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export function middleware(request: NextRequest) {
  console.log(`Middleware processing: ${request.method} ${request.nextUrl.pathname}`)

  // Handle CORS preflight requests
  if (request.method === "OPTIONS") {
    return NextResponse.json(
      {},
      {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Access-Control-Max-Age": "86400",
        },
      },
    )
  }

  // Add CORS headers to all responses
  const response = NextResponse.next()
  response.headers.set("Access-Control-Allow-Origin", "*")

  return response
}

// Only apply middleware to API routes
export const config = {
  matcher: "/api/:path*",
}

