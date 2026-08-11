-- ============================================================
-- ITAMS Migration 027: Track previous borrower on assets
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor)
-- Lets EditAsset stash the current assigned_user before an asset
-- goes to "borrowed" status, so Borrow.jsx's handleApproveReturn
-- can restore it instead of nulling assigned_user on release.
-- ============================================================

ALTER TABLE assets ADD COLUMN IF NOT EXISTS prev_borrower TEXT;
