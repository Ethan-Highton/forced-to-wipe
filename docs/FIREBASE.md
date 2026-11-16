# Running on Firebase

Hosting serves the UI, Cloud Functions serve `/api/**` and the hourly refresh, Cloud Storage keeps the JSON data under `ftw/`. Requires the Blaze plan.

1. `npm i --prefix functions`
2. `firebase login`
3. `firebase use <project>` (creates `.firebaserc`)
4. `firebase functions:secrets:set BNET_CLIENT_SECRET`
5. Put `BNET_CLIENT_ID=<your client id>` in `functions/.env`
6. Make sure `config.json` exists in the repo root (public values only; it is copied to `functions/config.json`)
7. `firebase deploy` (or `npm run deploy`); the predeploy step runs `scripts/sync-functions.mjs`
8. In the Hosting console, add your custom domain

The first scheduled run (within the hour) seeds the data; `ACCESS_CODE` is not supported in this mode.
