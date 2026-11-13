
const SESSION_DURATION_HOURS = 168;

function toHex(bytes) {
  return Array.from(bytes, b =>
    b.toString(16).padStart(2, "0")
  ).join("");
}

function fromHex(hex) {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2 !== 0) {
    throw new Error("Invalid hash format");
  }

  return new Uint8Array(
    hex.match(/.{2}/g).map(byte => parseInt(byte, 16))
  );
}

async function sha256(value) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );

  return toHex(new Uint8Array(digest));
}

async function verifyPassword(password, storedHash) {
  const parts = storedHash.split("$");

  if (parts.length !== 4 || parts[0] !== "pbkdf2") {
    return false;
  }

  const iterations = Number(parts[1]);

  // Cloudflare WebCrypto runtime limit
  if (
    !Number.isInteger(iterations) ||
    iterations < 1 ||
    iterations > 100000
  ) {
    return false;
  }

  const salt = fromHex(parts[2]);
  const expectedHash = fromHex(parts[3]);

  if (expectedHash.length !== 32) {
    return false;
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt,
      iterations
    },
    key,
    256
  );

  const actualHash = new Uint8Array(derivedBits);

  let difference = 0;

  for (let i = 0; i < expectedHash.length; i++) {
    difference |= actualHash[i] ^ expectedHash[i];
  }

  return difference === 0;
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return toHex(bytes);
}

export async function onRequestPost({ request, env }) {
  try {
    if (!env.DB) {
      return Response.json(
        { success: false, message: "Server configuration error" },
        { status: 500 }
      );
    }

    // Reject cross-origin login submissions
    const origin = request.headers.get("Origin");

    if (origin && origin !== new URL(request.url).origin) {
      return Response.json(
        { success: false, message: "Invalid request origin" },
        { status: 403 }
      );
    }

    let body;

    try {
      body = await request.json();
    } catch {
      return Response.json(
        { success: false, message: "Invalid request body" },
        { status: 400 }
      );
    }

    const username = body.username;
    const password = body.password;

    if (
      typeof username !== "string" ||
      typeof password !== "string" ||
      username.length < 1 ||
      username.length > 100 ||
      password.length < 16 ||
      password.length > 256
    ) {
      return Response.json(
        { success: false, message: "Invalid username or password" },
        { status: 400 }
      );
    }

    const admin = await env.DB.prepare(
      "SELECT id, username, password_hash FROM admin_users WHERE username = ? LIMIT 1"
    )
      .bind(username)
      .first();

    if (!admin) {
      return Response.json(
        { success: false, message: "Invalid username or password" },
        { status: 401 }
      );
    }

    const validPassword = await verifyPassword(
      password,
      admin.password_hash
    );

    if (!validPassword) {
      return Response.json(
        { success: false, message: "Invalid username or password" },
        { status: 401 }
      );
    }

    // Create a cryptographically random session token
    const token = randomToken();
    const tokenHash = await sha256(token);

    const expiresAt = new Date(
      Date.now() + SESSION_DURATION_HOURS * 60 * 60 * 1000
    ).toISOString();

    // Remove expired sessions belonging to this admin
    await env.DB.prepare(
      "DELETE FROM admin_sessions WHERE admin_id = ? AND expires_at <= ?"
    )
      .bind(admin.id, new Date().toISOString())
      .run();

    // Store only the hashed session token
    await env.DB.prepare(
      `INSERT INTO admin_sessions
       (admin_id, token_hash, expires_at)
       VALUES (?, ?, ?)`
    )
      .bind(admin.id, tokenHash, expiresAt)
      .run();

    const headers = new Headers();

    headers.set(
      "Set-Cookie",
      `vox_admin_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${SESSION_DURATION_HOURS * 60 * 60}`
    );

    headers.set("Cache-Control", "no-store");

    return Response.json(
      {
        success: true,
        message: "Login successful",
        admin: {
          id: admin.id,
          username: admin.username
        },
        expiresAt
      },
      {
        status: 200,
        headers
      }
    );

  } catch (error) {
    console.error("ADMIN LOGIN ERROR:", error);

    return Response.json(
      { success: false, message: "Unable to process login" },
      { status: 500 }
    );
  }
}

