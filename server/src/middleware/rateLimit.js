import rateLimit from "express-rate-limit";
import { config } from "../config.js";

/**
 * Rate limiting, configurable via server/.env (see config.js rateLimits):
 *   RATE_LIMIT_WINDOW_MS       window length (default 60s)
 *   RATE_LIMIT_API             general API calls per window (default 300)
 *   RATE_LIMIT_OTP_REQUEST     OTP sends per IP (default 5/min)
 *   RATE_LIMIT_OTP_VERIFY      OTP verifications per IP (default 10/min)
 *   RATE_LIMIT_WORKER_LOGIN    worker password logins per IP (default 10/min)
 *   RATE_LIMIT_GOV_LOGIN       government logins per IP (default 10/min)
 *   RATE_LIMIT_REGISTER        registrations per IP (default 5/min)
 */

const { windowMs } = config.rateLimits;

const handler = (message) => (req, res) => {
  res.status(429).json({ detail: message });
};

function limiter(max, message) {
  return rateLimit({
    windowMs,
    limit: max,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler: handler(message),
  });
}

export const apiLimiter = limiter(
  config.rateLimits.api,
  "Too many requests from this address — please slow down."
);
export const otpRequestLimiter = limiter(
  config.rateLimits.otpRequest,
  "Too many OTP requests. Please try again in a minute."
);
export const otpVerifyLimiter = limiter(
  config.rateLimits.otpVerify,
  "Too many verification attempts. Please try again in a minute."
);
export const workerLoginLimiter = limiter(
  config.rateLimits.workerLogin,
  "Too many login attempts. Please try again in a minute."
);
export const governmentLoginLimiter = limiter(
  config.rateLimits.governmentLogin,
  "Too many login attempts. Please try again in a minute."
);
export const registerLimiter = limiter(
  config.rateLimits.register,
  "Too many registration attempts. Please try again in a minute."
);
