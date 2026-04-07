import type { FunctionContext } from "./utils";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO || "miitheu/crm";
const GITHUB_PROJECT_NUMBER = 1;

export default async function reportBug({ body }: FunctionContext) {
  const { title, body: bugBody } = body;
  if (!title) {
    return { data: null, error: { message: "Title is required" } };
  }

  if (!GITHUB_TOKEN) {
    return { data: null, error: { message: "GitHub token not configured" } };
  }

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
      body: bugBody || "",
      labels: ["bug"],
    }),
  });

  if (!issueRes.ok) {
    return { data: null, error: { message: `GitHub API error: ${issueRes.status}` } };
  }

  const issue = await issueRes.json();

  // Try to add to GitHub Project (non-critical)
  try {
    const projectQuery = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: `query { user(login: "${GITHUB_REPO.split("/")[0]}") { projectV2(number: ${GITHUB_PROJECT_NUMBER}) { id } } }`,
      }),
    });
    const projectData = await projectQuery.json();
    const projectId = projectData?.data?.user?.projectV2?.id;

    if (projectId) {
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
    // Non-critical
  }

  return { data: { issue_number: issue.number, url: issue.html_url } };
}
