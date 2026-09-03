import { DashboardPageModel } from '../pages/dashboard/index';
import type { DashboardSummary, AiInsight } from '../src/api/contracts';

const summary: DashboardSummary = { netWorthMinor: 10000, incomeMinor: 5000, expenseMinor: 3000, categoryBreakdown: [], accountBreakdown: [] };

test('loads read-only AI insights for the dashboard', async () => {
  const insights: AiInsight[] = [{ type: 'top_category', title: '本月支出最多：食品', value: 3000, unit: 'NZD cents' }];
  const api = { fetchSummary: jest.fn().mockResolvedValue(summary), fetchAccounts: jest.fn().mockResolvedValue([]), fetchCategories: jest.fn().mockResolvedValue([]), fetchAiInsights: jest.fn().mockResolvedValue(insights) };
  const model = new DashboardPageModel(api);
  await model.load({ from: '2026-08-01', to: '2026-09-01' });
  expect(model.state.insights).toEqual(insights);
  expect(model.state.insightsFromCache).toBe(false);
});
