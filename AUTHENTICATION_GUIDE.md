# Stellar Wallet Authentication Implementation Guide

## Overview
This guide explains the implementation of Issue #45: Stellar Wallet Authentication (Full Login Flow) for CodeCodely.

## Architecture Overview

### Authentication Flow
```
1. User clicks "Connect Wallet"
2. Frontend requests nonce from /api/auth/nonce
3. Wallet signs nonce with user's private key
4. Frontend sends signature to /api/auth/verify
5. Backend verifies signature against public key
6. Backend issues JWT token
7. Frontend stores JWT in localStorage
8. All subsequent API requests include JWT in Authorization header
9. Middleware validates JWT on protected routes
```

### Database Schema
- **users** - Stores wallet addresses of authenticated users
- **auth_sessions** - Stores JWT session tokens with expiration
- **login_nonces** - Stores one-time nonces for signature verification (prevents replay attacks)

## Implementation Components

### 1. Backend Authentication (`lib/auth.ts`)
- `generateJWT()` - Creates JWT tokens for wallet addresses
- `verifyJWT()` - Validates JWT tokens
- `generateNonce()` - Creates one-time signature nonces
- `verifyNonce()` - Validates nonce (prevents replay attacks)
- `verifyWalletSignature()` - Validates Stellar wallet signatures
- `getOrCreateUser()` - Manages user records

### 2. API Endpoints
- `POST /api/auth/nonce` - Generate authentication nonce
- `POST /api/auth/verify` - Verify signature and issue JWT
- `POST /api/auth/logout` - Invalidate session

### 3. Authentication Middleware (`lib/auth-middleware.ts`)
- `verifyAuthentication()` - Extract and verify JWT from requests
- `withAuth()` - HOF to protect API routes
- `authMiddleware()` - Middleware for route protection

### 4. Frontend Updates (`components/WalletConnect.tsx`)
- Signature-based login flow
- JWT token storage in localStorage
- Automatic reconnection on page load
- Logout functionality
- Error handling

### 5. API Integration
- `/api/snippets` - Now requires authentication
- Snippets linked to wallet owner

## Setup Instructions

### Step 1: Database Migration
Run the SQL migration to add authentication tables:
```bash
# This will be run against your NeonDB database
# The migration is in: scripts/add-auth-tables.sql
```

Execute the migration:
```sql
-- Connect to your NeonDB database and run:
-- File: scripts/add-auth-tables.sql
```

### Step 2: Environment Variables
Copy `.env.example` to `.env.local` and configure:

```bash
# Required
DATABASE_URL="postgresql://user:password@host/database?sslmode=require"
JWT_SECRET="<generate-secure-random-key>"
NEXT_PUBLIC_STELLAR_NETWORK="testnet"
```

Generate a secure JWT_SECRET:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Step 3: Install Dependencies
The project already has the required dependencies:
- `@creit-tech/stellar-wallets-kit` - For Stellar operations
- `@albedo-link/intent` - For Albedo wallet
- `zod` - For validation

If using with a different Stellar library, ensure `stellar-sdk` is installed:
```bash
npm install stellar-sdk
```

### Step 4: Update Wallet Providers
Ensure your wallet has the `signMessage` method available:

**Freighter:**
```javascript
const message = "Your message";
const signature = await window.freighter.signMessage(message, { domain: 'codely.app' });
```

**Albedo:**
```javascript
const albedo = require('@albedo-link/intent').default;
const result = await albedo.signMessage({ message });
```

### Step 5: Restart Development Server
```bash
npm run dev
```

Visit `http://localhost:3000` to test the wallet authentication.

## Testing Instructions

### Test 1: Wallet Connection and Signature Verification

**Prerequisites:**
- Have a Stellar wallet installed (Freighter or use Albedo web wallet)
- Connected to testnet

**Steps:**
1. Open http://localhost:3000
2. Click "Connect Wallet"
3. Select "Freighter" or "Albedo"
4. Approve the connection in your wallet
5. When prompted, sign the nonce message with your wallet

**Expected Results:**
- Wallet connects successfully
- You see a shortened wallet address in the navbar (e.g., `GXXX...XXXX`)
- No errors in console
- JWT token stored in localStorage

**Verification:**
```javascript
// In browser console:
localStorage.getItem('authToken')  // Should show JWT token
localStorage.getItem('walletAddress')  // Should show Stellar address
```

### Test 2: Signature Verification Server-Side

**Steps:**
1. Open browser DevTools → Network tab
2. Connect wallet as in Test 1
3. Look at the `/api/auth/verify` POST request

**Expected Results:**
- Request includes `publicKey`, `signature`, `nonce`
- Response includes JWT token
- Status code: 200

**Example Response:**
```json
{
  "token": "eyJhbGc...",
  "user": {
    "walletAddress": "GXXXXXXX...",
    "createdAt": "2024-04-25T..."
  },
  "message": "Authentication successful"
}
```

### Test 3: Replay Attack Prevention

**Steps:**
1. Connect wallet and get a nonce (via /api/auth/nonce)
2. Sign the nonce and verify it once (POST /api/auth/verify)
3. Try to use the SAME nonce and signature again

**Expected Results:**
- First authentication: Success (Status 200)
- Second attempt with same nonce: Fails (Status 401)
- Error message: "Invalid or expired nonce"

**Manual Test:**
```bash
# Get nonce
curl http://localhost:3000/api/auth/nonce

# Verify with nonce (first time - works)
curl -X POST http://localhost:3000/api/auth/verify \
  -H "Content-Type: application/json" \
  -d '{
    "publicKey": "YOUR_WALLET_ADDRESS",
    "signature": "SIGNATURE",
    "nonce": "NONCE"
  }'

# Try again with same nonce (fails)
curl -X POST http://localhost:3000/api/auth/verify \
  -H "Content-Type: application/json" \
  -d '{
    "publicKey": "YOUR_WALLET_ADDRESS",
    "signature": "SIGNATURE",
    "nonce": "NONCE"
  }'
```

### Test 4: Protected Routes (API Authentication)

**Prerequisites:**
- Wallet connected (JWT token in localStorage)

**Steps:**
1. Connect wallet to get JWT token
2. Create a snippet via POST /api/snippets
3. Include JWT in Authorization header

**Expected Results:**
- Snippet created with owner = wallet address
- Status code: 201

**Manual Test:**
```bash
# Get token from browser console
TOKEN=$(localStorage.getItem('authToken'))

# Create snippet with JWT
curl -X POST http://localhost:3000/api/snippets \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "title": "Hello World",
    "description": "Test snippet",
    "code": "console.log(\"hello\");",
    "language": "javascript",
    "tags": ["test"]
  }'
```

### Test 5: Unauthenticated Request Rejection

**Steps:**
1. Without connecting wallet, try to create a snippet
2. Send POST request without JWT token

**Expected Results:**
- Status code: 401
- Error message: "Unauthorized - Please authenticate with your wallet"

**Manual Test:**
```bash
curl -X POST http://localhost:3000/api/snippets \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test",
    "description": "Test",
    "code": "test",
    "language": "javascript",
    "tags": ["test"]
  }'
# Returns 401 Unauthorized
```

### Test 6: Session Persistence

**Steps:**
1. Connect wallet
2. Refresh the page (F5)
3. Check if wallet remains connected

**Expected Results:**
- Wallet address still visible after refresh
- No need to re-authenticate
- JWT token restored from localStorage

### Test 7: Logout Functionality

**Steps:**
1. Connect wallet
2. Click on wallet address in navbar to disconnect
3. Check localStorage

**Expected Results:**
- Wallet disconnects
- JWT token removed from localStorage
- "Connect Wallet" button appears again
- Logout request sent to /api/auth/logout

### Test 8: Invalid Signature Rejection

**Steps:**
1. Get a valid nonce
2. Manually modify the signature (change one character)
3. Send to /api/auth/verify with modified signature

**Expected Results:**
- Status code: 401
- Error message: "Invalid signature"

## Troubleshooting

### Issue: "Freighter wallet not detected"
**Solution:**
1. Install Freighter extension: https://www.freighter.app/
2. Refresh the page
3. Try again

### Issue: "Invalid signature"
**Possible causes:**
1. Wallet not signing the exact nonce message
2. Signature verification library issue
3. Message encoding mismatch

**Solution:**
- Check console logs for exact message being signed
- Ensure nonce is in the correct format

### Issue: "JWT token expired"
**Solution:**
- Tokens expire after 7 days
- Reconnect wallet to get a new token

### Issue: Database connection error
**Solution:**
1. Verify DATABASE_URL is correct
2. Check NeonDB connection settings
3. Ensure SSL is required: `?sslmode=require`

### Issue: "Nonce expired"
**Solution:**
- Nonces expire after 15 minutes
- Get a new nonce via `/api/auth/nonce`
- Complete authentication within 15 minutes

## Security Checklist

- [ ] JWT_SECRET is set to a strong random value (minimum 32 characters)
- [ ] Database URL uses SSL connection
- [ ] Private keys are NEVER stored on server
- [ ] Only public keys are used for signature verification
- [ ] Nonces are single-use (replay protection)
- [ ] JWT tokens have expiration time
- [ ] Sensitive errors don't leak implementation details
- [ ] Rate limiting implemented on auth endpoints (recommended)
- [ ] CORS configured for frontend domain

## Next Steps

### Optional Enhancements:
1. Implement refresh token rotation
2. Add rate limiting to auth endpoints
3. Implement multi-signature support
4. Add user profile/metadata storage
5. Implement snippet permission system
6. Add session management UI
7. Implement wallet connection revocation

### For Production:
1. Change JWT_SECRET to production value
2. Set NEXT_PUBLIC_STELLAR_NETWORK to "public"
3. Use secure database with proper backups
4. Implement request rate limiting
5. Add monitoring and alerting
6. Consider audit logging for authentication events
7. Implement DDoS protection

## References

- [Stellar SDK Documentation](https://developers.stellar.org/docs/learn)
- [Freighter Wallet](https://www.freighter.app/)
- [Albedo Wallet](https://albedo.link/)
- [JWT.io](https://jwt.io/)
- [NeonDB Documentation](https://neon.tech/docs)
