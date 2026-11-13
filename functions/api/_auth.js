

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

export async function getAdminSession(request, env) {
  try {
    if (!env.DB) return null;

    const token = getCookie(request, "vox_admin_session");

    if (!token || !/^[a-f0-9]{64}$/i.test(token)) {
      return null;
    }

    const tokenHash = await sha256(token);
    const now = new Date().toISOString();

    const admin = await env.DB.prepare(`
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

    if (!admin) return null;

    return {
      id: admin.id,
      username: admin.username,
      expiresAt: admin.expires_at
    };

  } catch (error) {
    console.error("ADMIN AUTH ERROR:", error);
    return null;
  }
}
