import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

export type FixtureFiles = Record<string, string | object>;

export async function createFixture(files: FixtureFiles) {
  const root = await mkdtemp(join(tmpdir(), 'jfdevelops-fixture-'));

  for (const [path, content] of Object.entries(files)) {
    const destination = join(root, path);

    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, typeof content === 'string' ? content : `${JSON.stringify(content, null, 2)}\n`);
  }

  return {
    root,
    remove: () => rm(root, { recursive: true, force: true }),
  };
}
