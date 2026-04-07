import { Hono } from "hono";

const functions = new Hono();

// POST /api/functions/:name
// In self-hosted mode, edge functions are not available.
// This endpoint returns a helpful error for now.
// In production, specific functions could be re-implemented as API routes.
functions.post("/:name", async (c) => {
  const name = c.req.param("name");

  return c.json({
    data: null,
    error: {
      message: `Edge function "${name}" is not available in self-hosted mode. This feature requires the hosted (cloud) version of Relai.`,
      code: "FUNCTION_NOT_AVAILABLE",
    },
  });
});

export default functions;
