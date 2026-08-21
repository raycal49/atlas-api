import { describe, expect, it } from 'vitest';

import { setup, USER_ID } from './userServicesHarness.js';

const LIMIT = 25;
const MAX_PAGES = 50;
const OVER_CAP_TOTAL = 17870;
const PARTIAL_LAST_PAGE_TOTAL = 101;

const CALLS = [
  { api_usage_id: '500', used_at: '2026-07-20T10:00:00.000Z', api_name: 'Geocoding' },
  { api_usage_id: '499', used_at: '2026-07-19T09:00:00.000Z', api_name: 'Directions' },
];

describe('GET /usage/log', () => {
  it('rounds the page count up so a partial last page still counts', async () => {
    const { service, userRepo } = setup();

    userRepo.findUsageLogPage.mockResolvedValue({
      calls: CALLS,
      total: PARTIAL_LAST_PAGE_TOTAL,
    });

    const result = await service.getUsageLogPage(USER_ID, { page: 1, limit: LIMIT });

    expect(result.total).toBe(PARTIAL_LAST_PAGE_TOTAL);
    expect(result.page_count).toBe(5);
    expect(result.capped).toBe(false);
  });

  it('caps the page count at fifty and says the log was truncated', async () => {
    const { service, userRepo } = setup();

    userRepo.findUsageLogPage.mockResolvedValue({
      calls: CALLS,
      total: OVER_CAP_TOTAL,
    });

    const result = await service.getUsageLogPage(USER_ID, { page: 1, limit: LIMIT });

    expect(result.page_count).toBe(MAX_PAGES);
    expect(result.total).toBe(OVER_CAP_TOTAL);
    expect(result.capped).toBe(true);
  });

  it('serves no rows for a page past the cap', async () => {
    const { service, userRepo } = setup();

    userRepo.findUsageLogPage.mockResolvedValue({
      calls: CALLS,
      total: OVER_CAP_TOTAL,
    });

    const result = await service.getUsageLogPage(USER_ID, { page: 60, limit: LIMIT });

    expect(result.calls).toStrictEqual([]);
    expect(result.page_count).toBe(MAX_PAGES);
    expect(result.total).toBe(OVER_CAP_TOTAL);
  });

  it('reports one page even when the log is empty', async () => {
    const { service, userRepo } = setup();

    userRepo.findUsageLogPage.mockResolvedValue({ calls: [], total: 0 });

    const result = await service.getUsageLogPage(USER_ID, { page: 1, limit: LIMIT });

    expect(result.calls).toStrictEqual([]);
    expect(result.page_count).toBe(1);
  });
});
