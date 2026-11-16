const SCHEMA_VERSION = 1;
export const PREFIX = 'ftw/';

/** Loads every ftw/<name> JSON file into { name: data }. Corrupt files count as missing. */
export async function loadDocs(bucket, log = () => {}) {
  const [files] = await bucket.getFiles({ prefix: PREFIX });
  const docs = {};
  await Promise.all(files.filter((f) => f.name.startsWith(PREFIX) && f.name.length > PREFIX.length).map(async (f) => {
    const name = f.name.slice(PREFIX.length);
    try {
      const [buf] = await f.download();
      const parsed = JSON.parse(buf.toString('utf8'));
      if (!parsed || typeof parsed !== 'object' || !('data' in parsed)) throw new Error('missing data wrapper');
      docs[name] = parsed.data;
    } catch (err) {
      log(`Corrupt ${name} (${err.message}); starting empty`);
    }
  }));
  return docs;
}

/** Writes each dirty doc as ftw/<name> in the file store's { schemaVersion, data } format. */
export async function saveDocs(bucket, dirty) {
  await Promise.all(Object.entries(dirty).map(([name, data]) =>
    bucket.file(PREFIX + name).save(JSON.stringify({ schemaVersion: SCHEMA_VERSION, data }), {
      contentType: 'application/json', resumable: false,
    })));
}
