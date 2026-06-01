# 🧪 Step-by-Step Testing Guide for Stellar Wallet Authentication

## Overview

This guide provides a complete step-by-step process to verify that Issue #45 (Stellar Wallet Authentication) has been successfully implemented.

**Total Tests: 8 scenarios covering all acceptance criteria**
**Estimated Time: 30-45 minutes**

---

## SETUP PHASE

### Prerequisites Checklist

Before starting tests, ensure:

- [ ] Node.js installed (`v18+` recommended)
- [ ] Stellar wallet installed (Freighter or web access to Albedo)
- [ ] Connected to Stellar testnet
- [ ] Environment variables configured (`.env.local`)
- [ ] Database migrations applied
- [ ] Development server running (`npm run dev`)

### Initial Setup (One-time)

**Step 1: Environment Variables**

```bash
# Copy template
cp .env.example .env.local

# Edit .env.local and add:
# 1. DATABASE_URL - your NeonDB connection
# 2. JWT_SECRET - run: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# 3. NEXT_PUBLIC_STELLAR_NETWORK="testnet"
```

**Step 2: Database Migration**

```bash
# Connect to your NeonDB and execute: scripts/add-auth-tables.sql
# This creates: users, auth_sessions, login_nonces tables
```

**Step 3: Install Dependencies** (if needed)

```bash
npm install
```

**Step 4: Start Dev Server**

```bash
npm run dev
# Should show: ▲ Next.js X.X.X (ready - started server on 0.0.0.0:3000)
```

**Step 5: Verify Server is Running**

- Navigate to http://localhost:3000
- Should see CodeCodely landing page
- No console errors

---

## TEST PHASE

### TEST 1: Basic Wallet Connection ✅

**Objective:** Verify wallet can connect and retrieve public key

**Steps:**

1. Open http://localhost:3000 in browser
2. Click "Connect Wallet" button in navbar
3. Choose your wallet:
   - **For Freighter:** Click "🚀 Freighter"
   - **For Albedo:** Click "⭐ Albedo"
4. Approve wallet connection request
5. Verify public key is retrieved

**Expected Results:**

- Dialog shows wallet options
- Wallet requests approval (extension popup or new tab)
- Button changes to show shortened address (e.g., "GXXX...XXXX")
- No errors in browser console
- Wallet state shows "Connected"

**Verification Commands:**

```javascript
// Open browser console (F12 → Console tab)

// Check localStorage
localStorage.getItem("authToken"); // Should return JWT
localStorage.getItem("walletAddress"); // Should return Stellar address
localStorage.getItem("walletName"); // Should return "Freighter" or "Albedo"

// Check context (if using React DevTools)
// Components → ClientWalletProvider → props → value
```

**✅ Pass Criteria:**

- Wallet address appears in navbar
- LocalStorage contains authToken, walletAddress, walletName
- No console errors

---

### TEST 2: Signature Verification Flow 📝

**Objective:** Verify that signature verification works server-side

**Steps:**

1. Start with disconnected wallet
2. Open browser DevTools → Network tab → XHR filter
3. Click "Connect Wallet" and select Freighter/Albedo
4. Complete wallet connection
5. Watch network requests

**Expected Network Requests (in order):**

**Request 1: GET /api/auth/nonce**

```json
{
  "nonce": "a1b2c3d4e5f6...",
  "message": "Sign this nonce to login to Codely: a1b2c3d4e5f6..."
}
```

**Request 2: POST /api/auth/verify**

```json
Request Body:
{
  "publicKey": "GXXXXXXX...",
  "signature": "xxxxx...",
  "nonce": "a1b2c3d4e5f6..."
}

Response (Status 200):
{
  "token": "eyJhbGc...",
  "user": {
    "walletAddress": "GXXXXXXX...",
    "createdAt": "2024-04-25T..."
  },
  "message": "Authentication successful"
}
```

**✅ Pass Criteria:**

- Both requests complete successfully
- /api/auth/nonce returns valid nonce
- /api/auth/verify returns JWT token
- Status codes are 200
- JWT token is valid format (xxx.xxx.xxx)

---

### TEST 3: JWT Token Validation 🔐

**Objective:** Verify JWT token is properly generated and stored

**Steps:**

1. After connecting wallet (Test 1), get the JWT token
2. Decode it to verify payload

**How to Check:**

```javascript
// In browser console:
const token = localStorage.getItem("authToken");

// Split token into parts
const parts = token.split(".");
const payload = JSON.parse(atob(parts[1]));

console.log("Payload:", payload);
console.log("Expiration:", new Date(payload.exp * 1000));
console.log("Wallet Address:", payload.walletAddress);
```

**Expected Payload:**

```json
{
  "alg": "HS256",
  "typ": "JWT",
  "sub": "GXXXXXXX...",
  "iat": 1719331234,
  "exp": 1719936034,
  "walletAddress": "GXXXXXXX..."
}
```

**✅ Pass Criteria:**

- Token has 3 parts (header.payload.signature)
- Payload contains walletAddress
- Expiration is ~7 days in future
- No decoding errors

---

### TEST 4: Replay Attack Prevention 🛡️

**Objective:** Verify nonce is single-use (cannot be replayed)

**Steps:**

**Part A: Manual API Test**

```bash
# 1. Get a nonce
curl http://localhost:3000/api/auth/nonce

# Copy the nonce from response

# 2. Create a test signature (use existing wallet connection)
# In browser console, get a signature:
const message = "Sign this nonce to login to Codely: YOUR_NONCE";
// (Have your wallet sign this, or use existing signature for testing)

# 3. First verification attempt (should work):
curl -X POST http://localhost:3000/api/auth/verify \
  -H "Content-Type: application/json" \
  -d '{
    "publicKey": "YOUR_WALLET_ADDRESS",
    "signature": "SIGNATURE_FROM_WALLET",
    "nonce": "YOUR_NONCE"
  }'
# Should return: Status 200 with JWT token

# 4. Second attempt with SAME nonce (should fail):
curl -X POST http://localhost:3000/api/auth/verify \
  -H "Content-Type: application/json" \
  -d '{
    "publicKey": "YOUR_WALLET_ADDRESS",
    "signature": "SIGNATURE_FROM_WALLET",
    "nonce": "YOUR_NONCE"
  }'
# Should return: Status 401 with "Invalid or expired nonce"
```

**✅ Pass Criteria:**

- First attempt succeeds (Status 200)
- Second attempt fails (Status 401)
- Error message mentions "Invalid or expired nonce"
- Replay attack is prevented

---

### TEST 5: Protected API Endpoint 🔒

**Objective:** Verify POST /api/snippets requires authentication

**Steps:**

**Part A: Unauthenticated Request (Should Fail)**

```bash
curl -X POST http://localhost:3000/api/snippets \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test Snippet",
    "description": "This should fail",
    "code": "console.log(\"test\");",
    "language": "javascript",
    "tags": ["test"]
  }'
```

**Expected Response (Status 401):**

```json
{
  "error": "Unauthorized - Please authenticate with your wallet"
}
```

**Part B: Authenticated Request (Should Succeed)**

```bash
# 1. Get token from browser
TOKEN=$(localStorage.getItem('authToken'))

# 2. Create snippet WITH authentication
curl -X POST http://localhost:3000/api/snippets \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN_HERE" \
  -d '{
    "title": "My First Authenticated Snippet",
    "description": "Created with wallet authentication",
    "code": "console.log(\"Hello from authenticated user\");",
    "language": "javascript",
    "tags": ["authenticated", "test"]
  }'
```

**Expected Response (Status 201):**

```json
{
  "id": "uuid-here",
  "title": "My First Authenticated Snippet",
  "owner": "GXXXXXXX...",
  "code": "console.log(\"Hello from authenticated user\");",
  "language": "javascript",
  "tags": ["authenticated", "test"],
  "created_at": "2024-04-25T...",
  "updated_at": "2024-04-25T..."
}
```

**✅ Pass Criteria:**

- Without token: Status 401 with error message
- With token: Status 201 with snippet created
- Snippet has "owner" field matching wallet address
- No errors in console

---

### TEST 6: Session Persistence 🔄

**Objective:** Verify wallet session persists across page refresh

**Steps:**

1. Connect wallet (should see address in navbar)
2. Open DevTools → Application → LocalStorage → http://localhost:3000
3. Note the values: authToken, walletAddress, walletName
4. Refresh page (F5 or Cmd+R)
5. Verify wallet remains connected

**Expected Results:**

- Before refresh: Address shown in navbar
- LocalStorage values remain unchanged
- After refresh: Address still shows (no need to reconnect)
- No console errors

**✅ Pass Criteria:**

- Wallet state restored after refresh
- No re-authentication needed
- LocalStorage persists correctly

---

### TEST 7: Logout Functionality 🚪

**Objective:** Verify disconnect works and clears session

**Steps:**

1. Connect wallet (address shows in navbar)
2. Click on the wallet address in navbar
3. Confirm disconnect
4. Check browser console and LocalStorage

**Expected Results:**

- Button changes back to "Connect Wallet"
- LocalStorage values cleared:
  ```javascript
  localStorage.getItem("authToken"); // null
  localStorage.getItem("walletAddress"); // null
  localStorage.getItem("walletName"); // null
  ```
- Network shows POST /api/auth/logout succeeded
- No console errors

**Verification:**

```javascript
// In browser console after logout:
localStorage.getItem("authToken"); // Should be null
```

**✅ Pass Criteria:**

- All localStorage values cleared
- Button returns to disconnected state
- No errors during logout

---

### TEST 8: Invalid Signature Handling ❌

**Objective:** Verify invalid signatures are rejected

**Steps:**

1. Get a nonce
2. Attempt verification with invalid/modified signature
3. Observe error handling

**Manual Test:**

```bash
# Get nonce
NONCE=$(curl -s http://localhost:3000/api/auth/nonce | jq -r '.nonce')

# Try with invalid signature (modify/corrupt it)
curl -X POST http://localhost:3000/api/auth/verify \
  -H "Content-Type: application/json" \
  -d "{
    \"publicKey\": \"GXXXXXXX...\",
    \"signature\": \"invalid_signature_here\",
    \"nonce\": \"$NONCE\"
  }"
```

**Expected Response (Status 401):**

```json
{
  "error": "Invalid signature"
}
```

**✅ Pass Criteria:**

- Status code: 401
- Error message: "Invalid signature"
- No JWT token returned
- Server handled gracefully (no crash)

---

## VERIFICATION CHECKLIST

After completing all 8 tests, verify:

### Frontend Verification

- [ ] Connect Wallet button visible
- [ ] Wallet selection dialog works
- [ ] Address displays when connected
- [ ] Disconnect works
- [ ] Session persists on refresh
- [ ] Error messages display properly

### Backend Verification

- [ ] Nonce generation endpoint works (GET /api/auth/nonce)
- [ ] Signature verification works (POST /api/auth/verify)
- [ ] JWT tokens are valid
- [ ] Replay protection works
- [ ] Protected routes require auth
- [ ] Logout invalidates sessions

### Database Verification

```sql
-- Connect to your database and run:
SELECT * FROM users; -- Should have your wallet address
SELECT * FROM auth_sessions; -- Should have active session
SELECT * FROM login_nonces; -- Should have used nonce (used=true)
SELECT * FROM snippets WHERE owner IS NOT NULL; -- Should have created snippet
```

### Security Verification

- [ ] Private keys never transmitted to server
- [ ] Only public keys stored
- [ ] Tokens properly hashed in database
- [ ] Nonces are single-use
- [ ] Expiration times are enforced
- [ ] Clear error messages without leaking details

---

## TROUBLESHOOTING

### Issue: "Freighter wallet not detected"

**Solution:**

1. Install Freighter: https://www.freighter.app/
2. Refresh page
3. Try again

### Issue: "Invalid signature"

**Possible Causes:**

- Message format changed
- Nonce expired (> 15 minutes)
- Wallet not properly installed

**Solution:**

1. Check browser console for exact message
2. Get a new nonce
3. Try within 15 minutes
4. Check wallet is properly connected

### Issue: Network error on /api/auth/verify

**Solution:**

1. Check Database connection (DATABASE_URL in .env.local)
2. Verify SQL tables exist (run migration script)
3. Check JWT_SECRET is set

### Issue: "Unauthorized" on protected routes

**Solution:**

1. Verify you're connected (wallet address in navbar)
2. Check token exists: `localStorage.getItem('authToken')`
3. Verify token format in network inspector
4. Re-connect wallet to get fresh token

### Issue: CORS errors in browser

**Solution:**

```javascript
// Add to next.config.mjs if needed:
headers: [
  {
    source: "/api/:path*",
    headers: [
      { key: "Access-Control-Allow-Origin", value: "http://localhost:3000" },
    ],
  },
];
```

---

## SUCCESS CRITERIA

✅ **All 8 tests pass**
✅ **No console errors**
✅ **All expected data structures match**
✅ **Authentication flow complete**
✅ **Security measures verified**

---

## FINAL CHECKLIST

- [ ] Test 1: Basic Wallet Connection ✅
- [ ] Test 2: Signature Verification Flow ✅
- [ ] Test 3: JWT Token Validation ✅
- [ ] Test 4: Replay Attack Prevention ✅
- [ ] Test 5: Protected API Endpoint ✅
- [ ] Test 6: Session Persistence ✅
- [ ] Test 7: Logout Functionality ✅
- [ ] Test 8: Invalid Signature Handling ✅

---

## SIGN-OFF

When all tests pass, Issue #45 is successfully completed!

**Implementation Date:** [Date]
**Tested By:** [Your Name]
**Status:** ✅ COMPLETE
