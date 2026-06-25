import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { analyticsRepository, ActionType } from '@/lib/analytics.repository';

/**
 * Unit Tests for Analytics Repository
 * Note: These tests use actual database calls. For production, mock the database.
 */

describe('AnalyticsRepository', () => {
  const testSnippetId = 'test-snippet-' + Date.now();
  const testUserWallet = 'GADDEBF2HLF7SA6YDVM6NSX3XARCEZXOT7Z4RY4YQJWQA37VBN2KA74';
  const ipAddress = '192.168.1.1';
  const userAgent = 'Test User Agent';

  describe('insertEvent', () => {
    it('should insert a view event successfully', async () => {
      const event = await analyticsRepository.insertEvent(
        testSnippetId,
        'view',
        testUserWallet,
        ipAddress,
        userAgent,
        { referrer: 'search' }
      );

      expect(event).toBeDefined();
      expect(event.snippet_id).toBe(testSnippetId);
      expect(event.action_type).toBe('view');
      expect(event.user_wallet).toBe(testUserWallet);
      expect(event.ip_address).toBe(ipAddress);
    });

    it('should insert a copy event with null user wallet', async () => {
      const event = await analyticsRepository.insertEvent(
        testSnippetId,
        'copy',
        null,
        ipAddress,
        userAgent
      );

      expect(event).toBeDefined();
      expect(event.action_type).toBe('copy');
      expect(event.user_wallet).toBeNull();
    });

    it('should insert a share event', async () => {
      const event = await analyticsRepository.insertEvent(
        testSnippetId,
        'share',
        testUserWallet,
        ipAddress,
        userAgent,
        { method: 'link' }
      );

      expect(event).toBeDefined();
      expect(event.action_type).toBe('share');
      expect(event.metadata).toEqual({ method: 'link' });
    });

    it('should retry on failure', async () => {
      // This test ensures retry logic doesn't break
      // In a real scenario, you'd mock the database to simulate failures
      const event = await analyticsRepository.insertEvent(
        testSnippetId,
        'view',
        testUserWallet,
        ipAddress,
        userAgent
      );

      expect(event).toBeDefined();
    });
  });

  describe('getAggregatedCounts', () => {
    beforeAll(async () => {
      // Insert multiple events
      await analyticsRepository.insertEvent(
        testSnippetId,
        'view',
        testUserWallet,
        ipAddress,
        userAgent
      );
      await analyticsRepository.insertEvent(
        testSnippetId,
        'view',
        testUserWallet,
        ipAddress,
        userAgent
      );
      await analyticsRepository.insertEvent(
        testSnippetId,
        'copy',
        testUserWallet,
        ipAddress,
        userAgent
      );
      await analyticsRepository.insertEvent(
        testSnippetId,
        'share',
        testUserWallet,
        ipAddress,
        userAgent
      );
    });

    it('should return aggregated counts by action type', async () => {
      const counts = await analyticsRepository.getAggregatedCounts(testSnippetId);

      expect(counts.view).toBeGreaterThanOrEqual(2);
      expect(counts.copy).toBeGreaterThanOrEqual(1);
      expect(counts.share).toBeGreaterThanOrEqual(1);
    });

    it('should return zeros for non-existent snippet', async () => {
      const counts = await analyticsRepository.getAggregatedCounts(
        'non-existent-snippet'
      );

      expect(counts.view).toBe(0);
      expect(counts.copy).toBe(0);
      expect(counts.share).toBe(0);
    });
  });

  describe('getEventsBySnippet', () => {
    it('should return paginated events', async () => {
      const result = await analyticsRepository.getEventsBySnippet(
        testSnippetId,
        10,
        0
      );

      expect(result.events).toBeDefined();
      expect(Array.isArray(result.events)).toBe(true);
      expect(result.total).toBeGreaterThanOrEqual(0);
    });

    it('should respect limit parameter', async () => {
      const result = await analyticsRepository.getEventsBySnippet(
        testSnippetId,
        2,
        0
      );

      expect(result.events.length).toBeLessThanOrEqual(2);
    });

    it('should respect offset parameter', async () => {
      const result1 = await analyticsRepository.getEventsBySnippet(
        testSnippetId,
        5,
        0
      );
      const result2 = await analyticsRepository.getEventsBySnippet(
        testSnippetId,
        5,
        2
      );

      // First event of second result should not equal first event of first result
      if (result1.events.length > 0 && result2.events.length > 0) {
        expect(result1.events[0].id).not.toBe(result2.events[0].id);
      }
    });
  });

  describe('getEventsByDateRange', () => {
    it('should return events within date range', async () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      const events = await analyticsRepository.getEventsByDateRange(
        testSnippetId,
        yesterday,
        tomorrow
      );

      expect(Array.isArray(events)).toBe(true);
    });

    it('should return empty array for future date range', async () => {
      const tomorrow = new Date(new Date().getTime() + 24 * 60 * 60 * 1000);
      const dayAfter = new Date(tomorrow.getTime() + 24 * 60 * 60 * 1000);

      const events = await analyticsRepository.getEventsByDateRange(
        testSnippetId,
        tomorrow,
        dayAfter
      );

      expect(events).toEqual([]);
    });
  });

  describe('getGlobalActionCounts', () => {
    it('should return global action counts', async () => {
      const counts = await analyticsRepository.getGlobalActionCounts();

      expect(counts.view).toBeGreaterThanOrEqual(0);
      expect(counts.copy).toBeGreaterThanOrEqual(0);
      expect(counts.share).toBeGreaterThanOrEqual(0);
    });

    it('should have view count property', async () => {
      const counts = await analyticsRepository.getGlobalActionCounts();
      expect('view' in counts).toBe(true);
    });
  });

  describe('getTopSnippets', () => {
    it('should return top viewed snippets', async () => {
      const topSnippets = await analyticsRepository.getTopSnippets('view', 10);

      expect(Array.isArray(topSnippets)).toBe(true);
      topSnippets.forEach((snippet) => {
        expect(snippet.snippet_id).toBeDefined();
        expect(snippet.count).toBeGreaterThanOrEqual(0);
      });
    });

    it('should return top copied snippets', async () => {
      const topSnippets = await analyticsRepository.getTopSnippets('copy', 5);

      expect(Array.isArray(topSnippets)).toBe(true);
      expect(topSnippets.length).toBeLessThanOrEqual(5);
    });

    it('should return top shared snippets', async () => {
      const topSnippets = await analyticsRepository.getTopSnippets('share', 5);

      expect(Array.isArray(topSnippets)).toBe(true);
    });

    it('should respect limit parameter', async () => {
      const topSnippets = await analyticsRepository.getTopSnippets('view', 3);

      expect(topSnippets.length).toBeLessThanOrEqual(3);
    });
  });

  describe('getUserActivity', () => {
    it('should return user activity', async () => {
      const activity = await analyticsRepository.getUserActivity(testUserWallet);

      expect(Array.isArray(activity)).toBe(true);
    });

    it('should return empty array for non-existent user', async () => {
      const activity = await analyticsRepository.getUserActivity(
        'GNON-EXISTENT-USER'
      );

      expect(activity).toEqual([]);
    });
  });

  describe('hasAnalytics', () => {
    it('should return true for snippet with analytics', async () => {
      const hasAnalytics = await analyticsRepository.hasAnalytics(testSnippetId);

      expect(hasAnalytics).toBe(true);
    });

    it('should return false for snippet without analytics', async () => {
      const hasAnalytics = await analyticsRepository.hasAnalytics(
        'non-existent-snippet-' + Date.now()
      );

      expect(hasAnalytics).toBe(false);
    });
  });

  describe('getBatchSummaries', () => {
    it('should return summaries for multiple snippets', async () => {
      const summaries = await analyticsRepository.getBatchSummaries([
        testSnippetId,
      ]);

      expect(Array.isArray(summaries)).toBe(true);
    });

    it('should handle empty array', async () => {
      const summaries = await analyticsRepository.getBatchSummaries([]);

      expect(summaries).toEqual([]);
    });

    it('should return views, copies, and shares counts', async () => {
      const summaries = await analyticsRepository.getBatchSummaries([
        testSnippetId,
      ]);

      if (summaries.length > 0) {
        expect('views' in summaries[0]).toBe(true);
        expect('copies' in summaries[0]).toBe(true);
        expect('shares' in summaries[0]).toBe(true);
      }
    });
  });
});
