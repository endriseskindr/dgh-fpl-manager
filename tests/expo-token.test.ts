import { describe, expect, it } from "vitest";

describe("Expo build credential", () => {
  it("authenticates against the Expo user endpoint", async () => {
    const token = process.env.EXPO_TOKEN;
    expect(token).toBeTruthy();
    const response = await fetch("https://api.expo.dev/v2/auth/user", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.ok).toBe(true);
    const body = (await response.json()) as { data?: { username?: string } };
    expect(body.data?.username).toBeTruthy();
  }, 20_000);
});
