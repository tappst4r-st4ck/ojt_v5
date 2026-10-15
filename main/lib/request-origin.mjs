export function isSameOriginMutation(request) {
  const origin = request.headers.get("origin");
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost?.split(",")[0].trim() || request.headers.get("host");
  const forwardedProtocol = request.headers.get("x-forwarded-proto");
  const protocol = forwardedProtocol?.split(",")[0].trim() || new URL(request.url).protocol.slice(0, -1);
  if (!origin || !host || !protocol) return false;
  try {
    return origin === new URL(`${protocol}://${host}`).origin;
  } catch {
    return false;
  }
}
