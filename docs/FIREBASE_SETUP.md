# EHS V2 - Firebase first-time setup (2026-11-11)

Project: `ehs-environment-management`. Hosting is already deployed.

## 1. Enable Authentication

In Firebase Console > Build > Authentication > Get started > Sign-in method, enable **Google**, choose a support email, and Save. In Authentication > Settings > Authorized domains ensure `ehs-environment-management.web.app` and `ehs-environment-management.firebaseapp.com` appear. Do not enable anonymous access.

## 2. Create Cloud Firestore

Firebase Console > Build > Firestore Database > Create database. Select the production database `(default)` in a location near your users (the database region cannot be changed later). Use **Production mode**, not Test mode. Do not change rules to public access.

## 3. Enable billing and APIs for functions

Cloud Functions for Firebase require **Blaze** billing. Review spending controls and add a budget alert before proceeding.

Cloud Console API Library for project `ehs-environment-management`: enable the following as requested by Firebase CLI:
- `firestore.googleapis.com`
- `cloudfunctions.googleapis.com`
- `cloudbuild.googleapis.com`
- `run.googleapis.com`
- `artifactregistry.googleapis.com`
- `eventarc.googleapis.com`
- `pubsub.googleapis.com`

The GitHub service account needs sufficient permissions to **read service usage**, deploy Firestore rules, and create Functions. Prefer a separate narrowly scoped deployment identity, not an Admin SDK runtime account. An owner should grant only necessary roles after examining failed logs.

## 4. Bootstrap initial administrator

Sign in once to the EHS website using Google. Find your **Firebase Authentication UID** under Authentication > Users. In Firestore Console manually create document:

- collection: `members`
- document ID: the signed-in person's exact UID
- field: `role` (string) = `admin`

This step must be performed manually by project owner to prevent arbitrary self-enrollment as admin. Do not make `members` publicly writable.

## 5. Deploy with GitHub Actions

Open Actions > **Deploy EHS Firebase Backend** > **Run workflow**:
- choose `firestore` first
- then `approval` for `approveReview`
- finally `functions` only once Gemini secret has been configured

`functions` requires the secret `GEMINI_API_KEY` to be created in **Google Cloud Secret Manager / Firebase Functions secrets**, not GitHub repository secrets (unless explicitly mapped with an authenticated deployment step). The first-time secret can be set with `firebase functions:secrets:set GEMINI_API_KEY --project ehs-environment-management` using a trusted local or Cloud Shell environment. Never paste that key into the public repository or chat.

Workflow logs: https://github.com/rolthchildpham-wq/EHS-Environment-Management/actions

## Current blockers found on 2026-11-11

- Firestore deployment: HTTP 403 from Service Usage API when retrieving `firestore.googleapis.com`. GitHub service account does not have sufficient API visibility/permissions.
- Approval function: Cloud Build API not enabled, and the deployment credentials cannot enable it.
- Auth provider and database creation require Console setup.

Only Hosting is confirmed live. No claim is made that Firestore, sign-in or Cloud Functions are deployed.
