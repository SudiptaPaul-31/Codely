import { NextRequest, NextResponse } from 'next/server';
import { analyticsRepository, ActionType } from '@/lib/analytics.repository';

/**
 * POST /api/snippets/[id]/analytics
 * Log a snippet action (view, copy, share)
 *
 * Body:
 * {
 *   "actionType": "view" | "copy" | "share",
 *   "userWallet": "string (optional)",
 *   "metadata": { ...optional metadata }
 * }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: snippetId } = await params;

    // Validate snippet ID
    if (!snippetId || typeof snippetId !== 'string') {
      return NextResponse.json(
        { error: 'Invalid snippet ID' },
        { status: 400 }
      );
    }

    // Parse request body
    const body = await req.json();
    const { actionType, userWallet, metadata = {} } = body;

    // Validate action type
    if (!actionType || !['view', 'copy', 'share'].includes(actionType)) {
      return NextResponse.json(
        {
          error: 'Invalid action type',
          message: 'actionType must be one of: view, copy, share',
        },
        { status: 400 }
      );
    }

    // Extract client info
    const ipAddress =
      req.headers.get('x-forwarded-for') ||
      req.headers.get('x-real-ip') ||
      '0.0.0.0';
    const userAgent = req.headers.get('user-agent');

    // Insert analytics event
    const event = await analyticsRepository.insertEvent(
      snippetId,
      actionType as ActionType,
      userWallet || null,
      ipAddress,
      userAgent,
      metadata
    );

    return NextResponse.json(
      {
        success: true,
        message: `${actionType} action logged successfully`,
        event,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('[Analytics API] Error logging action:', error);
    return NextResponse.json(
      {
        error: 'Failed to log analytics',
        message: error instanceof Error ? error.message : 'Internal Server Error',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/snippets/[id]/analytics
 * Fetch aggregated analytics for a snippet
 *
 * Query parameters:
 * - limit: number of events to return (default: 100)
 * - offset: pagination offset (default: 0)
 * - startDate: ISO date string (optional)
 * - endDate: ISO date string (optional)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: snippetId } = await params;

    // Validate snippet ID
    if (!snippetId || typeof snippetId !== 'string') {
      return NextResponse.json(
        { error: 'Invalid snippet ID' },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(req.url);
    const limit = Math.min(
      Math.max(parseInt(searchParams.get('limit') || '100', 10), 1),
      1000
    );
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10), 0);
    const startDateStr = searchParams.get('startDate');
    const endDateStr = searchParams.get('endDate');

    // Get aggregated counts
    const aggregatedCounts =
      await analyticsRepository.getAggregatedCounts(snippetId);

    // Get events (with optional date filtering)
    let events;
    if (startDateStr && endDateStr) {
      try {
        const startDate = new Date(startDateStr);
        const endDate = new Date(endDateStr);
        events = await analyticsRepository.getEventsByDateRange(
          snippetId,
          startDate,
          endDate
        );
      } catch (error) {
        console.error('[Analytics API] Invalid date format:', error);
        events = [];
      }
    } else {
      const result = await analyticsRepository.getEventsBySnippet(
        snippetId,
        limit,
        offset
      );
      events = result.events;
    }

    return NextResponse.json(
      {
        snippetId,
        summary: {
          views: aggregatedCounts.view,
          copies: aggregatedCounts.copy,
          shares: aggregatedCounts.share,
          total: aggregatedCounts.view + aggregatedCounts.copy + aggregatedCounts.share,
        },
        recentEvents: events.slice(0, limit),
        eventsCount: events.length,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[Analytics API] Error fetching analytics:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch analytics',
        message: error instanceof Error ? error.message : 'Internal Server Error',
      },
      { status: 500 }
    );
  }
}
