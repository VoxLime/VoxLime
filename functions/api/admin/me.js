
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

    if (key === name) {
      return value;
    }
  }

  return null;
}

export async function onRequestGet({ request, env }) {
  try {
    if (!env.DB) {
      return Response.json(
        { success: false, authenticated: false },
        { status: 500 }
      );
    }

    const token = getCookie(request, "vox_admin_session");

    if (!token || !/^[a-f0-9]{64}$/i.test(token)) {
      return Response.json(
        { success: true, authenticated: false },
        {
          status: 401,
          headers: { "Cache-Control": "no-store" }
        }
      );
    }

    const tokenHash = await sha256(token);
    const now = new Date().toISOString();

    const session = await env.DB.prepare(`
      SELECT
        admin_users.id,
        admin_users.username,
        admin_sessions.expires_at
      FROM admin_sessions
      INNER JOIN admin_users
        ON admin_users.id = admin_sessions.admin_id
      WHERE admin_sessions.token_hash = ?
        AND admin_sessions.expires_at > ?
      LIMIT 1
    `)
      .bind(tokenHash, now)
      .first();

    if (!session) {
      return Response.json(
        { success: true, authenticated: false },
        {
          status: 401,
          headers: { "Cache-Control": "no-store" }
        }
      );
    }

    return Response.json(
      {
        success: true,
        authenticated: true,
        admin: {
          id: session.id,
          username: session.username
        },
        expiresAt: session.expires_at
      },
      {
        headers: { "Cache-Control": "no-store" }
      }
    );

  } catch (error) {
    console.error("ADMIN SESSION ERROR:", error);

    return Response.json(
      { success: false, authenticated: false },
      {
        status: 500,
        headers: { "Cache-Control": "no-store" }
      }
    );
  }
}

