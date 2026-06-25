import { NextRequest, NextResponse } from 'next/server';
import { analyticsRepository } from '@/lib/analytics.repository';

/**
 * GET /api/analytics
 * Fetch global analytics summary for dashboard
 *
 * Query parameters:
 * - type: "summary" | "top-viewed" | "top-copied" | "top-shared" (default: "summary")
 * - limit: number of results for top snippets (default: 10)
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type') || 'summary';
    const limit = Math.min(
      Math.max(parseInt(searchParams.get('limit') || '10', 10), 1),
      100
    );

    switch (type) {
      case 'summary': {
        // Get overall summary
        const globalCounts = await analyticsRepository.getGlobalActionCounts();
        
        return NextResponse.json(
          {
            summary: {
              totalViews: globalCounts.view,
              totalCopies: globalCounts.copy,
              totalShares: globalCounts.share,
              totalActions:
                globalCounts.view + globalCounts.copy + globalCounts.share,
            },
          },
          { status: 200 }
        );
      }

      case 'top-viewed': {
        const topSnippets = await analyticsRepository.getTopSnippets(
          'view',
          limit
        );
        return NextResponse.json(
          {
            type: 'top-viewed',
            limit,
            snippets: topSnippets,
          },
          { status: 200 }
        );
      }

      case 'top-copied': {
        const topSnippets = await analyticsRepository.getTopSnippets(
          'copy',
          limit
        );
        return NextResponse.json(
          {
            type: 'top-copied',
            limit,
            snippets: topSnippets,
          },
          { status: 200 }
        );
      }

      case 'top-shared': {
        const topSnippets = await analyticsRepository.getTopSnippets(
          'share',
          limit
        );
        return NextResponse.json(
          {
            type: 'top-shared',
            limit,
            snippets: topSnippets,
          },
          { status: 200 }
        );
      }

      default: {
        return NextResponse.json(
          {
            error: 'Invalid query type',
            message:
              'type must be one of: summary, top-viewed, top-copied, top-shared',
          },
          { status: 400 }
        );
      }
    }
  } catch (error) {
    console.error('[Global Analytics API] Error fetching analytics:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch analytics',
        message: error instanceof Error ? error.message : 'Internal Server Error',
      },
      { status: 500 }
    );
  }
}
