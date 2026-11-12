
export async function onRequestGet({ env }) {
  try {
    const result = await env.DB.prepare(`
      SELECT
        id,
        title,
        description,
        poster_url,
        banner_url,
        release_year,
        genre
      FROM anime
      WHERE status = 'published'
      ORDER BY created_at DESC
    `).all();

    return Response.json({
      success: true,
      count: result.results.length,
      anime: result.results
    });

  } catch (error) {
    return Response.json({
      success: false,
      message: "Unable to load anime"
    }, { status: 500 });
  }
}
