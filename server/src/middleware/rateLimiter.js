const rateLimit = require('express-rate-limit');

/**
 * General API rate limiter — 200 requests per 15 minutes per IP.
 */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
  skip: () => process.env.NODE_ENV === 'test',
});

/**
 * Strict limiter for application submission — 10 per hour per IP.
 * Prevents abuse of the apply endpoint.
 */
const applyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many applications submitted. Please try again in an hour.' },
  keyGenerator: (req) => req.ip,
  skip: () => process.env.NODE_ENV === 'test' || process.env.STRESS_TEST === 'true',
});

module.exports = { apiLimiter, applyLimiter };
