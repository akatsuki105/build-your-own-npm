import fetch from 'node-fetch';

// パッケージ情報
export type Manifest = {
  [version: string]: {
    dependencies?: { [dep: string]: string };
    dist: { shasum: string; tarball: string };
  };
};

/**
 * この変数をいじればnpm以外をレジストリに設定できる
 */
const REGISTRY = process.env.REGISTRY || 'https://registry.npmjs.org/';

/**
 * ここにパッケージをキャッシュしておく
 */
const cache: { [dep: string]: Manifest } = {};

/**
 * name: npmパッケージ名(例: `node-fetch`)
 */
export const resolve = async (name: string): Promise<Manifest> => {
  if (cache[name]) {
    return cache[name];
  }

  const response = await fetch(`${REGISTRY}${name}`); // e.g. https://registry.npmjs.org/node-fetch
  const json = (await response.json()) as {
    versions: Manifest;
    error: Error;
  };
  if (json.error) throw new ReferenceError(`No such package: ${name}`);

  cache[name] = json.versions;

  return cache[name];
};
