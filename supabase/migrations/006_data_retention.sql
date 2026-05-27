-- ============================================================
-- Migration 006: Data retention / cleanup functions
--
-- pg_cron is available on Supabase Pro plans but NOT on the
-- free tier. We create both:
--   1. pg_cron scheduled jobs (wrapped in a safety check)
--   2. Standalone functions that can be called manually or
--      from an Edge Function on a schedule
--
-- Retention windows:
--   - search_history: 90 days
--   - processing_logs: 30 days
-- ============================================================


-- ============================================================
-- 1. Cleanup function — works on any tier
--    Can be called manually:  SELECT cleanup_expired_data();
--    Or from an Edge Function via supabase.rpc('cleanup_expired_data')
--
--    SECURITY DEFINER: runs with the privileges of the function
--    owner (postgres), so it can delete rows even if the caller
--    is anon. The function is safe because it only deletes
--    expired data — no user input controls what gets deleted.
-- ============================================================
CREATE OR REPLACE FUNCTION cleanup_expired_data()
RETURNS jsonb AS $$
DECLARE
  search_deleted int;
  logs_deleted int;
BEGIN
  -- Delete search history older than 90 days
  DELETE FROM search_history
  WHERE created_at < NOW() - INTERVAL '90 days';
  GET DIAGNOSTICS search_deleted = ROW_COUNT;

  -- Delete processing logs older than 30 days (if table exists)
  BEGIN
    DELETE FROM processing_logs
    WHERE created_at < NOW() - INTERVAL '30 days';
    GET DIAGNOSTICS logs_deleted = ROW_COUNT;
  EXCEPTION WHEN undefined_table THEN
    logs_deleted := 0;
  END;

  RETURN jsonb_build_object(
    'search_history_deleted', search_deleted,
    'processing_logs_deleted', logs_deleted,
    'executed_at', NOW()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to anon so it can be called via supabase.rpc()
-- (The function runs as SECURITY DEFINER regardless of caller)
GRANT EXECUTE ON FUNCTION cleanup_expired_data() TO anon;


-- ============================================================
-- 2. pg_cron scheduled jobs — only if pg_cron is available
--    Runs daily at 3:00 AM UTC
-- ============================================================
DO $$
BEGIN
  -- Check if pg_cron extension is available
  IF EXISTS (
    SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron'
  ) THEN
    -- Enable pg_cron if not already enabled
    CREATE EXTENSION IF NOT EXISTS pg_cron;

    -- Schedule daily cleanup at 3 AM UTC
    -- Unschedule first to avoid duplicates on re-run
    PERFORM cron.unschedule('cleanup-search-history');
    PERFORM cron.unschedule('cleanup-processing-logs');

    PERFORM cron.schedule(
      'cleanup-search-history',
      '0 3 * * *',
      $$DELETE FROM public.search_history WHERE created_at < NOW() - INTERVAL '90 days'$$
    );

    PERFORM cron.schedule(
      'cleanup-processing-logs',
      '0 3 * * *',
      $$DELETE FROM public.processing_logs WHERE created_at < NOW() - INTERVAL '30 days'$$
    );

    RAISE NOTICE 'pg_cron jobs scheduled successfully';
  ELSE
    RAISE NOTICE 'pg_cron not available on this tier — use cleanup_expired_data() manually or via Edge Function';
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- pg_cron may be available but not enabled, or unschedule may fail
  -- on first run. Either way, the standalone function above still works.
  RAISE NOTICE 'pg_cron setup skipped: % — use cleanup_expired_data() instead', SQLERRM;
END
$$;
