import type { TickTickClient } from "../client.js";
import type { TickTickUserProfile } from "../types.js";

export class TickTickUserApi {
  constructor(private readonly client: TickTickClient) {}

  getProfile(): Promise<TickTickUserProfile> {
    return this.client.requestJson<TickTickUserProfile>({
      path: "/api/v2/user/profile",
    });
  }
}
