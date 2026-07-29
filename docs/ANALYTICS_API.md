# Snippet Analytics API

This service tracks user interactions with snippets to provide aggregated statistics (views, copies, shares).

## Endpoints

### 1. Log a Snippet Action
Record an interaction with a snippet. The API will automatically detect the user's wallet address if they are authenticated.
- **Endpoint:** `POST /api/snippets/:id/analytics`
- **Body:**
  ```json
  {
    "actionType": "view" | "copy" | "share"
  }
  ```
- **Response (201 Created):** Returns the recorded analytics database row.
- **Notes:** Includes an internal exponential backoff retry mechanism to ensure logs are not lost during temporary database connection issues.

### 2. Fetch Snippet Analytics
Retrieve the aggregated statistics for a specific snippet.
- **Endpoint:** `GET /api/snippets/:id/analytics`
- **Response (200 OK):**
  ```json
  {
    "views": 150,
    "copies": 42,
    "shares": 10
  }
  ```

### 3. Fetch Global Analytics (Admin/Dashboard)
Retrieve the total aggregated statistics across all snippets.
- **Endpoint:** `GET /api/analytics`
- **Response (200 OK):**
  ```json
  {
    "views": 9500,
    "copies": 1200,
    "shares": 300
  }
  ```

## Implementation Details
- **Schema:** Defined in `scripts/add-snippet-analytics.sql`. Uses a foreign key to the `snippets` table with `ON DELETE CASCADE`.
- **Indexing:** Optimized with `idx_snippet_analytics_snippet_action` for fast `GROUP BY` dashboard queries.
- **Resilience:** The backend service handles up to 3 automatic retries for transient insertion failures to guarantee accurate tracking without a separate background worker queue.
