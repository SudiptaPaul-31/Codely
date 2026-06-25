import { describe, it, expect, beforeAll } from 'vitest';

/**
 * Integration Tests for Analytics API Endpoints
 * These tests assume the server is running
 */

describe('Analytics API Endpoints', () => {
  const baseUrl = process.env.API_URL || 'http://localhost:3000';
  const testSnippetId = 'test-snippet-' + Date.now();
  const testUserWallet = 'GADDEBF2HLF7SA6YDVM6NSX3XARCEZXOT7Z4RY4YQJWQA37VBN2KA74';

  describe('POST /api/snippets/[id]/analytics', () => {
    it('should log a view action', async () => {
      const response = await fetch(
        `${baseUrl}/api/snippets/${testSnippetId}/analytics`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            actionType: 'view',
            userWallet: testUserWallet,
            metadata: { referrer: 'search' },
          }),
        }
      );

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.event).toBeDefined();
      expect(data.event.action_type).toBe('view');
    });

    it('should log a copy action', async () => {
      const response = await fetch(
        `${baseUrl}/api/snippets/${testSnippetId}/analytics`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            actionType: 'copy',
            metadata: { format: 'text' },
          }),
        }
      );

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.event.action_type).toBe('copy');
    });

    it('should log a share action', async () => {
      const response = await fetch(
        `${baseUrl}/api/snippets/${testSnippetId}/analytics`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            actionType: 'share',
            userWallet: testUserWallet,
            metadata: { method: 'link' },
          }),
        }
      );

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.event.action_type).toBe('share');
    });

    it('should reject invalid action type', async () => {
      const response = await fetch(
        `${baseUrl}/api/snippets/${testSnippetId}/analytics`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            actionType: 'invalid-action',
          }),
        }
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBeDefined();
    });

    it('should reject missing action type', async () => {
      const response = await fetch(
        `${baseUrl}/api/snippets/${testSnippetId}/analytics`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        }
      );

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/snippets/[id]/analytics', () => {
    beforeAll(async () => {
      // Log some test events
      await fetch(
        `${baseUrl}/api/snippets/${testSnippetId}/analytics`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ actionType: 'view' }),
        }
      );
      await fetch(
        `${baseUrl}/api/snippets/${testSnippetId}/analytics`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ actionType: 'view' }),
        }
      );
      await fetch(
        `${baseUrl}/api/snippets/${testSnippetId}/analytics`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ actionType: 'copy' }),
        }
      );
    });

    it('should fetch analytics for a snippet', async () => {
      const response = await fetch(
        `${baseUrl}/api/snippets/${testSnippetId}/analytics`
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.snippetId).toBe(testSnippetId);
      expect(data.summary).toBeDefined();
      expect(data.summary.views).toBeGreaterThanOrEqual(0);
      expect(data.summary.copies).toBeGreaterThanOrEqual(0);
      expect(data.summary.shares).toBeGreaterThanOrEqual(0);
    });

    it('should return recent events', async () => {
      const response = await fetch(
        `${baseUrl}/api/snippets/${testSnippetId}/analytics`
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(Array.isArray(data.recentEvents)).toBe(true);
    });

    it('should support limit parameter', async () => {
      const response = await fetch(
        `${baseUrl}/api/snippets/${testSnippetId}/analytics?limit=5`
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.recentEvents.length).toBeLessThanOrEqual(5);
    });

    it('should support date range filtering', async () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      const response = await fetch(
        `${baseUrl}/api/snippets/${testSnippetId}/analytics?startDate=${yesterday.toISOString()}&endDate=${tomorrow.toISOString()}`
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.recentEvents).toBeDefined();
    });
  });

  describe('GET /api/analytics', () => {
    it('should fetch global analytics summary', async () => {
      const response = await fetch(`${baseUrl}/api/analytics?type=summary`);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.summary).toBeDefined();
      expect(data.summary.totalViews).toBeGreaterThanOrEqual(0);
      expect(data.summary.totalCopies).toBeGreaterThanOrEqual(0);
      expect(data.summary.totalShares).toBeGreaterThanOrEqual(0);
    });

    it('should fetch top viewed snippets', async () => {
      const response = await fetch(
        `${baseUrl}/api/analytics?type=top-viewed&limit=5`
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.type).toBe('top-viewed');
      expect(Array.isArray(data.snippets)).toBe(true);
    });

    it('should fetch top copied snippets', async () => {
      const response = await fetch(`${baseUrl}/api/analytics?type=top-copied`);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.type).toBe('top-copied');
      expect(Array.isArray(data.snippets)).toBe(true);
    });

    it('should fetch top shared snippets', async () => {
      const response = await fetch(`${baseUrl}/api/analytics?type=top-shared`);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.type).toBe('top-shared');
      expect(Array.isArray(data.snippets)).toBe(true);
    });

    it('should reject invalid query type', async () => {
      const response = await fetch(
        `${baseUrl}/api/analytics?type=invalid-type`
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBeDefined();
    });

    it('should support limit parameter', async () => {
      const response = await fetch(`${baseUrl}/api/analytics?type=top-viewed&limit=3`);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.snippets.length).toBeLessThanOrEqual(3);
    });
  });
});
