-- ============================================================
-- ITAMS Migration 029: Rejection timestamp on marketing approvals
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor)
-- marketing_approvals had approved_at but no equivalent for
-- rejections, so the Admin Activity report couldn't show when
-- a request was rejected.
-- ============================================================

ALTER TABLE marketing_approvals ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ;
