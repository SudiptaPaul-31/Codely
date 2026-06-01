# Stellar Wallet Authentication - Deployment Checklist

**Assignment:** Issue #45 - Stellar Wallet Authentication (Full Login Flow)  
**Target Environment:** Production-Ready  
**Date:** April 26, 2026

---

## ✅ Pre-Deployment Verification

### Phase 1: Dependencies & Environment

- [ ] **1.1** Run `npm install` to install `stellar-sdk` dependency
- [ ] **1.2** Verify stellar-sdk installation: `npm list stellar-sdk`
- [ ] **1.3** Copy `.env.example` to `.env.local`
- [ ] **1.4** Generate JWT secret: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- [ ] **1.5** Set all required environment variables:
  ```
  DATABASE_URL=postgresql://...
  JWT_SECRET=<your-generated-secret>
  NEXT_PUBLIC_STELLAR_NETWORK=testnet
  NEXT_PUBLIC_APP_URL=http://localhost:3000
  ```
- [ ] **1.6** Verify environment variables: `npm run verify:env` (if script exists) or manually check

### Phase 2: Database Schema

- [ ] **2.1** Connect to your PostgreSQL database (NeonDB)
- [ ] **2.2** Run database migration:
  ```bash
  psql $DATABASE_URL -f scripts/add-auth-tables.sql
  ```
- [ ] **2.3** Verify schema creation by running:
  ```bash
  npx ts-node lib/verify-db-schema.ts
  ```
- [ ] **2.4** Expected output: "✅ DATABASE SCHEMA VERIFICATION PASSED"
- [ ] **2.5** Check that all tables exist:
  - `users`
  - `auth_sessions`
  - `login_nonces`
  - `snippets` (with `owner` column)
- [ ] **2.6** Verify indexes are created for performance

### Phase 3: Code Implementation

- [ ] **3.1** Verify middleware.ts exists in project root
- [ ] **3.2** Verify authentication routes exist:
  - [ ] `app/api/auth/nonce/route.ts`
  - [ ] `app/api/auth/verify/route.ts`
  - [ ] `app/api/auth/logout/route.ts`
- [ ] **3.3** Verify auth utilities exist:
  - [ ] `lib/auth.ts` (JWT, signature verification, nonce management)
  - [ ] `lib/auth-middleware.ts` (authentication middleware)
- [ ] **3.4** Verify wallet components:
  - [ ] `components/WalletConnect.tsx` (wallet connection UI)
  - [ ] `components/ClientWalletProvider.tsx` (wallet context provider)
- [ ] **3.5** Verify snippets route includes authentication:
  - [ ] `app/api/snippets/route.ts` has `POST` protection

### Phase 4: Type Safety & Compilation

- [ ] **4.1** Build the project:
  ```bash
  npm run build
  ```
- [ ] **4.2** No TypeScript errors should appear
- [ ] **4.3** No build warnings or errors
- [ ] **4.4** Verify build output: `.next` folder created successfully

### Phase 5: Local Testing

Complete all tests from `TESTING_GUIDE_AUTHENTICATION.md`:

- [ ] **5.1** TEST 1: Wallet Connection and Authentication ✅
- [ ] **5.2** TEST 2: Create Snippet with Authentication ✅
- [ ] **5.3** TEST 3: Verify Nonce Generation ✅
- [ ] **5.4** TEST 4: Verify JWT Token Validation ✅
- [ ] **5.5** TEST 5: Middleware Authentication ✅
- [ ] **5.6** TEST 6: User Logout and Session Invalidation ✅
- [ ] **5.7** TEST 7: Signature Verification Security ✅
- [ ] **5.8** TEST 8: Backward Compatibility ✅

### Phase 6: Security Review

- [ ] **6.1** JWT_SECRET is at least 32 characters and cryptographically secure
- [ ] **6.2** JWT_SECRET is NOT hardcoded, only in environment variables
- [ ] **6.3** Database connection uses SSL: `?sslmode=require` in DATABASE_URL
- [ ] **6.4** Private keys never stored on server-side
- [ ] **6.5** Nonce single-use enforced (prevents replay attacks)
- [ ] **6.6** Nonce expiration set to 15 minutes
- [ ] **6.7** JWT expiration set to 7 days
- [ ] **6.8** Session tokens are hashed before storage (SHA-256)
- [ ] **6.9** Token validation checks both format and expiration
- [ ] **6.10** Middleware blocks unauthorized access to protected routes

### Phase 7: Documentation

- [ ] **7.1** AUTHENTICATION_GUIDE.md exists and is up-to-date
- [ ] **7.2** TESTING_GUIDE_AUTHENTICATION.md exists with complete test cases
- [ ] **7.3** This deployment checklist is completed
- [ ] **7.4** .env.example documents all required variables
- [ ] **7.5** README updated to mention authentication features
- [ ] **7.6** Comments added to code explaining key functions

### Phase 8: Performance & Monitoring

- [ ] **8.1** Database indexes are created for:
  - `users(wallet_address)`
  - `auth_sessions(wallet_address)`
  - `auth_sessions(expires_at)`
  - `login_nonces(nonce)`
  - `snippets(owner)`
- [ ] **8.2** Query performance tested (should be < 100ms)
- [ ] **8.3** Error logging configured (check lib/auth.ts for console.error calls)
- [ ] **8.4** Monitoring setup in place for failed auth attempts

### Phase 9: Deployment Configuration

#### For Vercel Deployment:

- [ ] **9.1** Set environment variables in Vercel dashboard:
  - DATABASE_URL
  - JWT_SECRET
  - NEXT_PUBLIC_STELLAR_NETWORK
  - NEXT_PUBLIC_APP_URL
- [ ] **9.2** Build command: `npm run build` (default, already configured)
- [ ] **9.3** Start command: `npm start` (default, already configured)

#### For Self-Hosted Deployment:

- [ ] **9.1** Node.js version compatible (v18+)
- [ ] **9.2** Environment variables set in production environment
- [ ] **9.3** Database credentials securely configured
- [ ] **9.4** SSL/TLS enabled for all connections
- [ ] **9.5** Regular backups configured for database

#### For Docker Deployment:

- [ ] **9.1** Dockerfile configured with all dependencies
- [ ] **9.2** Environment variables passed via docker-compose or secrets
- [ ] **9.3** Database migrations run on container startup

### Phase 10: Production Network Setup

#### For Mainnet (if deploying to production):

- [ ] **10.1** Update `NEXT_PUBLIC_STELLAR_NETWORK` from "testnet" to "public"
- [ ] **10.2** Update `NEXT_PUBLIC_APP_URL` to production domain
- [ ] **10.3** Rotate JWT_SECRET if it was used in development
- [ ] **10.4** Test with mainnet wallet addresses
- [ ] **10.5** Ensure proper CORS configuration

#### For Testnet (recommended for initial deployment):

- [ ] **10.1** Keep `NEXT_PUBLIC_STELLAR_NETWORK` as "testnet"
- [ ] **10.2** Update `NEXT_PUBLIC_APP_URL` to staging domain
- [ ] **10.3** Use staging wallet extensions (Freighter testnet)

### Phase 11: Acceptance Criteria Verification

Verify all original acceptance criteria are met:

- [ ] **✅ 11.1** Users must authenticate via Stellar wallet signature verification
  - Verified in TEST 1 of testing guide
- [ ] **✅ 11.2** Wallet signature validated against public key
  - Verified in TEST 7 of testing guide
- [ ] **✅ 11.3** Successful verification issues secure session token (JWT)
  - Verified in TEST 1 and TEST 4 of testing guide
- [ ] **✅ 11.4** Invalid/missing signatures rejected with clear error responses
  - Verified in TEST 7 of testing guide
- [ ] **✅ 11.5** Middleware enforces authentication for protected routes
  - Verified in TEST 5 of testing guide
- [ ] **✅ 11.6** Backward compatibility for existing users maintained
  - Verified in TEST 8 of testing guide

### Phase 12: Team Communication

- [ ] **12.1** Team notified of deployment
- [ ] **12.2** Rollback plan documented (if needed)
- [ ] **12.3** Monitoring alerts configured
- [ ] **12.4** Support documentation shared with team
- [ ] **12.5** Known issues documented (if any)

---

## 🚀 Deployment Steps

### Step 1: Pre-Deployment Review

```bash
# Verify all checks from this checklist are completed
# Run local tests one final time
npm run dev
# Then navigate to http://localhost:3000 and run TEST 1-3
```

### Step 2: Build for Production

```bash
npm run build
# Verify no errors and output is created
```

### Step 3: Deploy

```bash
# For Vercel: git push (auto-deploys)
# For self-hosted: npm start
# For Docker: docker build . && docker run ...
```

### Step 4: Post-Deployment Verification

```bash
# Test on production environment:
# 1. Navigate to https://your-production-domain.com
# 2. Test wallet connection
# 3. Test snippet creation
# 4. Verify database migrations applied
```

---

## 🔄 Rollback Plan

If issues occur in production:

### Immediate Rollback (< 1 hour of downtime)

1. Revert to previous deployment
2. Keep database schema (migrations are backward compatible)
3. Clear JWT tokens from localStorage (users need to re-authenticate)
4. Notify team of rollback

### Partial Rollback (if only API affected)

1. Revert API code but keep frontend
2. Frontend will show JWT errors (users can re-login)
3. Manually clear old sessions from database

### Database Rollback

```sql
-- If needed, remove authentication tables (CAREFULLY!)
-- Keep this command for emergency only

-- DO NOT RUN in production without backup
-- DROP TABLE auth_sessions CASCADE;
-- DROP TABLE login_nonces CASCADE;
-- DROP TABLE users CASCADE;
-- ALTER TABLE snippets DROP COLUMN owner;
```

---

## 📊 Post-Deployment Monitoring

### Monitor These Metrics:

- Failed authentication attempts (401 errors)
- JWT token validation failures
- Database connection errors
- Signature verification failures
- Session expiration rate

### Set Alerts For:

- High rate of failed logins (> 10 per minute)
- Database connection issues
- JWT verification errors
- Middleware 401 responses (> 5% of requests)

### Daily Checks:

- [ ] No unexplained errors in logs
- [ ] Database size growing normally
- [ ] JWT tokens expiring as expected
- [ ] Users able to connect and create snippets

---

## ✅ Completion Sign-Off

Once all checks are complete, the assignment is ready for production:

```
Deployment Status: ✅ READY FOR PRODUCTION

Assignment: Issue #45 - Stellar Wallet Authentication (Full Login Flow)
Completed By: [Your Name]
Date: [Date]
Environment: [testnet/mainnet]
Database: [NeonDB/PostgreSQL]
Notes: [Any relevant notes]
```

---

## 📞 Support & Troubleshooting

If issues arise during deployment:

1. **Check logs:**

   ```bash
   # View application logs
   # For Vercel: Check Vercel dashboard
   # For self-hosted: Check server logs
   ```

2. **Verify database:**

   ```bash
   npx ts-node lib/verify-db-schema.ts
   ```

3. **Test authentication endpoints:**

   ```bash
   curl http://localhost:3000/api/auth/nonce
   curl http://localhost:3000/api/snippets
   ```

4. **Contact team:** If issues persist, contact the team lead with:
   - Error logs
   - Screenshot of issue
   - Steps to reproduce
   - Environment details

---

**End of Deployment Checklist**
