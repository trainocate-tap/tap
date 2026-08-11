-- ============================================================
-- ITAMS Migration 026: Fix "Clear all" notifications bug
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor)
-- RLS was enabled on notifications with SELECT/INSERT/UPDATE
-- policies but no DELETE policy, so clearAllNotifications()
-- silently deleted 0 rows and cleared notifications reappeared
-- after refresh.
-- ============================================================

CREATE POLICY "Users delete own notifications"
  ON notifications FOR DELETE TO authenticated
  USING (target_user_id = auth.uid() OR (target_user_id IS NULL AND user_id = auth.uid()));
