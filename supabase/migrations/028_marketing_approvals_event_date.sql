-- ============================================================
-- ITAMS Migration 028: Event name + date on marketing approvals
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor)
-- The New Request form on the Marketing Approvals page collects
-- an event name and a date, which were previously stuffed into
-- the free-text reason field for lack of dedicated columns.
-- ============================================================

ALTER TABLE marketing_approvals
  ADD COLUMN IF NOT EXISTS event_name   TEXT,
  ADD COLUMN IF NOT EXISTS request_date DATE;
