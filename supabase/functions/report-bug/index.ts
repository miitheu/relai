import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { optionsResponse, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { verifyAuth } from "../_shared/auth.ts";

const GITHUB_TOKEN = Deno.env.get("GITHUB_TOKEN");
const GITHUB_REPO = "miitheu/crm";
const GITHUB_PROJECT_NUMBER = 1;

serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();

  try {
    const auth = await verifyAuth(req);
    if (!auth) return errorResponse("Unauthorized", 401);

    const { title, body } = await req.json();
    if (!title) return errorResponse("Title is required", 400);

    if (!GITHUB_TOKEN) return errorResponse("GitHub token not configured", 500);

    // Create GitHub issue
    const issueRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/issues`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({
        title: `Bug: ${title}`,
        body: body || "",
        labels: ["bug"],
      }),
    });

    if (!issueRes.ok) {
      const err = await issueRes.text();
      return errorResponse(`GitHub API error: ${issueRes.status}`, 500);
    }

    const issue = await issueRes.json();

    // Add issue to GitHub Project via GraphQL
    try {
      // First get the project ID
      const projectQuery = await fetch("https://api.github.com/graphql", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: `query { user(login: "miitheu") { projectV2(number: ${GITHUB_PROJECT_NUMBER}) { id } } }`,
        }),
      });
      const projectData = await projectQuery.json();
      const projectId = projectData?.data?.user?.projectV2?.id;

      if (projectId) {
        // Add item to project
        await fetch("https://api.github.com/graphql", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${GITHUB_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query: `mutation { addProjectV2ItemById(input: { projectId: "${projectId}", contentId: "${issue.node_id}" }) { item { id } } }`,
          }),
        });
      }
    } catch {
      // Non-critical — issue is created even if project add fails
    }

    return jsonResponse({
      issue_number: issue.number,
      url: issue.html_url,
    });
  } catch (e: any) {
    return errorResponse("Failed to create bug report", 500);
  }
});
