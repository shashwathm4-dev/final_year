/**
 * Rate limiters.
 * - Per-user limiters (keyed by the verified uid) must run AFTER requireAuth.
 * - If no user is attached, the key falls back to the client IP.
 */
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

function createLimiter({ windowMs, limit, message }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => (req.user && req.user.uid ? `u:${req.user.uid}` : `ip:${ipKeyGenerator(req.ip)}`),
    handler: (req, res) => {
      res.status(429).json({
        error: message || 'Too many requests, please slow down',
        source: 'rate_limited',
      });
    },
  });
}

// Broad guard on every /api request (IP based, runs before auth)
const globalLimiter = createLimiter({ windowMs: 60 * 1000, limit: 300, message: 'Too many requests from this network' });

// Gemini calls are expensive: per user
const verifyLimiter = createLimiter({ windowMs: 60 * 1000, limit: 10, message: 'AI check rate limit reached' });

// Rep logging while exercising (one rep every few seconds is normal)
const logRepLimiter = createLimiter({ windowMs: 60 * 1000, limit: 90 });

// Other writes: sessions, assignments, exercises, profile, privacy actions
const writeLimiter = createLimiter({ windowMs: 60 * 1000, limit: 60 });

module.exports = { createLimiter, globalLimiter, verifyLimiter, logRepLimiter, writeLimiter };
