import { testConnection } from "../ai/provider";
import type { FunctionContext } from "./utils";

export default async function aiTest(ctx: FunctionContext) {
  const { body } = ctx;
  const providerConfig = body.provider;

  if (!providerConfig?.id) {
    return { data: null, error: { message: "Provider configuration required" } };
  }

  const result = await testConnection(providerConfig);
  return { data: result };
}
