import type { TickTickClient } from "../client.js";
import type { TickTickCalendarAccountsResponse, TickTickCalendarEventsResponse } from "../types.js";

export class TickTickCalendarApi {
  constructor(private readonly client: TickTickClient) {}

  listAccounts(): Promise<TickTickCalendarAccountsResponse> {
    return this.client.requestJson<TickTickCalendarAccountsResponse>({
      path: "/api/v2/calendar/third/accounts",
    });
  }

  listEvents(): Promise<TickTickCalendarEventsResponse> {
    return this.client.requestJson<TickTickCalendarEventsResponse>({
      path: "/api/v2/calendar/bind/events/all",
    });
  }
}
