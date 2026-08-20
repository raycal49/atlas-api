import { describe, expect, it } from 'vitest';

import { setup, USER_ID } from './userServicesHarness.js';

const LIMIT = 25;
const MAX_PAGES = 50;

// 17,870 rows would be 715 pages at the default limit -- comfortably past the
// cap, so page_count stops at 50 while total keeps telling the truth.
const OVER_CAP_TOTAL = 17870;

// 101 rows is four full pages and one leftover row.
const PARTIAL_LAST_PAGE_TOTAL = 101;

const CALLS = [
  { api_usage_id: '500', used_at: '2026-07-20T10:00:00.000Z', api_name: 'Geocoding' },
  { api_usage_id: '499', used_at: '2026-07-19T09:00:00.000Z', api_name: 'Directions' },
];

// The route is covered end to end in
// integration/http/usageLog.integration.test.js. Everything here is arithmetic
// over `total` -- no SQL is involved in the cap, so driving these through a
// real database would only mean seeding rows to produce an integer.
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

  // The cap is enforced, not cosmetic: rows past it never leave the server,
  // even though the repository handed some over.
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

  // An empty log must not report zero pages -- the pager still shows
  // "Page 1 of 1".
  it('reports one page even when the log is empty', async () => {
    const { service, userRepo } = setup();

    userRepo.findUsageLogPage.mockResolvedValue({ calls: [], total: 0 });

    const result = await service.getUsageLogPage(USER_ID, { page: 1, limit: LIMIT });

    expect(result.calls).toStrictEqual([]);
    expect(result.page_count).toBe(1);
  });
});
