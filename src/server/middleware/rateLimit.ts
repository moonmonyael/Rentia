import { Request, Response, NextFunction } from 'express';

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

// In-memory rate limiting store mapped by IP and bucket
const rateLimitStores = new Map<string, Map<string, RateLimitRecord>>();

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || '127.0.0.1';
}

export function createRateLimiter(bucketName: string, maxRequests: number, windowMs: number, customMessage: string) {
  if (!rateLimitStores.has(bucketName)) {
    rateLimitStores.set(bucketName, new Map<string, RateLimitRecord>());
  }
  const bucket = rateLimitStores.get(bucketName)!;

  return (req: Request, res: Response, next: NextFunction) => {
    const ip = getClientIp(req);
    const now = Date.now();

    const record = bucket.get(ip);

    if (!record || now > record.resetAt) {
      bucket.set(ip, {
        count: 1,
        resetAt: now + windowMs,
      });
      next();
      return;
    }

    if (record.count >= maxRequests) {
      const waitMinutes = Math.ceil((record.resetAt - now) / 60000);
      res.status(429).json({
        error: customMessage || `Trop de tentatives. Veuillez réessayer dans ${waitMinutes} minute(s).`,
      });
      return;
    }

    record.count += 1;
    next();
  };
}

// 20 login attempts per 15 minutes per IP
export const loginRateLimiter = createRateLimiter(
  'login',
  20,
  15 * 60 * 1000,
  'Trop de tentatives de connexion. Veuillez patienter avant de réessayer.'
);

// 15 landlord code lookup / confirm attempts per 10 minutes per IP
export const landlordCodeRateLimiter = createRateLimiter(
  'landlord_code',
  15,
  10 * 60 * 1000,
  'Trop de tentatives avec des codes. Veuillez patienter quelques minutes.'
);
