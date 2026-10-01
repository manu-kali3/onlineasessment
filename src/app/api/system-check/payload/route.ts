export const dynamic = "force-dynamic";

/**
 * Fixed-size payload endpoint for the bandwidth probe. Streams zeros so the
 * client can measure real throughput without a cache or CDN shortcut.
 */
export async function GET() {
  const bytes = 262_144; // 256 KB
  const chunk = new Uint8Array(32_768);

  const stream = new ReadableStream({
    start(controller) {
      let sent = 0;
      while (sent < bytes) {
        controller.enqueue(chunk);
        sent += chunk.length;
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/octet-stream",
      "cache-control": "no-store, no-cache",
      "x-payload-bytes": String(bytes),
    },
  });
}