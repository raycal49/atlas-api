import { describe, expect, it } from 'vitest';

import { USAGE_PAGE_SIZE } from '../repositories/userRepos.js';
import { setup, USER_ID } from './userServicesHarness.js';

const OVER_A_PAGE = USAGE_PAGE_SIZE + 1;

const NEWEST_ID = 9007199254741000n;
const NEWEST_AT = Date.UTC(2026, 6, 20, 12, 0, 0);
const ONE_MINUTE = 60_000;

const makeCalls = (count) =>
  Array.from({ length: count }, (_, i) => ({
    api_usage_id: String(NEWEST_ID - BigInt(i)),
    used_at: new Date(NEWEST_AT - i * ONE_MINUTE),
    api_name: 'Geocoding',
  }));

const CURSOR = { at: '2026-07-20T11:00:00.000Z', id: '9007199254740960' };

describe('getUsageLogPage', () => {
  it('trims the over-fetched row off the page', async () => {
    const { service, userRepo } = setup();
    const rows = makeCalls(OVER_A_PAGE);

    userRepo.findUsageLogPage.mockResolvedValue(rows);

    const result = await service.getUsageLogPage(USER_ID, {});

    expect(result.calls).toHaveLength(USAGE_PAGE_SIZE);
    expect(result.calls).toEqual(rows.slice(0, USAGE_PAGE_SIZE));
  });

  it('never serves the over-fetched row to the client', async () => {
    const { service, userRepo } = setup();
    const rows = makeCalls(OVER_A_PAGE);
    const overFetched = rows.at(-1);

    userRepo.findUsageLogPage.mockResolvedValue(rows);

    const result = await service.getUsageLogPage(USER_ID, {});

    expect(result.calls).not.toContain(overFetched);
    expect(result.calls.map((call) => call.api_usage_id))
      .not.toContain(overFetched.api_usage_id);
  });

  it('issues a cursor when the over-fetched row proves the log continues', async () => {
    const { service, userRepo } = setup();

    userRepo.findUsageLogPage.mockResolvedValue(makeCalls(OVER_A_PAGE));

    const result = await service.getUsageLogPage(USER_ID, {});

    expect(result.next_cursor).not.toBeNull();
  });

  it('builds the cursor from the last row it serves, not the one it drops', async () => {
    const { service, userRepo } = setup();
    const rows = makeCalls(OVER_A_PAGE);
    const lastServed = rows[USAGE_PAGE_SIZE - 1];

    userRepo.findUsageLogPage.mockResolvedValue(rows);

    const result = await service.getUsageLogPage(USER_ID, {});

    expect(result.next_cursor).toEqual({
      at: lastServed.used_at.toISOString(),
      id: lastServed.api_usage_id,
    });
    expect(result.next_cursor.id).not.toBe(rows[0].api_usage_id);
    expect(result.next_cursor.id).not.toBe(rows.at(-1).api_usage_id);
  });

  it('passes the cursor id through as an unmodified string', async () => {
    const { service, userRepo } = setup();
    const rows = makeCalls(OVER_A_PAGE);

    userRepo.findUsageLogPage.mockResolvedValue(rows);

    const result = await service.getUsageLogPage(USER_ID, {});

    expect(typeof result.next_cursor.id).toBe('string');
    expect(result.next_cursor.id).toBe(rows[USAGE_PAGE_SIZE - 1].api_usage_id);
  });

  it('ends the walk on a full page with nothing behind it', async () => {
    const { service, userRepo } = setup();
    const rows = makeCalls(USAGE_PAGE_SIZE);

    userRepo.findUsageLogPage.mockResolvedValue(rows);

    const result = await service.getUsageLogPage(USER_ID, {});

    expect(result.calls).toHaveLength(USAGE_PAGE_SIZE);
    expect(result.next_cursor).toBeNull();
  });

  it('ends the walk on a partial page', async () => {
    const { service, userRepo } = setup();
    const rows = makeCalls(3);

    userRepo.findUsageLogPage.mockResolvedValue(rows);

    const result = await service.getUsageLogPage(USER_ID, {});

    expect(result.calls).toEqual(rows);
    expect(result.next_cursor).toBeNull();
  });

  it('reports an empty log without a cursor', async () => {
    const { service, userRepo } = setup();

    userRepo.findUsageLogPage.mockResolvedValue([]);

    const result = await service.getUsageLogPage(USER_ID, {});

    expect(result.calls).toStrictEqual([]);
    expect(result.next_cursor).toBeNull();
  });

  it('hands the repository the cursor and no page size', async () => {
    const { service, userRepo } = setup();

    userRepo.findUsageLogPage.mockResolvedValue([]);

    await service.getUsageLogPage(USER_ID, {
      api: 'a-product',
      from: '2026-03-01',
      to: '2026-03-31',
      cursor: CURSOR,
    });

    const [call] = userRepo.findUsageLogPage.mock.calls;

    expect(call).toHaveLength(3);
    expect(call[0]).toBe(USER_ID);
    expect(call[1]).toEqual({ api: 'a-product', from: '2026-03-01', to: '2026-03-31' });
    expect(call[2]).toBe(CURSOR);
  });

  it('tells the repository there is no cursor on the first page', async () => {
    const { service, userRepo } = setup();

    userRepo.findUsageLogPage.mockResolvedValue([]);

    await service.getUsageLogPage(USER_ID, { cursor: null });

    expect(userRepo.findUsageLogPage.mock.calls[0][2]).toBeNull();
  });
});
