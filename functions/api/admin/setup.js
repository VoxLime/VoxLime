
function toHex(bytes) {
  return Array.from(bytes)
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function hashPassword(password, salt) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt,
      iterations: 310000
    },
    key,
    256
  );

  return toHex(new Uint8Array(bits));
}

export async function onRequestPost({ request, env }) {
  try {
    if (!env.DB || !env.ADMIN_INITIAL_PASSWORD) {
      return Response.json({
        success: false,
        message: "Server configuration missing"
      }, { status: 500 });
    }

    const body = await request.json();

    if (
      body.username !== "voxadmin" ||
      typeof body.password !== "string" ||
      body.password.length < 16 ||
      body.password !== env.ADMIN_INITIAL_PASSWORD
    ) {
      return Response.json({
        success: false,
        message: "Invalid setup credentials"
      }, { status: 403 });
    }

    const existing = await env.DB.prepare(
      "SELECT id FROM admin_users LIMIT 1"
    ).first();

    if (existing) {
      return Response.json({
        success: false,
        message: "Admin account already initialized"
      }, { status: 409 });
    }

    const salt = crypto.getRandomValues(new Uint8Array(16));
    const passwordHash = await hashPassword(body.password, salt);

    const storedHash =
      "pbkdf2$310000$" + toHex(salt) + "$" + passwordHash;

    await env.DB.prepare(`
      INSERT INTO admin_users (username, password_hash)
      VALUES (?, ?)
    `).bind("voxadmin", storedHash).run();

    return Response.json({
      success: true,
      message: "Admin account created successfully"
    });

  } catch (error) {
    console.error("ADMIN SETUP ERROR:", error);

    return Response.json({
      success: false,
      message: "Setup failed. Check Cloudflare Function Logs."
    }, { status: 500 });
  }
}
