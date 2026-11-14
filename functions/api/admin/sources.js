

import { getAdminSession } from "../_auth.js";

export async function onRequestGet({ request, env }) {
  try {
    const admin = await getAdminSession(request, env);

    if (!admin) {
      return Response.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
    }

    const result = await env.DB.prepare(`
      SELECT
        id,
        source_key,
        name,
        source_category,
        website_url,
        documentation_url,
        integration_method,
        automation_status,
        description,
        setup_guide,
        permission_notes,
        supports_api,
        supports_rss,
        supports_webhook,
        supports_embed,
        is_enabled,
        created_at,
        updated_at
      FROM source_directory
      ORDER BY source_category ASC, name ASC
    `).all();

    return Response.json({
      success: true,
      count: result.results.length,
      sources: result.results
    });

  } catch (error) {
    return Response.json(
      {
        success: false,
        message: "Unable to load source directory"
      },
      { status: 500 }
    );
  }
}
