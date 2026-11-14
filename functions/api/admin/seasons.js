
import { getAdminSession } from "../_auth.js";

function json(data, status = 200) {
  return Response.json(data, { status });
}

async function requireAdmin(request, env) {
  const admin = await getAdminSession(request, env);
  return admin;
}

// GET: Season list
// Optional: ?anime_id=1
export async function onRequestGet({ request, env }) {
  try {
    const admin = await requireAdmin(request, env);

    if (!admin) {
      return json({
        success: false,
        message: "Unauthorized"
      }, 401);
    }

    const url = new URL(request.url);
    const animeId = url.searchParams.get("anime_id");

    let result;

    if (animeId) {
      if (!/^[1-9]\d*$/.test(animeId)) {
        return json({
          success: false,
          message: "Invalid anime ID"
        }, 400);
      }

      result = await env.DB.prepare(`
        SELECT
          seasons.id,
          seasons.anime_id,
          seasons.season_number,
          seasons.title,
          seasons.created_at,
          anime.title AS anime_title,
          (
            SELECT COUNT(*)
            FROM episodes
            WHERE episodes.season_id = seasons.id
          ) AS episode_count
        FROM seasons
        INNER JOIN anime
          ON anime.id = seasons.anime_id
        WHERE seasons.anime_id = ?
        ORDER BY seasons.season_number ASC
      `).bind(Number(animeId)).all();

    } else {
      result = await env.DB.prepare(`
        SELECT
          seasons.id,
          seasons.anime_id,
          seasons.season_number,
          seasons.title,
          seasons.created_at,
          anime.title AS anime_title,
          (
            SELECT COUNT(*)
            FROM episodes
            WHERE episodes.season_id = seasons.id
          ) AS episode_count
        FROM seasons
        INNER JOIN anime
          ON anime.id = seasons.anime_id
        ORDER BY anime.title ASC, seasons.season_number ASC
      `).all();
    }

    return json({
      success: true,
      count: result.results.length,
      seasons: result.results
    });

  } catch (error) {
    console.error("ADMIN SEASONS GET ERROR:", error);

    return json({
      success: false,
      message: "Unable to load seasons"
    }, 500);
  }
}

// POST: Create season
export async function onRequestPost({ request, env }) {
  try {
    const admin = await requireAdmin(request, env);

    if (!admin) {
      return json({
        success: false,
        message: "Unauthorized"
      }, 401);
    }

    const body = await request.json();

    const animeId = Number(body.anime_id);
    const seasonNumber = Number(body.season_number);
    const title = String(body.title || "").trim();

    if (
      !Number.isSafeInteger(animeId) ||
      animeId < 1 ||
      !Number.isSafeInteger(seasonNumber) ||
      seasonNumber < 1
    ) {
      return json({
        success: false,
        message: "Valid anime ID and season number are required"
      }, 400);
    }

    if (title.length > 200) {
      return json({
        success: false,
        message: "Season title is too long"
      }, 400);
    }

    const anime = await env.DB.prepare(`
      SELECT id FROM anime WHERE id = ? LIMIT 1
    `).bind(animeId).first();

    if (!anime) {
      return json({
        success: false,
        message: "Anime not found"
      }, 404);
    }

    const result = await env.DB.prepare(`
      INSERT INTO seasons (
        anime_id,
        season_number,
        title
      )
      VALUES (?, ?, ?)
    `).bind(animeId, seasonNumber, title).run();

    return json({
      success: true,
      message: "Season created successfully",
      season: {
        id: result.meta.last_row_id,
        anime_id: animeId,
        season_number: seasonNumber,
        title
      }
    }, 201);

  } catch (error) {
    console.error("ADMIN SEASONS POST ERROR:", error);

    if (String(error.message).includes("UNIQUE")) {
      return json({
        success: false,
        message: "This season number already exists for this anime"
      }, 409);
    }

    return json({
      success: false,
      message: "Unable to create season"
    }, 500);
  }
}

// PATCH: Update season
export async function onRequestPatch({ request, env }) {
  try {
    const admin = await requireAdmin(request, env);

    if (!admin) {
      return json({
        success: false,
        message: "Unauthorized"
      }, 401);
    }

    const body = await request.json();

    const id = Number(body.id);
    const seasonNumber = Number(body.season_number);
    const title = String(body.title || "").trim();

    if (
      !Number.isSafeInteger(id) || id < 1 ||
      !Number.isSafeInteger(seasonNumber) || seasonNumber < 1
    ) {
      return json({
        success: false,
        message: "Valid season ID and season number are required"
      }, 400);
    }

    if (title.length > 200) {
      return json({
        success: false,
        message: "Season title is too long"
      }, 400);
    }

    const existing = await env.DB.prepare(`
      SELECT id FROM seasons WHERE id = ? LIMIT 1
    `).bind(id).first();

    if (!existing) {
      return json({
        success: false,
        message: "Season not found"
      }, 404);
    }

    await env.DB.prepare(`
      UPDATE seasons
      SET season_number = ?,
          title = ?
      WHERE id = ?
    `).bind(seasonNumber, title, id).run();

    return json({
      success: true,
      message: "Season updated successfully"
    });

  } catch (error) {
    console.error("ADMIN SEASONS PATCH ERROR:", error);

    if (String(error.message).includes("UNIQUE")) {
      return json({
        success: false,
        message: "This season number already exists for this anime"
      }, 409);
    }

    return json({
      success: false,
      message: "Unable to update season"
    }, 500);
  }
}

// DELETE: Delete season and its episodes
export async function onRequestDelete({ request, env }) {
  try {
    const admin = await requireAdmin(request, env);

    if (!admin) {
      return json({
        success: false,
        message: "Unauthorized"
      }, 401);
    }

    const url = new URL(request.url);
    const id = Number(url.searchParams.get("id"));

    if (!Number.isSafeInteger(id) || id < 1) {
      return json({
        success: false,
        message: "Valid season ID is required"
      }, 400);
    }

    const result = await env.DB.prepare(`
      DELETE FROM seasons WHERE id = ?
    `).bind(id).run();

    if (!result.meta.changes) {
      return json({
        success: false,
        message: "Season not found"
      }, 404);
    }

    return json({
      success: true,
      message: "Season and its episodes deleted successfully"
    });

  } catch (error) {
    console.error("ADMIN SEASONS DELETE ERROR:", error);

    return json({
      success: false,
      message: "Unable to delete season"
    }, 500);
  }
}
