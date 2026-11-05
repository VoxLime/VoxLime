
export async function onRequest(context) {
  try {
    const result = await context.env.DB
      .prepare("SELECT 1 AS connected")
      .first();

    return Response.json({
      success: true,
      app: "VoxLime",
      database: result?.connected === 1 ? "connected" : "error"
    });
  } catch (error) {
    return Response.json({
      success: false,
      app: "VoxLime",
      error: "Database connection failed"
    }, { status: 500 });
  }
}
