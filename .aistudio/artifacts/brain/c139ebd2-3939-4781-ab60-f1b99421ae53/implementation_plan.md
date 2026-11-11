# Implementation Plan: Migrating to Firebase & Updating TV Management

## Phase 1: Firebase Integration & Data Migration
1. **Provision Firebase**: (In progress) Initialize Firestore and Authentication.
2. **Data Blueprint**: Create `firebase-blueprint.json` mapping all existing Supabase tables (`pos_settings`, `products`, `orders`, etc.) to Firestore collections.
3. **Data Migration**: Develop a script to extract data from Supabase and seed it into Firestore (using Firebase Admin SDK or client SDKs in a secure script).

## Phase 2: Refactoring Codebase
1. **AppContext Update**: Replace Supabase `posClient`/`payClient` with Firebase Firestore and Auth SDKs.
2. **Auth Refactor**: Update login flows to use Firebase Auth.
3. **Data Access Refactor**: Update all services (`store.ts`, `loyalty.ts`, etc.) to use Firestore instead of Supabase.

## Phase 3: TV Management & UI Fixes
1. **Integrate TV Controls**: Move the full-screen TV control logic (from `PickupControlScreen.tsx`) into the `ManagerScreen.tsx`'s 'Ops' tab, making it live and intuitive.
2. **GTA Easter Egg Bug**: Fix the building spawn logic to ensure targets are only spawned on roads and not inside buildings.

## Phase 4: Verification
1. Run a comprehensive audit of rules.
2. Verify data integrity post-migration.
3. Smoke test the TV controls and GTA Easter Egg.
