import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export function middleware(request: NextRequest) {
  console.log(`Middleware processing: ${request.method} ${request.nextUrl.pathname}`)

  try {
    // Handle CORS preflight requests
    if (request.method === "OPTIONS") {
      return new NextResponse(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "*", // Allow all headers
          "Access-Control-Max-Age": "86400",
        },
      })
    }

    // Add CORS headers to all responses
    const response = NextResponse.next()
    response.headers.set("Access-Control-Allow-Origin", "*")
    response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    response.headers.set("Access-Control-Allow-Headers", "*") // Allow all headers

    return response
  } catch (error) {
    console.error("Middleware error:", error)

    // Return a JSON error response
    return NextResponse.json(
      {
        error: {
          message: `Internal server error in middleware: ${error instanceof Error ? error.message : String(error)}`,
          stack: error instanceof Error ? error.stack : undefined,
        },
      },
      {
        status: 500,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json",
        },
      },
    )
  }
}

// Apply middleware to v1 routes
export const config = {
  matcher: ["/v1/:path*"],
}

