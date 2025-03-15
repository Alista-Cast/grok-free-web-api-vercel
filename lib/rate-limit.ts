// A simple in-memory rate limiter
// For production, use a Redis-based solution

type RateLimitInfo = {
  count: number
  resetAt: number
}

const RATE_LIMIT_DURATION = 60 * 1000 // 1 minute in milliseconds
const MAX_REQUESTS = 10 // 10 requests per minute

const rateLimits = new Map<string, RateLimitInfo>()

export async function rateLimit(identifier: string) {
  const now = Date.now()

  // Clean up expired rate limits
  for (const [key, info] of rateLimits.entries()) {
    if (info.resetAt < now) {
      rateLimits.delete(key)
    }
  }

  // Get or create rate limit info for this identifier
  let rateLimitInfo = rateLimits.get(identifier)

  if (!rateLimitInfo || rateLimitInfo.resetAt < now) {
    // Create new rate limit info
    rateLimitInfo = {
      count: 0,
      resetAt: now + RATE_LIMIT_DURATION,
    }
    rateLimits.set(identifier, rateLimitInfo)
  }

  // Increment count
  rateLimitInfo.count++

  // Check if rate limit is exceeded
  const success = rateLimitInfo.count <= MAX_REQUESTS

  return {
    success,
    limit: MAX_REQUESTS,
    remaining: Math.max(0, MAX_REQUESTS - rateLimitInfo.count),
    reset: Math.ceil(rateLimitInfo.resetAt / 1000), // Return as Unix timestamp
  }
}

