

import { getAdminSession } from "../_auth.js";

function validImageUrl(value) {
  if (!value) return true;

  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const admin = await getAdminSession(request, env);

    if (!admin) {
      return Response.json(
        { success: false, message: "Unauthorized. Please login." },
        { status: 401 }
      );
    }

    const data = await request.json();

    const title = String(data.title || "").trim();
    const description = String(data.description || "").trim();
    const posterUrl = String(data.poster_url || "").trim();
    const bannerUrl = String(data.banner_url || "").trim();
    const genre = String(data.genre || "").trim();
    const status = data.status || "draft";

    const releaseYear =
      data.release_year === "" || data.release_year == null
        ? null
        : Number(data.release_year);

    if (!title || title.length > 200) {
      return Response.json(
        { success: false, message: "Title is required (maximum 200 characters)." },
        { status: 400 }
      );
    }

    if (description.length > 10000 || genre.length > 500) {
      return Response.json(
        { success: false, message: "Description or genre is too long." },
        { status: 400 }
      );
    }

    if (
      !validImageUrl(posterUrl) ||
      !validImageUrl(bannerUrl)
    ) {
      return Response.json(
        { success: false, message: "Image URLs must be valid HTTP or HTTPS URLs." },
        { status: 400 }
      );
    }

    if (
      releaseYear !== null &&
      (!Number.isInteger(releaseYear) ||
        releaseYear < 1900 ||
        releaseYear > 2100)
    ) {
      return Response.json(
        { success: false, message: "Invalid release year." },
        { status: 400 }
      );
    }

    if (!["draft", "published"].includes(status)) {
      return Response.json(
        { success: false, message: "Invalid anime status." },
        { status: 400 }
      );
    }

    const result = await env.DB.prepare(`
      INSERT INTO anime (
        title,
        description,
        poster_url,
        banner_url,
        release_year,
        genre,
        status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
      .bind(
        title,
        description,
        posterUrl,
        bannerUrl,
        releaseYear,
        genre,
        status
      )
      .run();

    return Response.json(
      {
        success: true,
        message: "Anime created successfully.",
        anime: {
          id: result.meta.last_row_id,
          title,
          description,
          poster_url: posterUrl,
          banner_url: bannerUrl,
          release_year: releaseYear,
          genre,
          status
        }
      },
      { status: 201 }
    );

  } catch (error) {
    console.error("CREATE ANIME ERROR:", error);

    return Response.json(
      { success: false, message: "Unable to create anime." },
      { status: 500 }
    );
  }
}
