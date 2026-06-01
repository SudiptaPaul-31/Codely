# 🔧 Vercel Authorization Failure - Troubleshooting Guide

**Issue:**

- ❌ Vercel – codely - Authorization required to deploy
- ❌ Vercel – v0-code-snippets-platform-24 - Authorization required to deploy

**Status:** Authorization failures blocking deployment  
**Date:** April 26, 2026

---

## 🎯 Quick Diagnosis

These errors mean:

1. Vercel doesn't have permission to deploy from GitHub
2. OR Vercel GitHub App isn't properly installed
3. OR Environment variables aren't configured in Vercel
4. OR Both Vercel projects are out of sync

---

## ✅ Solution - Step by Step

### **STEP 1: Verify Vercel Project Connection (5 minutes)**

Go to: https://vercel.com/dashboard

**Check:**

1. [ ] Is project "codely" connected?
2. [ ] Is project "v0-code-snippets-platform-24" connected?
3. [ ] Are both projects linked to correct GitHub repo?

**If not connected:**

- [ ] Add new project
- [ ] Select GitHub repo: `SudiptaPaul-31/Codely`
- [ ] Select framework: Next.js
- [ ] Click "Deploy"

---

### **STEP 2: Reconnect GitHub to Vercel (10 minutes)**

**Option A: Using Vercel Dashboard**

1. Go to: https://vercel.com/account/integrations
2. Find: "GitHub" integration
3. [ ] Click "Manage"
4. [ ] Check if app is authorized
5. [ ] If not, click "Install" or "Reinstall"
6. [ ] Select repository: `SudiptaPaul-31/Codely`
7. [ ] Grant all necessary permissions
8. [ ] Authorize

**Option B: Reinstall GitHub App**

1. Go to: GitHub Settings → Developer settings → GitHub Apps
2. Find: "Vercel" app
3. [ ] Click "Edit"
4. [ ] Check permissions (should include "Contents" read/write)
5. [ ] Check "Repository access" includes your repo
6. [ ] If missing, click "Edit" and add your repo

---

### **STEP 3: Check Vercel Project Settings (10 minutes)**

For EACH project (codely + v0-code-snippets-platform-24):

**In Vercel Dashboard:**

1. [ ] Open Project Settings
2. [ ] Go to "Git"
3. [ ] Verify:
   - [ ] Repository is correct
   - [ ] Production branch is correct (usually `main`)
   - [ ] GitHub account is connected
4. [ ] Go to "Environment Variables"
5. [ ] Verify all required variables are set:
   - [ ] DATABASE_URL ✅
   - [ ] JWT_SECRET ✅
   - [ ] NEXT_PUBLIC_STELLAR_NETWORK ✅
   - [ ] NEXT_PUBLIC_APP_URL ✅

**If variables missing:**

1. [ ] Copy from `.env.example` or your local `.env.local`
2. [ ] Paste into Vercel Environment Variables
3. [ ] Mark sensitive ones as "Encrypted"
4. [ ] Save

---

### **STEP 4: Trigger Redeployment (5 minutes)**

After fixing settings:

**Option A: Automatic (Recommended)**

1. [ ] Make a small commit to repo (or add empty commit)
2. [ ] Push to GitHub
3. [ ] GitHub will trigger Vercel deployment

```bash
# Make empty commit to trigger redeployment
git commit --allow-empty -m "trigger deployment"
git push origin main
```

**Option B: Manual in Vercel**

1. [ ] Go to Vercel Dashboard
2. [ ] Open project
3. [ ] Click "Deployments"
4. [ ] Find the failed deployment
5. [ ] Click "⋮" (three dots)
6. [ ] Click "Redeploy"

**Option C: Manual using Vercel CLI**

```bash
# Install Vercel CLI if not already installed
npm i -g vercel

# Login to Vercel
vercel login

# Deploy
vercel --prod
```

---

### **STEP 5: Verify GitHub Status Check (5 minutes)**

If deployment was triggered via GitHub PR:

1. [ ] Go to your GitHub PR
2. [ ] Scroll to "Checks" section
3. [ ] Wait for Vercel checks to update
4. [ ] Should show ✅ after deployment succeeds

If still failing:

- [ ] Click "Details" on failing check
- [ ] Read error message carefully
- [ ] Go to Vercel dashboard and check build logs

---

## 🔍 Detailed Troubleshooting by Issue

### **Issue 1: "Authorization required to deploy"**

**Root Cause:** Vercel GitHub App not properly authorized

**Solutions:**

**Solution A: Reinstall GitHub App**

```
1. Go to: https://vercel.com/account/integrations/github
2. Click "Manage"
3. Look for your repository
4. If not there, click "Install GitHub App"
5. Select your repo
6. Click "Install"
7. Authorize access
```

**Solution B: Check GitHub OAuth Token**

```
1. Go to GitHub: Settings → Developer settings → Personal access tokens
2. Create new token if needed:
   - Name: "Vercel Deployment"
   - Scope: repo (full control)
   - Copy token
3. Go to Vercel dashboard
4. Account → Integrations → GitHub → "Manage"
5. Paste token if prompted
```

**Solution C: Disconnect and Reconnect**

```
1. Vercel Dashboard → Settings → Integrations
2. Find GitHub integration
3. Click "Disconnect"
4. Click "Connect"
5. Authorize with GitHub
6. Select repositories
7. Complete setup
```

---

### **Issue 2: Multiple Vercel Projects Out of Sync**

**Root Cause:** Both "codely" and "v0-code-snippets-platform-24" projects exist, might be pointing to different branches

**Solution:**

```
OPTION A: Use only one project (Recommended)
1. Decide which is the main project
2. Delete the other from Vercel dashboard
3. Keep only one: either "codely" OR "v0-code-snippets-platform-24"

OPTION B: Keep both but configure separately
1. Project 1 (codely):
   - Points to main branch
   - Has all environment variables

2. Project 2 (v0-code-snippets-platform-24):
   - Could point to develop branch (or delete it)
   - Same environment variables

OPTION C: Create alias
1. In main Vercel project
2. Add domain/alias for the second name
3. Delete the redundant project
```

---

## 📋 Complete Checklist to Fix

```
GitHub Connection
- [ ] Vercel GitHub App is installed
- [ ] App is authorized for your repository
- [ ] App has correct permissions (read + write)
- [ ] Repository access includes your repo

Vercel Project Setup
- [ ] Project is connected to correct GitHub repo
- [ ] Production branch is set correctly
- [ ] Build command is correct: npm run build
- [ ] Start command is correct: npm start
- [ ] Output directory is correct: .next

Environment Variables
- [ ] DATABASE_URL is set in Vercel
- [ ] JWT_SECRET is set in Vercel
- [ ] NEXT_PUBLIC_STELLAR_NETWORK is set
- [ ] NEXT_PUBLIC_APP_URL is set
- [ ] All values are correct (no typos)

Project Status
- [ ] Only one main Vercel project active
- [ ] Redundant projects deleted or aliased
- [ ] No conflicting deployments

Deployment Trigger
- [ ] Redeployment triggered (git push or manual)
- [ ] Vercel checks running
- [ ] Build logs showing successful build
- [ ] Deployment shows as "Ready"
```

---

## 🚀 Quick Fix (Under 5 Minutes)

**Try this first if you're in a hurry:**

```bash
# 1. Make empty commit to trigger redeployment
git commit --allow-empty -m "fix: trigger vercel redeployment"
git push origin main

# 2. Go to GitHub PR and wait for checks
# 3. Vercel should retry and hopefully succeed
```

If that doesn't work, proceed to full troubleshooting below.

---

## 🔐 Common Authorization Issues & Fixes

### **Issue: "Cannot read properties of undefined (reading 'name')'"**

- **Cause:** Vercel GitHub App missing repository access
- **Fix:** Reinstall GitHub App with correct repo selected

### **Issue: "Deploy token expired"**

- **Cause:** GitHub OAuth token expired
- **Fix:** Disconnect and reconnect GitHub integration

### **Issue: "Deploy canceled: GitHub check is missing"**

- **Cause:** GitHub branch protection requires Vercel check
- **Fix:** Let first deployment complete, then it will pass future checks

### **Issue: "Custom domain authorization failed"**

- **Cause:** DNS records not set correctly
- **Fix:** Follow Vercel's DNS configuration guide

---

## 📞 Still Not Working? Try These

### **Nuclear Option 1: Delete and Reconnect Project**

```bash
# 1. Go to Vercel Dashboard
# 2. Select project → Settings → Advanced
# 3. Click "Delete Project"
# 4. Confirm deletion

# 5. Go to https://vercel.com/new
# 6. Select GitHub repo
# 7. Click "Deploy"
# 8. Configure environment variables
# 9. Click "Deploy"
```

### **Nuclear Option 2: Delete Both Projects and Start Fresh**

```bash
# Delete codely project:
# Go to Vercel → codely → Settings → Delete

# Delete v0-code-snippets-platform-24 project:
# Go to Vercel → v0-code-snippets-platform-24 → Settings → Delete

# Start fresh:
# 1. Go to https://vercel.com/new
# 2. Import GitHub repo
# 3. Configure as new project
# 4. Deploy
```

### **Alternative: Deploy Using Vercel CLI**

```bash
# 1. Install Vercel CLI
npm install -g vercel

# 2. Login
vercel login

# 3. Link project
vercel link

# 4. Deploy
vercel --prod

# 5. Follow prompts
```

---

## ✅ After Fix: Verify Deployment Works

1. [ ] Go to Vercel Dashboard
2. [ ] Check build logs are green ✅
3. [ ] Deployment shows "Ready"
4. [ ] Visit preview URL and test
5. [ ] Go to GitHub PR and verify checks pass ✅
6. [ ] Verify wallet connection works on preview
7. [ ] Verify snippet creation works

---

## 📞 Getting Help

### **If Issue Persists:**

1. **Check Vercel Status:** https://www.vercelstatus.com/
2. **Contact Vercel Support:**
   - Email: support@vercel.com
   - Dashboard: Help → Contact Support
   - Include: Project name, GitHub repo, error logs

3. **Check GitHub Status:** https://www.githubstatus.com/

4. **Review Build Logs:**
   - Vercel Dashboard → Deployments → Failed deployment → View logs
   - Read full error message carefully
   - Google the specific error

---

## 🎯 Expected Outcome

After fixing:

- ✅ Vercel checks on GitHub PR should pass
- ✅ Deployment should complete successfully
- ✅ Preview URL should be available
- ✅ Can merge PR with passing checks
- ✅ Can deploy to production

---

## 🚨 Prevention: For Future PRs

To avoid this issue:

1. **Keep GitHub integration working:**
   - Reconnect every 3-6 months if unused
   - Check GitHub OAuth token validity

2. **Keep Vercel project clean:**
   - Delete unused projects
   - Keep only one main project per repo
   - Use branches for preview deploys

3. **Monitor PR checks:**
   - Always verify Vercel check passes
   - Read error messages if they fail
   - Fix immediately, don't merge with failures

4. **Maintain Environment Variables:**
   - Keep them in sync with code changes
   - Document all required variables
   - Rotate secrets regularly

---

## 📋 Summary

**Two-Step Quick Fix:**

1. ✅ Reinstall Vercel GitHub App (check Vercel integration settings)
2. ✅ Trigger redeployment (git push or Vercel redeploy button)

**If that doesn't work:**

- Follow the complete checklist above
- Check environment variables in Vercel
- Delete and recreate project if needed
- Use Vercel CLI as alternative

---

**Last Updated:** April 26, 2026  
**Issue Type:** Vercel Authorization  
**Severity:** Blocks Deployment  
**Estimated Fix Time:** 5-30 minutes

Good luck! 🚀 Let me know what you find in the build logs if the simple fixes don't work.
