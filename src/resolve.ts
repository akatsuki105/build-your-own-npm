import fetch from 'node-fetch';
import { REGISTRY } from './constant';

// パッケージのMeta情報
// tarball: npmパッケージの本体が圧縮されたものが配置されているURL(e.g. https://registry.npmjs.org/node-fetch/-/node-fetch-0.1.0.tgz)
export type Manifest = {
  [version: string]: {
    dependencies?: { [dep: string]: string };
    dist: { shasum: string; tarball: string };
  };
};

/**
 * ここにパッケージのMeta情報をキャッシュしておく
 */
const cache: { [dep: string]: Manifest } = {};

/**
 * パッケージ名からManifest(パッケージのMeta情報)をとってくる
 *
 * @param {string} name - npmパッケージ名(例: `node-fetch`)
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
