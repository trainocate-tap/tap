-- ============================================================
-- ITAMS Migration 030: Per-country Product IDs
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor)
-- Settings > Product IDs now scopes each country to its own codes.
-- Existing rows are left with country = NULL, meaning they stay
-- visible to every country as shared/legacy codes; only new codes
-- created after this migration get tagged to a specific country.
-- ============================================================

ALTER TABLE product_ids ADD COLUMN IF NOT EXISTS country TEXT;
