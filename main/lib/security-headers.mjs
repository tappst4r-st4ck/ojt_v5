import "server-only";

export function securityHeadersMiddleware(request, response) {
  const headers = response.headers;

  // Prevent MIME type sniffing
  headers.set("X-Content-Type-Options", "nosniff");

  // Prevent clickjacking
  headers.set("X-Frame-Options", "DENY");

  // XSS protection (legacy but still useful for older browsers)
  headers.set("X-XSS-Protection", "1; mode=block");

  // Referrer policy
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  // Permissions policy (restrict powerful features)
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");

  // Content Security Policy
  const csp = [
    "default-src 'self'",
    // No 'unsafe-inline' for scripts: the dashboard loads only /tesda-main-screen.js and
    // Google sign-in. Styles keep 'unsafe-inline' for Google's button and the print frame.
    "script-src 'self' https://accounts.google.com https://apis.google.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data:",
    "connect-src 'self' https://accounts.google.com https://www.googleapis.com",
    "frame-src https://accounts.google.com",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
  ].join("; ");

  headers.set("Content-Security-Policy", csp);

  // HSTS (only in production)
  if (process.env.NODE_ENV === "production") {
    headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  }

  return response;
}

export function applySecurityHeaders(request, response) {
  return securityHeadersMiddleware(request, response);
}