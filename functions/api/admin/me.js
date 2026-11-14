
async function sha256(value) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );

  return Array.from(new Uint8Array(digest), b =>
    b.toString(16).padStart(2, "0")
  ).join("");
}

function getCookie(request, name) {
  const cookieHeader = request.headers.get("Cookie") || "";

  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;

    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();

    if (key === name) return value;
  }

  return null;
}

export async function onRequestGet({ request, env }) {
  try {
    const token = getCookie(request, "vox_admin_session");

    const result = {
      cookiePresent: Boolean(token),
      tokenFormatValid: Boolean(
        token && /^[a-f0-9]{64}$/i.test(token)
      ),
      databaseAvailable: Boolean(env.DB)
    };

    if (!env.DB || !token || !/^[a-f0-9]{64}$/i.test(token)) {
      return Response.json(result, {
        headers: { "Cache-Control": "no-store" }
      });
    }

    const tokenHash = await sha256(token);
    const now = new Date().toISOString();

    const total = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM admin_sessions"
    ).first();

    const session = await env.DB.prepare(`
      SELECT
        id,
        admin_id,
        expires_at,
        CASE WHEN expires_at > ? THEN 1 ELSE 0 END AS is_active
      FROM admin_sessions
      WHERE token_hash = ?
      LIMIT 1
    `).bind(now, tokenHash).first();

    return Response.json({
      ...result,
      totalSessions: total.count,
      hashMatched: Boolean(session),
      sessionActive: session ? Boolean(session.is_active) : false,
      matchedSessionId: session?.id ?? null,
      matchedAdminId: session?.admin_id ?? null
    }, {
      headers: { "Cache-Control": "no-store" }
    });

  } catch (error) {
    console.error("AUTH DIAGNOSTIC ERROR:", error);

    return Response.json({
      diagnosticError: true,
      message: "Diagnostic query failed"
    }, {
      status: 500,
      headers: { "Cache-Control": "no-store" }
    });
  }
}
