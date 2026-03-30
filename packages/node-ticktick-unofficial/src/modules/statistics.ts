import type { TickTickClient } from "../client.js";
import type {
  TickTickGeneralStatistics,
  TickTickRankingStatistics,
  TickTickTaskStatisticsEntry,
} from "../types.js";

export class TickTickStatisticsApi {
  constructor(private readonly client: TickTickClient) {}

  getRanking(): Promise<TickTickRankingStatistics> {
    return this.client.requestJson<TickTickRankingStatistics>({
      path: "/api/v3/user/ranking",
    });
  }

  getUserRanking(): Promise<TickTickRankingStatistics> {
    return this.getRanking();
  }

  getGeneral(): Promise<TickTickGeneralStatistics> {
    return this.client.requestJson<TickTickGeneralStatistics>({
      path: "/api/v2/statistics/general",
    });
  }

  getGeneralStatistics(): Promise<TickTickGeneralStatistics> {
    return this.getGeneral();
  }

  getTaskStatistics(startDate: string, endDate: string): Promise<TickTickTaskStatisticsEntry[]> {
    return this.client.requestJson<TickTickTaskStatisticsEntry[]>({
      path: `/api/v2/task/statistics/${startDate}/${endDate}`,
    });
  }
}
