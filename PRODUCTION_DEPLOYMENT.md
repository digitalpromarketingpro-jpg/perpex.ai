# 🚀 PerpEx — Production Deployment Guide

## Pre-Deployment Checklist

### 1. Database Setup (Supabase)

#### Initial Schema
```bash
# Run in Supabase SQL Editor
psql -f supabase/schema.sql
psql -f supabase/production-optimizations.sql
```

#### Configure Connection Pooling
- Go to **Supabase Dashboard** → **Database** → **Connection Pooling**
- Mode: **Transaction**
- Pool Size: **15** (per CPU core)
- Max Client Connections: **100**

#### Enable pg_cron for Automated Tasks
```sql
-- Run in Supabase SQL Editor
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Cleanup old rate limits every hour
SELECT cron.schedule(
  'cleanup-rate-limits',
  '0 * * * *',
  $$SELECT cleanup_old_rate_limits()$$
);

-- Archive old trades daily at 3am UTC
SELECT cron.schedule(
  'archive-trades',
  '0 3 * * *',
  $$SELECT archive_old_trades()$$
);

-- Refresh leaderboard every 5 minutes
SELECT cron.schedule(
  'refresh-leaderboard',
  '*/5 * * * *',
  $$REFRESH MATERIALIZED VIEW CONCURRENTLY user_leaderboard$$
);
```

### 2. Environment Variables

Create `.env.local` (production):
```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Google OAuth (configured in Supabase Dashboard)
# Client ID and Secret are set in Supabase Auth → Providers → Google

# Analytics (optional)
NEXT_PUBLIC_ANALYTICS_ID=your-analytics-id

# Error Tracking (optional - Sentry)
NEXT_PUBLIC_SENTRY_DSN=your-sentry-dsn
SENTRY_AUTH_TOKEN=your-sentry-auth-token
```

### 3. Google OAuth Configuration

#### Supabase Dashboard
1. Go to **Authentication** → **Providers** → **Google**
2. Toggle **Enabled**
3. Paste:
   - **Client ID**: `YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com`
   - **Client Secret**: `YOUR_GOOGLE_CLIENT_SECRET`
4. Copy the **Callback URL** (e.g., `https://YOUR_PROJECT_ID.supabase.co/auth/v1/callback`)

#### Google Cloud Console
1. Go to **APIs & Services** → **Credentials**
2. Select your OAuth 2.0 Client ID
3. Add to **Authorized redirect URIs**:
   - `https://YOUR_PROJECT_ID.supabase.co/auth/v1/callback`
   - `http://localhost:3000` (for local dev)
4. Add to **Authorized JavaScript origins**:
   - `https://your-production-domain.com`
   - `http://localhost:3000` (for local dev)

### 4. Build & Deploy (Vercel)

```bash
# Install dependencies
npm install

# Type check
npx tsc --noEmit

# Build for production
npm run build

# Deploy to Vercel
vercel --prod
```

#### Vercel Environment Variables
Add all `.env.local` variables to **Vercel Dashboard** → **Settings** → **Environment Variables**

### 5. Performance Monitoring

#### Database Monitoring
```sql
-- Check slow queries (run weekly)
SELECT * FROM slow_queries;

-- Check connection pool usage
SELECT 
  count(*) as active_connections,
  max_conn as max_connections
FROM pg_stat_activity, 
  (SELECT setting::int as max_conn FROM pg_settings WHERE name='max_connections') s
GROUP BY max_conn;

-- Check table sizes
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

#### Application Monitoring
- **Vercel Analytics**: Enabled by default
- **Sentry** (optional): Add DSN to `.env.local`
- **LogRocket** (optional): Add project ID to `lib/logger.ts`

### 6. Security Hardening

#### Rate Limiting
Already implemented in:
- `lib/rate-limiter.ts` (client-side)
- `supabase/production-optimizations.sql` (database-level)

Limits:
- Auth login: 5 attempts/minute
- Auth register: 3 attempts/minute
- Trade orders: 20/minute
- Position closes: 30/minute
- Wallet deposits: 10 per 5 minutes
- Wallet withdrawals: 5 per 5 minutes

#### Row Level Security (RLS)
All tables have RLS enabled. Users can ONLY access their own data.

#### SQL Injection Protection
All RPC functions use parameterized queries (`$$`) and `SECURITY DEFINER` with explicit `search_path`.

### 7. Scaling for 1M+ Users

#### Database
- ✅ Connection pooling (pgBouncer) configured
- ✅ Indexes on all foreign keys and common queries
- ✅ Partial indexes for hot paths (pending orders, active positions)
- ✅ Autovacuum tuned for high-write tables
- ✅ Materialized views for expensive queries (leaderboard)

#### Application
- ✅ Error boundaries on all critical components
- ✅ Rate limiting on all user actions
- ✅ Input sanitization on all forms
- ✅ Production logger (replaces console.log)
- ✅ Optimistic UI updates (no blocking DB calls)

#### WebSocket (Binance)
- ✅ Single shared connection per symbol
- ✅ Automatic reconnection on disconnect
- ✅ Backpressure handling (drop old updates if client is slow)

### 8. Monitoring Alerts

Set up alerts for:
- Database CPU > 80% for 5 minutes
- Connection pool saturation (>90% used)
- Slow query count spike (>10 queries >1s)
- Error rate > 1% of requests
- WebSocket disconnections > 5/hour

### 9. Backup Strategy

#### Supabase
- **Automatic daily backups** (enabled by default on Pro plan)
- **Point-in-time recovery** (PITR) available

#### Manual Backup
```bash
# Backup database
pg_dump -h db.your-project.supabase.co -U postgres -d postgres > backup.sql

# Restore
psql -h db.your-project.supabase.co -U postgres -d postgres < backup.sql
```

### 10. Post-Deployment Verification

```bash
# Health check endpoints
curl https://your-domain.com/
# Should return 200 OK

# Test Google OAuth
# 1. Open https://your-domain.com
# 2. Click "Continuar com Google"
# 3. Verify redirect to Google
# 4. Verify redirect back with session

# Test trading flow
# 1. Login
# 2. Open a position (Market order)
# 3. Close the position
# 4. Verify PnL calculation
# 5. Check trade history

# Database verification
SELECT count(*) FROM profiles;
SELECT count(*) FROM active_positions;
SELECT count(*) FROM trade_history;
```

---

## Performance Benchmarks

### Expected Performance (1M concurrent users)

| Metric | Target | Notes |
|--------|--------|-------|
| Page Load | <2s | First Contentful Paint |
| Order Execution | <100ms | Client-side optimistic update |
| DB Query (indexed) | <50ms | p95 latency |
| WebSocket Latency | <100ms | Binance → Client |
| Error Rate | <0.1% | Excluding user input errors |

### Database Capacity

| Table | Rows/User | 1M Users | Storage (est.) |
|-------|-----------|----------|----------------|
| profiles | 1 | 1M | ~100 MB |
| active_positions | 0-10 | 5M | ~500 MB |
| trade_history | 100-1000 | 500M | ~50 GB |
| pending_orders | 0-20 | 10M | ~1 GB |

**Total estimated storage**: ~52 GB for 1M users with 6 months of history

---

## Troubleshooting

### High Database CPU
1. Check `slow_queries` view
2. Add missing indexes
3. Increase connection pool size
4. Consider read replicas (Supabase Pro)

### WebSocket Disconnections
1. Check Binance API status
2. Verify network stability
3. Review reconnection logic in `hooks/use-binance-manager.ts`

### Memory Leaks
1. Check for unclosed subscriptions
2. Review `useEffect` cleanup functions
3. Monitor browser DevTools → Memory tab

### Rate Limit False Positives
1. Adjust limits in `lib/rate-limiter.ts`
2. Consider user-specific limits based on account age/tier

---

## Support & Maintenance

### Weekly Tasks
- Review `slow_queries` view
- Check error logs in Sentry/Vercel
- Monitor database size growth
- Review rate limit hit counts

### Monthly Tasks
- Analyze user behavior patterns
- Optimize hot paths based on real usage
- Review and update indexes
- Archive old data (>90 days)

### Quarterly Tasks
- Security audit (dependencies, RLS policies)
- Performance benchmarking
- Disaster recovery drill (restore from backup)
- Capacity planning review

---

## License & Credits

Built with:
- **Next.js 16** (React framework)
- **Supabase** (PostgreSQL + Auth + Realtime)
- **TradingView Lightweight Charts** (charting)
- **Binance WebSocket API** (market data)
- **Tailwind CSS** + **shadcn/ui** (styling)

---

**Production-ready as of**: March 2026  
**Last updated**: This deployment guide
