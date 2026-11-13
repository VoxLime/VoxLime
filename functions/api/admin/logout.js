
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

export async function onRequestPost({ request, env }) {
  const headers = {
    "Cache-Control": "no-store",
    "Set-Cookie":
      "vox_admin_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0"
  };

  try {
    const origin = request.headers.get("Origin");

    if (origin && origin !== new URL(request.url).origin) {
      return Response.json(
        { success: false, message: "Invalid request origin" },
        { status: 403, headers }
      );
    }

    const token = getCookie(request, "vox_admin_session");

    if (token && /^[a-f0-9]{64}$/i.test(token)) {
      const tokenHash = await sha256(token);

      await env.DB.prepare(`
        DELETE FROM admin_sessions
        WHERE token_hash = ?
      `)
        .bind(tokenHash)
        .run();
    }

    return Response.json(
      {
        success: true,
        message: "Logged out successfully"
      },
      { headers }
    );

  } catch (error) {
    console.error("ADMIN LOGOUT ERROR:", error);

    return Response.json(
      { success: false, message: "Logout failed" },
      { status: 500, headers }
    );
  }
}

