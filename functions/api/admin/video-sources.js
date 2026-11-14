
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

function validSourceType(value) {
  return ["direct", "provider"].includes(value);
}

function validUrl(value) {
  if (typeof value !== "string" || !value.trim() || value.length > 2048) {
    return false;
  }

  try {
    const parsed = new URL(value.trim());
    return ["http:", "https:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}

function validPriority(value) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 1 && n <= 1000;
}

function normalizeActive(value) {
  if (value === true || value === 1) return 1;
  if (value === false || value === 0) return 0;
  return null;
}

// GET: List video sources
// Optional: ?episode_id=1
export async function onRequestGet({ request, env }) {
  try {
    const admin = await requireAdmin(request, env);

    if (!admin) {
      return json({ success: false, message: "Unauthorized" }, 401);
    }

    const url = new URL(request.url);
    const episodeIdParam = url.searchParams.get("episode_id");

    let result;

    if (episodeIdParam !== null) {
      const episodeId = validId(episodeIdParam);

      if (!episodeId) {
        return json({ success: false, message: "Invalid episode ID" }, 400);
      }

      result = await env.DB.prepare(`
        SELECT
          video_sources.id,
          video_sources.episode_id,
          video_sources.source_type,
          video_sources.source_url,
          video_sources.is_active,
          video_sources.priority,
          video_sources.created_at,
          episodes.episode_number,
          episodes.title AS episode_title,
          seasons.season_number,
          anime.title AS anime_title
        FROM video_sources
        INNER JOIN episodes
          ON episodes.id = video_sources.episode_id
        INNER JOIN seasons
          ON seasons.id = episodes.season_id
        INNER JOIN anime
          ON anime.id = seasons.anime_id
        WHERE video_sources.episode_id = ?
        ORDER BY video_sources.priority ASC, video_sources.id ASC
      `).bind(episodeId).all();

    } else {
      result = await env.DB.prepare(`
        SELECT
          video_sources.id,
          video_sources.episode_id,
          video_sources.source_type,
          video_sources.source_url,
          video_sources.is_active,
          video_sources.priority,
          video_sources.created_at,
          episodes.episode_number,
          episodes.title AS episode_title,
          seasons.season_number,
          anime.title AS anime_title
        FROM video_sources
        INNER JOIN episodes
          ON episodes.id = video_sources.episode_id
        INNER JOIN seasons
          ON seasons.id = episodes.season_id
        INNER JOIN anime
          ON anime.id = seasons.anime_id
        ORDER BY
          anime.title ASC,
          seasons.season_number ASC,
          episodes.episode_number ASC,
          video_sources.priority ASC
      `).all();
    }

    return json({
      success: true,
      count: result.results.length,
      video_sources: result.results
    });

  } catch (error) {
    console.error("ADMIN VIDEO SOURCES GET ERROR:", error);

    return json({
      success: false,
      message: "Unable to load video sources"
    }, 500);
  }
}

// POST: Add a video source
export async function onRequestPost({ request, env }) {
  try {
    const admin = await requireAdmin(request, env);

    if (!admin) {
      return json({ success: false, message: "Unauthorized" }, 401);
    }

    const body = await request.json();

    const episodeId = validId(body.episode_id);
    const sourceType = body.source_type;
    const sourceUrl = String(body.source_url || "").trim();
    const priority = body.priority === undefined ? 1 : Number(body.priority);
    const isActive = body.is_active === undefined
      ? 1
      : normalizeActive(body.is_active);

    if (!episodeId) {
      return json({ success: false, message: "Valid episode ID is required" }, 400);
    }

    if (!validSourceType(sourceType)) {
      return json({ success: false, message: "Invalid source type" }, 400);
    }

    if (!validUrl(sourceUrl)) {
      return json({ success: false, message: "Valid HTTP or HTTPS source URL is required" }, 400);
    }

    if (!validPriority(priority)) {
      return json({ success: false, message: "Priority must be between 1 and 1000" }, 400);
    }

    if (isActive === null) {
      return json({ success: false, message: "Invalid active status" }, 400);
    }

    const episode = await env.DB.prepare(`
      SELECT id FROM episodes WHERE id = ? LIMIT 1
    `).bind(episodeId).first();

    if (!episode) {
      return json({ success: false, message: "Episode not found" }, 404);
    }

    const result = await env.DB.prepare(`
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
      sourceType,
      sourceUrl,
      isActive,
      priority
    ).run();

    return json({
      success: true,
      message: "Video source added successfully",
      video_source: {
        id: result.meta.last_row_id,
        episode_id: episodeId,
        source_type: sourceType,
        source_url: sourceUrl,
        is_active: isActive,
        priority
      }
    }, 201);

  } catch (error) {
    console.error("ADMIN VIDEO SOURCES POST ERROR:", error);

    return json({
      success: false,
      message: "Unable to add video source"
    }, 500);
  }
}

// PATCH: Edit source, change active status or priority
export async function onRequestPatch({ request, env }) {
  try {
    const admin = await requireAdmin(request, env);

    if (!admin) {
      return json({ success: false, message: "Unauthorized" }, 401);
    }

    const body = await request.json();
    const id = validId(body.id);

    if (!id) {
      return json({ success: false, message: "Valid source ID is required" }, 400);
    }

    const existing = await env.DB.prepare(`
      SELECT id, source_type, source_url, is_active, priority
      FROM video_sources
      WHERE id = ?
      LIMIT 1
    `).bind(id).first();

    if (!existing) {
      return json({ success: false, message: "Video source not found" }, 404);
    }

    const sourceType = body.source_type === undefined
      ? existing.source_type
      : body.source_type;

    const sourceUrl = body.source_url === undefined
      ? existing.source_url
      : String(body.source_url).trim();

    const priority = body.priority === undefined
      ? existing.priority
      : Number(body.priority);

    const isActive = body.is_active === undefined
      ? existing.is_active
      : normalizeActive(body.is_active);

    if (!validSourceType(sourceType)) {
      return json({ success: false, message: "Invalid source type" }, 400);
    }

    if (!validUrl(sourceUrl)) {
      return json({ success: false, message: "Valid HTTP or HTTPS source URL is required" }, 400);
    }

    if (!validPriority(priority)) {
      return json({ success: false, message: "Priority must be between 1 and 1000" }, 400);
    }

    if (isActive === null) {
      return json({ success: false, message: "Invalid active status" }, 400);
    }

    await env.DB.prepare(`
      UPDATE video_sources
      SET source_type = ?,
          source_url = ?,
          is_active = ?,
          priority = ?
      WHERE id = ?
    `).bind(
      sourceType,
      sourceUrl,
      isActive,
      priority,
      id
    ).run();

    return json({
      success: true,
      message: "Video source updated successfully",
      video_source: {
        id,
        source_type: sourceType,
        source_url: sourceUrl,
        is_active: isActive,
        priority
      }
    });

  } catch (error) {
    console.error("ADMIN VIDEO SOURCES PATCH ERROR:", error);

    return json({
      success: false,
      message: "Unable to update video source"
    }, 500);
  }
}

// DELETE: Remove a video source
export async function onRequestDelete({ request, env }) {
  try {
    const admin = await requireAdmin(request, env);

    if (!admin) {
      return json({ success: false, message: "Unauthorized" }, 401);
    }

    const url = new URL(request.url);
    const id = validId(url.searchParams.get("id"));

    if (!id) {
      return json({ success: false, message: "Valid source ID is required" }, 400);
    }

    const result = await env.DB.prepare(`
      DELETE FROM video_sources WHERE id = ?
    `).bind(id).run();

    if (!result.meta.changes) {
      return json({ success: false, message: "Video source not found" }, 404);
    }

    return json({
      success: true,
      message: "Video source deleted successfully"
    });

  } catch (error) {
    console.error("ADMIN VIDEO SOURCES DELETE ERROR:", error);

    return json({
      success: false,
      message: "Unable to delete video source"
    }, 500);
  }
}
