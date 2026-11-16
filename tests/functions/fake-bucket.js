/** In-memory stand-in for the parts of a Cloud Storage Bucket that functions/storage.js uses. */
export function fakeBucket(initial = {}) {
  const files = new Map(Object.entries(initial));
  return {
    files,
    async getFiles({ prefix = '' } = {}) {
      const list = [...files.keys()].filter((n) => n.startsWith(prefix))
        .map((name) => ({ name, download: async () => [Buffer.from(files.get(name))] }));
      return [list];
    },
    file: (name) => ({ save: async (data) => { files.set(name, String(data)); } }),
  };
}
