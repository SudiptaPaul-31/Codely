# Favorites API

Authenticated users can favorite code snippets for quick access.

## Authentication

All favorites endpoints require a valid JWT token in the `Authorization` header:

```
Authorization: Bearer <token>
```

Obtain a token via the [authentication flow](../AUTHENTICATION_GUIDE.md).

---

## Endpoints

### Add Favorite

```http
POST /api/favorites/:snippetId
```

Adds a snippet to the authenticated user's favorites.

**Response `201`**

```json
{
  "data": {
    "id": "uuid",
    "wallet_address": "G...",
    "snippet_id": "uuid",
    "favorited_at": "2025-01-01T00:00:00.000Z"
  },
  "message": "Favorite added successfully"
}
```

**Error `404`** — Snippet not found

```json
{ "error": "Snippet not found" }
```

**Error `409`** — Already favorited

```json
{ "error": "Favorite already exists" }
```

---

### Remove Favorite

```http
DELETE /api/favorites/:snippetId
```

Removes a snippet from the authenticated user's favorites. If the snippet was not favorited, the response still succeeds with a different message.

**Response `200`**

```json
{ "message": "Favorite removed successfully" }
```

If no favorite existed:

```json
{ "message": "Favorite not found" }
```

---

### List Favorites

```http
GET /api/favorites?page=1&limit=20
```

Returns the authenticated user's favorited snippets, paginated. Each item includes the full snippet data.

**Query Parameters**

| Param   | Type   | Default | Description                  |
| ------- | ------ | ------- | ---------------------------- |
| `page`  | number | 1       | Page number (starts at 1)    |
| `limit` | number | 20      | Items per page (max 100)     |

**Response `200`**

```json
{
  "data": [
    {
      "id": "uuid",
      "favorited_at": "2025-01-01T00:00:00.000Z",
      "snippet_id": "uuid",
      "title": "My Snippet",
      "description": "A description",
      "language": "javascript",
      "code": "...",
      "tags": ["frontend"],
      "owner_wallet_address": "G...",
      "created_at": "2024-12-01T00:00:00.000Z",
      "updated_at": "2024-12-01T00:00:00.000Z"
    }
  ],
  "page": 1,
  "limit": 20,
  "total": 1
}
```

---

## Error Responses

| Status | Meaning                    |
| ------ | -------------------------- |
| 401    | Missing or invalid token   |
| 404    | Snippet not found          |
| 409    | Duplicate favorite         |
| 500    | Internal server error      |
