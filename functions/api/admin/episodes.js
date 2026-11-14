
import { getAdminSession } from "../_auth.js";

function json(data, status = 200) {
  return Response.json(data, status === 200 ? undefined : { status });
}

async function requireAdmin(request, env) {
  return await getAdminSession(request, env);
}

function validId(value) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

function normalizeSources(sources) {
  if (sources === undefined) return null;
  if (!Array.isArray(sources) || sources.length > 20) return null;

  const normalized = [];

  for (const source of sources) {
    if (!source || !["direct", "provider"].includes(source.source_type)) {
      return null;
    }

    const sourceUrl = String(source.source_url || "").trim();

    if (sourceUrl.length > 2048) return null;

    try {
      const parsed = new URL(sourceUrl);

      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        return null;
      }
    } catch {
      return null;
    }

    const priority = Number(source.priority ?? 1);

    if (!Number.isSafeInteger(priority) || priority < 1 || priority > 1000) {
      return null;
    }

    normalized.push({
      source_type: source.source_type,
      source_url: sourceUrl,
      is_active: source.is_active === false || source.is_active === 0 ? 0 : 1,
      priority
    });
  }

  return normalized;
}

async function replaceSources(db, episodeId, sources) {
  await db.prepare(`
    DELETE FROM video_sources WHERE episode_id = ?
  `).bind(episodeId).run();

  for (const source of sources) {
    await db.prepare(`
      INSERT INTO video_sources (
        episode_id,
        source_type,
        source_url,
        is_active,
        priority
      )
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      episodeId,
      source.source_type,
      source.source_url,
      source.is_active,
      source.priority
    ).run();
  }
}

// GET: List episodes
// Optional: ?season_id=1 or ?anime_id=1
export async function onRequestGet({ request, env }) {
  try {
    const admin = await requireAdmin(request, env);

    if (!admin) {
      return json({ success: false, message: "Unauthorized" }, 401);
    }

    const url = new URL(request.url);
    const seasonId = url.searchParams.get("season_id");
    const animeId = url.searchParams.get("anime_id");

    let query = `
      SELECT
        episodes.id,
        episodes.season_id,
        episodes.episode_number,
        episodes.title,
        episodes.description,
        episodes.thumbnail_url,
        episodes.status,
        episodes.created_at,
        episodes.updated_at,
        seasons.anime_id,
        seasons.season_number,
        seasons.title AS season_title,
        anime.title AS anime_title
      FROM episodes
      INNER JOIN seasons ON seasons.id = episodes.season_id
      INNER JOIN anime ON anime.id = seasons.anime_id
    `;

    const conditions = [];
    const bindings = [];

    if (seasonId) {
      const id = validId(seasonId);
      if (!id) return json({ success: false, message: "Invalid season ID" }, 400);
      conditions.push("episodes.season_id = ?");
      bindings.push(id);
    }

    if (animeId) {
      const id = validId(animeId);
      if (!id) return json({ success: false, message: "Invalid anime ID" }, 400);
      conditions.push("seasons.anime_id = ?");
      bindings.push(id);
    }

    if (conditions.length) {
      query += " WHERE " + conditions.join(" AND ");
    }

    query += " ORDER BY anime.title, seasons.season_number, episodes.episode_number";

    const result = await env.DB.prepare(query).bind(...bindings).all();

    const episodeIds = result.results.map(row => row.id);
    let sources = [];

    if (episodeIds.length) {
      const placeholders = episodeIds.map(() => "?").join(",");

      const sourceResult = await env.DB.prepare(`
        SELECT id, episode_id, source_type, source_url, is_active, priority
        FROM video_sources
        WHERE episode_id IN (${placeholders})
        ORDER BY priority ASC, id ASC
      `).bind(...episodeIds).all();

      sources = sourceResult.results;
    }

    const sourceMap = new Map();

    for (const source of sources) {
      if (!sourceMap.has(source.episode_id)) {
        sourceMap.set(source.episode_id, []);
      }

      sourceMap.get(source.episode_id).push(source);
    }

    const episodes = result.results.map(episode => ({
      ...episode,
      video_sources: sourceMap.get(episode.id) || []
    }));

    return json({
      success: true,
      count: episodes.length,
      episodes
    });

  } catch (error) {
    console.error("ADMIN EPISODES GET ERROR:", error);
    return json({ success: false, message: "Unable to load episodes" }, 500);
  }
}

// POST: Create episode and optional video sources
export async function onRequestPost({ request, env }) {
  try {
    const admin = await requireAdmin(request, env);

    if (!admin) {
      return json({ success: false, message: "Unauthorized" }, 401);
    }

    const body = await request.json();

    const seasonId = validId(body.season_id);
    const episodeNumber = validId(body.episode_number);
    const title = String(body.title || "").trim();
    const description = String(body.description || "").trim();
    const thumbnailUrl = String(body.thumbnail_url || "").trim();
    const status = body.status || "draft";

    if (!seasonId || !episodeNumber || !title) {
      return json({
        success: false,
        message: "Season ID, episode number and title are required"
      }, 400);
    }

    if (title.length > 300 || description.length > 10000 || thumbnailUrl.length > 2048) {
      return json({ success: false, message: "Input is too long" }, 400);
    }

    if (!["draft", "published"].includes(status)) {
      return json({ success: false, message: "Invalid episode status" }, 400);
    }

    if (thumbnailUrl) {
      try {
        const parsed = new URL(thumbnailUrl);
        if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
      } catch {
        return json({ success: false, message: "Invalid thumbnail URL" }, 400);
      }
    }

    const sources = body.video_sources === undefined
      ? []
      : normalizeSources(body.video_sources);

    if (sources === null) {
      return json({ success: false, message: "Invalid video sources" }, 400);
    }

    const season = await env.DB.prepare(`
      SELECT id FROM seasons WHERE id = ? LIMIT 1
    `).bind(seasonId).first();

    if (!season) {
      return json({ success: false, message: "Season not found" }, 404);
    }

    const statements = [
      env.DB.prepare(`
        INSERT INTO episodes (
          season_id, episode_number, title,
          description, thumbnail_url, status
        )
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(
        seasonId,
        episodeNumber,
        title,
        description,
        thumbnailUrl,
        status
      )
    ];

    for (const source of sources) {
      statements.push(
        env.DB.prepare(`
          INSERT INTO video_sources (
            episode_id, source_type, source_url, is_active, priority
          )
          SELECT id, ?, ?, ?, ?
          FROM episodes
          WHERE season_id = ?
            AND episode_number = ?
        `).bind(
          source.source_type,
          source.source_url,
          source.is_active,
          source.priority,
          seasonId,
          episodeNumber
        )
      );
    }

    const results = await env.DB.batch(statements);
    const episodeId = results[0].meta.last_row_id;

    return json({
      success: true,
      message: "Episode created successfully",
      episode: {
        id: episodeId,
        season_id: seasonId,
        episode_number: episodeNumber,
        title,
        description,
        thumbnail_url: thumbnailUrl,
        status,
        video_sources: sources
      }
    }, 201);

  } catch (error) {
    console.error("ADMIN EPISODES POST ERROR:", error);

    if (String(error.message).includes("UNIQUE")) {
      return json({
        success: false,
        message: "This episode number already exists in this season"
      }, 409);
    }

    return json({ success: false, message: "Unable to create episode" }, 500);
  }
}

// PATCH: Update episode and optionally replace all its sources
export async function onRequestPatch({ request, env }) {
  try {
    const admin = await requireAdmin(request, env);

    if (!admin) {
      return json({ success: false, message: "Unauthorized" }, 401);
    }

    const body = await request.json();

    const id = validId(body.id);
    const episodeNumber = validId(body.episode_number);
    const title = String(body.title || "").trim();
    const description = String(body.description || "").trim();
    const thumbnailUrl = String(body.thumbnail_url || "").trim();
    const status = body.status || "draft";

    if (!id || !episodeNumber || !title) {
      return json({
        success: false,
        message: "Episode ID, episode number and title are required"
      }, 400);
    }

    if (title.length > 300 || description.length > 10000 || thumbnailUrl.length > 2048) {
      return json({ success: false, message: "Input is too long" }, 400);
    }

    if (!["draft", "published"].includes(status)) {
      return json({ success: false, message: "Invalid episode status" }, 400);
    }

    if (thumbnailUrl) {
      try {
        const parsed = new URL(thumbnailUrl);
        if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
      } catch {
        return json({ success: false, message: "Invalid thumbnail URL" }, 400);
      }
    }

    const existing = await env.DB.prepare(`
      SELECT id FROM episodes WHERE id = ? LIMIT 1
    `).bind(id).first();

    if (!existing) {
      return json({ success: false, message: "Episode not found" }, 404);
    }

    let sources = null;

    if (body.video_sources !== undefined) {
      sources = normalizeSources(body.video_sources);

      if (sources === null) {
        return json({ success: false, message: "Invalid video sources" }, 400);
      }
    }

    const statements = [
      env.DB.prepare(`
        UPDATE episodes
        SET episode_number = ?,
            title = ?,
            description = ?,
            thumbnail_url = ?,
            status = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(
        episodeNumber,
        title,
        description,
        thumbnailUrl,
        status,
        id
      )
    ];

    if (sources !== null) {
      statements.push(
        env.DB.prepare(`DELETE FROM video_sources WHERE episode_id = ?`).bind(id)
      );

      for (const source of sources) {
        statements.push(
          env.DB.prepare(`
            INSERT INTO video_sources (
              episode_id, source_type, source_url, is_active, priority
            )
            VALUES (?, ?, ?, ?, ?)
          `).bind(
            id,
            source.source_type,
            source.source_url,
            source.is_active,
            source.priority
          )
        );
      }
    }

    await env.DB.batch(statements);

    return json({
      success: true,
      message: "Episode updated successfully"
    });

  } catch (error) {
    console.error("ADMIN EPISODES PATCH ERROR:", error);

    if (String(error.message).includes("UNIQUE")) {
      return json({
        success: false,
        message: "This episode number already exists in this season"
      }, 409);
    }

    return json({ success: false, message: "Unable to update episode" }, 500);
  }
}

// DELETE: Delete episode and its video sources
export async function onRequestDelete({ request, env }) {
  try {
    const admin = await requireAdmin(request, env);

    if (!admin) {
      return json({ success: false, message: "Unauthorized" }, 401);
    }

    const url = new URL(request.url);
    const id = validId(url.searchParams.get("id"));

    if (!id) {
      return json({ success: false, message: "Valid episode ID is required" }, 400);
    }

    const result = await env.DB.prepare(`
      DELETE FROM episodes WHERE id = ?
    `).bind(id).run();

    if (!result.meta.changes) {
      return json({ success: false, message: "Episode not found" }, 404);
    }

    return json({
      success: true,
      message: "Episode and its video sources deleted successfully"
    });

  } catch (error) {
    console.error("ADMIN EPISODES DELETE ERROR:", error);
    return json({ success: false, message: "Unable to delete episode" }, 500);
  }
}
