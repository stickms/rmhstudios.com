import { createAuthClient } from "better-auth/react";
import { stripTrailingSlash } from "./url";

export const authClient = createAuthClient({
  baseURL: stripTrailingSlash(import.meta.env.VITE_BETTER_AUTH_URL || "http://localhost:3000"),
});
