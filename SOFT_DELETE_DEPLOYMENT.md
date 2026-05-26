# Soft Delete - Deployment Checklist

## Pre-Deployment

### Code Review
- [ ] Review all code changes in `snippet.repository.ts`
- [ ] Review all code changes in `snippet.service.ts`
- [ ] Review all code changes in `[id]/route.ts`
- [ ] Review all code changes in `ownership.middleware.ts`
- [ ] Review new `activity-logger.ts` implementation
- [ ] Review new endpoint implementations
- [ ] Verify no breaking changes to existing APIs
- [ ] Check for security vulnerabilities
- [ ] Verify error handling is comprehensive

### Testing
- [ ] Run unit tests: `npm test`
- [ ] Run integration tests: `npm test -- --testPathPattern=integration`
- [ ] Run linter: `npm run lint`
- [ ] Run type checker: `npm run type-check`
- [ ] Manual testing of all endpoints
- [ ] Test with multiple wallet addresses
- [ ] Test error scenarios
- [ ] Performance testing with large datasets

### Database
- [ ] Backup production database
- [ ] Test migration on staging database
- [ ] Verify migration script syntax
- [ ] Check for any data conflicts
- [ ] Verify indexes are created correctly
- [ ] Test rollback procedure

### Documentation
- [ ] Review `SOFT_DELETE_IMPLEMENTATION.md`
- [ ] Review `SOFT_DELETE_TESTING.md`
- [ ] Review `SOFT_DELETE_FRONTEND.md`
- [ ] Review `SOFT_DELETE_QUICK_START.md`
- [ ] Update API documentation
- [ ] Update changelog
- [ ] Prepare release notes

## Staging Deployment

### Database Migration
```bash
# 1. Backup staging database
pg_dump $STAGING_DATABASE_URL > staging_backup.sql

# 2. Run migration
psql $STAGING_DATABASE_URL < scripts/add-soft-delete.sql

# 3. Verify migration
psql $STAGING_DATABASE_URL -c "SELECT column_name FROM information_schema.columns WHERE table_name = 'snippets' AND column_name IN ('is_deleted', 'deleted_at', 'deleted_by');"

# 4. Verify indexes
psql $STAGING_DATABASE_URL -c "SELECT indexname FROM pg_indexes WHERE tablename = 'snippets' AND indexname LIKE 'idx_snippets_%';"

# 5. Verify activity_logs table
psql $STAGING_DATABASE_URL -c "SELECT * FROM information_schema.tables WHERE table_name = 'activity_logs';"
```

### Code Deployment
- [ ] Deploy backend code to staging
- [ ] Verify all new files are present
- [ ] Verify all modified files are updated
- [ ] Check environment variables
- [ ] Restart application server
- [ ] Check application logs for errors

### Staging Testing
- [ ] Test delete endpoint: `DELETE /api/snippets/[id]`
- [ ] Test trash endpoint: `GET /api/snippets/trash`
- [ ] Test restore endpoint: `POST /api/snippets/[id]/restore`
- [ ] Test activity endpoint: `GET /api/snippets/[id]/activity`
- [ ] Test pagination in trash
- [ ] Test ownership verification
- [ ] Test error scenarios
- [ ] Test with multiple users
- [ ] Verify activity logs are created
- [ ] Check database for soft-deleted snippets
- [ ] Verify indexes are being used
- [ ] Performance test with large datasets

### Staging Sign-Off
- [ ] QA team approves
- [ ] Product team approves
- [ ] Security team approves
- [ ] Performance acceptable
- [ ] No critical issues found

## Production Deployment

### Pre-Production Checklist
- [ ] All staging tests passed
- [ ] All approvals obtained
- [ ] Rollback plan documented
- [ ] Monitoring alerts configured
- [ ] Support team briefed
- [ ] Deployment window scheduled
- [ ] Communication plan ready

### Production Database Migration
```bash
# 1. Backup production database
pg_dump $DATABASE_URL > production_backup_$(date +%Y%m%d_%H%M%S).sql

# 2. Run migration
psql $DATABASE_URL < scripts/add-soft-delete.sql

# 3. Verify migration
psql $DATABASE_URL -c "SELECT column_name FROM information_schema.columns WHERE table_name = 'snippets' AND column_name IN ('is_deleted', 'deleted_at', 'deleted_by');"

# 4. Verify indexes
psql $DATABASE_URL -c "SELECT indexname FROM pg_indexes WHERE tablename = 'snippets' AND indexname LIKE 'idx_snippets_%';"

# 5. Verify activity_logs table
psql $DATABASE_URL -c "SELECT * FROM information_schema.tables WHERE table_name = 'activity_logs';"
```

### Production Code Deployment
- [ ] Deploy backend code to production
- [ ] Verify all new files are present
- [ ] Verify all modified files are updated
- [ ] Check environment variables
- [ ] Restart application server
- [ ] Monitor application logs
- [ ] Check error tracking (Sentry, etc.)
- [ ] Monitor performance metrics

### Production Verification
- [ ] Test delete endpoint with real data
- [ ] Test trash endpoint
- [ ] Test restore endpoint
- [ ] Test activity endpoint
- [ ] Verify activity logs are created
- [ ] Check database performance
- [ ] Monitor error rates
- [ ] Monitor response times
- [ ] Check user feedback

### Post-Deployment Monitoring
- [ ] Monitor error logs for 24 hours
- [ ] Monitor performance metrics
- [ ] Monitor database performance
- [ ] Check user reports
- [ ] Verify no data loss
- [ ] Verify activity logs are accurate

## Rollback Plan

### If Issues Occur

#### Option 1: Rollback Code Only
```bash
# 1. Revert code to previous version
git revert <commit-hash>

# 2. Redeploy previous version
npm run build
npm run deploy

# 3. Verify application is working
curl http://api.codely.com/api/snippets
```

#### Option 2: Rollback Database
```bash
# 1. Stop application
systemctl stop codely-api

# 2. Restore database from backup
psql $DATABASE_URL < production_backup_YYYYMMDD_HHMMSS.sql

# 3. Verify database
psql $DATABASE_URL -c "SELECT COUNT(*) FROM snippets;"

# 4. Restart application
systemctl start codely-api

# 5. Verify application
curl http://api.codely.com/api/snippets
```

#### Option 3: Full Rollback
```bash
# 1. Stop application
systemctl stop codely-api

# 2. Restore database
psql $DATABASE_URL < production_backup_YYYYMMDD_HHMMSS.sql

# 3. Revert code
git revert <commit-hash>

# 4. Rebuild and redeploy
npm run build
npm run deploy

# 5. Restart application
systemctl start codely-api

# 6. Verify everything
curl http://api.codely.com/api/snippets
```

## Post-Deployment

### Frontend Implementation
- [ ] Create TrashSection component
- [ ] Create DeleteConfirmationDialog component
- [ ] Create ActivityTimeline component
- [ ] Update SnippetCard component
- [ ] Create trash page
- [ ] Update navbar with trash link
- [ ] Test all frontend components
- [ ] Deploy frontend code

### Documentation Updates
- [ ] Update API documentation
- [ ] Update user guide
- [ ] Update changelog
- [ ] Publish release notes
- [ ] Update FAQ

### Monitoring
- [ ] Set up alerts for soft delete operations
- [ ] Monitor activity log growth
- [ ] Monitor trash size
- [ ] Monitor query performance
- [ ] Set up dashboards

### User Communication
- [ ] Announce new feature
- [ ] Provide user guide
- [ ] Answer user questions
- [ ] Gather feedback
- [ ] Monitor adoption

## Deployment Timeline

### Week 1: Preparation
- [ ] Code review
- [ ] Testing
- [ ] Documentation
- [ ] Staging deployment

### Week 2: Staging Validation
- [ ] QA testing
- [ ] Performance testing
- [ ] Security review
- [ ] Sign-off

### Week 3: Production Deployment
- [ ] Database migration
- [ ] Code deployment
- [ ] Verification
- [ ] Monitoring

### Week 4: Frontend & Polish
- [ ] Frontend implementation
- [ ] User communication
- [ ] Feedback collection
- [ ] Bug fixes

## Success Criteria

### Technical
- [ ] All endpoints working correctly
- [ ] Activity logs created for all actions
- [ ] Ownership verification working
- [ ] Pagination working
- [ ] Performance acceptable (< 100ms)
- [ ] No data loss
- [ ] No critical errors

### User Experience
- [ ] Users can delete snippets
- [ ] Users can view trash
- [ ] Users can restore snippets
- [ ] Users can see activity history
- [ ] Clear error messages
- [ ] Intuitive UI

### Business
- [ ] Reduced support tickets for accidental deletes
- [ ] Positive user feedback
- [ ] No revenue impact
- [ ] Improved user retention

## Monitoring Queries

### Check Soft Delete Activity
```sql
-- Count deleted snippets
SELECT COUNT(*) as deleted_count FROM snippets WHERE is_deleted = true;

-- Count active snippets
SELECT COUNT(*) as active_count FROM snippets WHERE is_deleted = false;

-- Recent deletions
SELECT id, title, deleted_at, deleted_by FROM snippets 
WHERE is_deleted = true 
ORDER BY deleted_at DESC 
LIMIT 10;

-- Activity log summary
SELECT action, COUNT(*) as count FROM activity_logs 
GROUP BY action 
ORDER BY count DESC;

-- Recent activity
SELECT * FROM activity_logs 
ORDER BY created_at DESC 
LIMIT 20;
```

### Performance Monitoring
```sql
-- Check index usage
SELECT schemaname, tablename, indexname, idx_scan 
FROM pg_stat_user_indexes 
WHERE tablename IN ('snippets', 'activity_logs') 
ORDER BY idx_scan DESC;

-- Check query performance
EXPLAIN ANALYZE
SELECT * FROM snippets 
WHERE is_deleted = false 
ORDER BY created_at DESC 
LIMIT 20;

-- Check table size
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables 
WHERE tablename IN ('snippets', 'activity_logs')
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

## Incident Response

### If Soft Delete Not Working
1. Check application logs
2. Verify database migration ran
3. Verify `is_deleted` column exists
4. Check for SQL errors
5. Rollback if necessary

### If Activity Logs Not Created
1. Verify `activity_logs` table exists
2. Check `ActivityLogger.log()` is called
3. Check for database errors
4. Verify permissions

### If Performance Degraded
1. Check index usage
2. Run EXPLAIN ANALYZE
3. Check database load
4. Optimize queries if needed
5. Consider caching

### If Data Loss Occurs
1. Stop application immediately
2. Restore from backup
3. Investigate root cause
4. Implement fix
5. Redeploy

## Sign-Off

- [ ] Development Lead: _________________ Date: _______
- [ ] QA Lead: _________________ Date: _______
- [ ] DevOps Lead: _________________ Date: _______
- [ ] Product Manager: _________________ Date: _______
- [ ] Security Lead: _________________ Date: _______

## Notes

```
[Space for deployment notes and observations]
```

## Contact Information

- **On-Call Engineer**: [Name] [Phone] [Email]
- **Database Admin**: [Name] [Phone] [Email]
- **Product Manager**: [Name] [Phone] [Email]
- **Support Lead**: [Name] [Phone] [Email]
