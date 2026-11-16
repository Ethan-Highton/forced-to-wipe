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

## Discord notifications

Optional. Create a webhook in your Discord channel (Channel settings > Integrations > Webhooks) and put it in `functions/.env`:

```
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/<id>/<token>
```

Leave it empty (or unset) to keep notifications off; the deploy works either way. The URL is a secret: it is never logged or returned by the API, so do not commit `functions/.env`. Only `https://discord.com/api/webhooks/` and `https://discordapp.com/api/webhooks/` URLs are accepted.

By default level-ups, joins and leaves are announced, one batched message per refresh. The first (seeding) run is silent. Tune it in `config.json`:

```json
"notify": { "events": ["levelups", "joins", "leaves", "deaths"], "minDeaths": 3 }
```

`deaths` is off unless listed; it fires when a member's total deaths rise by at least `minDeaths` between refreshes.
