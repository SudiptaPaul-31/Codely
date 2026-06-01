type RateLimitOptions = {
  windowMs: number;
  max: number;
};

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const store = new Map<string, RateLimitEntry>();

export function rateLimit(key: string, options: RateLimitOptions) {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    store.set(key, {
      count: 1,
      resetAt: now + options.windowMs,
    });

    return { allowed: true };
  }

  if (entry.count >= options.max) {
    return {
      allowed: false,
      error: "Rate limit exceeded",
      limit: options.max,
      window: `${options.windowMs / 1000}s`,
    };
  }

  entry.count += 1;
  return { allowed: true };
}