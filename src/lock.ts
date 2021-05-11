import fs from 'fs-extra';
import yaml from 'js-yaml';
import { Manifest } from 'resolve';
import { NAME } from 'constant';
import { sortKeys } from 'utils';

/**
 * 依存関係を記録しておくためのLockツリー (e.g. yarn.lock)
 */
export type Lock = {
  [index: string]: LockInfo;
};

type LockInfo = {
  version: string;
  url: string;
  shasum: string;
  dependencies: { [dependency: string]: string };
};

const defaultLockInfo = () => {
  return {
    version: '',
    url: '',
    shasum: '',
    dependencies: {},
  };
};

/*
 * Lockツリーを後述の old と new で2つ使うことでパッケージの削除に役立つ
 * ロックファイルは人が書き換えるものではなく、パッケージマネージャーが依存管理のために動的に生成するもの
 */

/*
 * oldのほうのLockツリー
 * こちらのLockは、ロックファイルからの読み取ったデータを書き込む以外の場面では、読み取り専用として扱う
 */
const oldLock: Lock = {};

/*
 * newのほうのLockツリー
 * こちらのロックはロックファイルへそのまま書き込まれることに注意
 */
const newLock: Lock = {};

/**
 * パッケージの情報をロックに保存する
 * その情報がロックに存在していない場合は作成。それ以外の場合は単にそれを更新する
 */
export const updateOrCreate = (name: string, info: LockInfo) => {
  if (!newLock[name]) {
    newLock[name] = defaultLockInfo();
  }

  newLock[name] = info;
};

/**
 * パッケージ名+セマンティックバージョンでパッケージ情報を取得する
 *
 * npm registryのデータ構造を少しフォーマットして返している
 *
 * フォーマットすることで`list`モジュール内の`collectDeps`関数のロジックを変更する必要がなくなる
 */
export const getItem = (name: string, constraint: string): Manifest | null => {
  const item = oldLock[`${name}@${constraint}`];
  if (!item) return null;

  return {
    [item.version]: {
      dependencies: item.dependencies,
      dist: { shasum: item.shasum, tarball: item.url },
    },
  };
};

/**
 * 現在のnewLockの内容をロックファイルとして書き出す
 */
export const writeLock = () => {
  fs.writeFileSync(`./${NAME}.yml`, yaml.dump(sortKeys(newLock), { noRefs: true }));
};

/**
 * ロックファイルがあればそれをoldLockにロードする
 */
export const readLock = () => {
  if (fs.pathExistsSync(`./${NAME}.yml`)) {
    Object.assign(oldLock, yaml.loadAll(fs.readFileSync(`./${NAME}.yml`, 'utf8')));
  }
};
