import { Promise } from 'bluebird';
import { maxSatisfying, satisfies } from 'semver';
import { TARGET } from './constant';
import { getItem, updateOrCreate } from './lock';
import { logResolving } from './log';
import { resolve } from './resolve';

export type DependenciesMap = {
  [dependency: string]: string;
};

type DependencyStack = {
  name: string;
  version: string;
  dependencies: { [dep: string]: string };
}[];

export type PackageJson = {
  dependencies?: DependenciesMap;
  devDependencies?: DependenciesMap;
};

/**
 * パッケージが重複しないようにパッケージツリーを平坦化したものを格納しておく
 */
const topLevel: {
  [name: string]: { url: string; version: string };
} = {};

/**
 * 依存関係がコンフリクトしたときのための変数
 */
const unsatisfied: { name: string; parent: string; url: string }[] = [];

/**
 * 依存関係の収集
 */
const collectDeps = async (name: string, constraint: string, stack: DependencyStack = []) => {
  const fromLock = getItem(name, constraint);
  const manifest = fromLock || (await resolve(name));
  logResolving(name);

  const versions = Object.keys(manifest); // ["0.1.0", "0.1.1", "1.0.0", ...]
  const matched = constraint ? maxSatisfying(versions, constraint) : versions[versions.length - 1];
  if (!matched) throw new Error('Cannot resolve suitable package.');

  if (!topLevel[name]) {
    topLevel[name] = { url: manifest[matched].dist.tarball, version: matched };
  } else if (satisfies(topLevel[name].version, constraint)) {
    const conflictIndex = checkStackDependencies(name, matched, stack);
    if (conflictIndex === -1) {
      return; // 依存関係の循環はない
    }

    // 依存関係の循環があるとき
    // コンフリクトが発生している依存関係の前の2つの依存関係の情報が必要
    const parent = stack.map((name) => name).slice(conflictIndex - 2).join(`/${TARGET}`); // eslint-disable-line
    unsatisfied.push({
      name,
      parent,
      url: manifest[matched].dist.tarball,
    });
  } else {
    // パッケージはすでにそのマップに存在するが、セマンティックバージョンのためにコンフリクトが発生している
    unsatisfied.push({
      name,
      parent: stack[stack.length - 1].name,
      url: manifest[matched].dist.tarball,
    });
  }

  // 依存関係の収集
  const dependencies = manifest[matched].dependencies || {};

  // ManifestをnewLockに保存
  updateOrCreate(`${name}@${constraint}`, {
    version: matched,
    url: manifest[matched].dist.tarball,
    shasum: manifest[matched].dist.shasum,
    dependencies,
  });

  // 再起的に依存関係の依存関係も集める必要がある
  if (!!Object.keys(dependencies).length) {
    stack.push({
      name,
      version: matched,
      dependencies,
    });
    await Promise.all(
      Object.entries(dependencies)
        .filter(([dep, range]) => !hasCirculation(dep, range, stack))
        .map(([dep, range]) => collectDeps(dep, range, stack.slice())),
    );
    stack.pop();
  }

  // package.json で不足しているセマンティックバージョンの範囲を追加するために、セマンティックバージョンの範囲を返す
  if (!constraint) {
    return { name, version: `^${matched}` };
  }
};

/**
 * トップレベルの依存関係ではなく、依存関係の依存関係にコンフリクトがあるかどうかをチェックする
 */
const checkStackDependencies = (name: string, version: string, stack: DependencyStack): number => {
  return stack.findIndex(({ dependencies }) => {
    if (!dependencies[name]) return true;

    return satisfies(version, dependencies[name]);
  });
};

/**
 * 依存関係が循環しているかどうか。
 * パッケージがスタックに存在し、それがセマンティックバージョンを満たす場合、依存関係が循環している
 */
const hasCirculation = (name: string, range: string, stack: DependencyStack) => {
  return stack.some((item) => item.name === name && satisfies(item.version, range));
};

/**
 * 依存関係の情報を作成する。dep、devdepともに、パッケージ名とセマンティックバージョンが返ってきたら、`package.json`ファイルに追加する必要がある(新しいパッケージを追加するときに必要)
 */
export const list = async (rootManifest: PackageJson) => {
  if (rootManifest.dependencies) {
    const res = await Promise.map(
      Object.entries(rootManifest.dependencies),
      async (pair: [string, string]) => await collectDeps(...pair),
    ).filter(Boolean);
    res.forEach((item) => (rootManifest.dependencies![item!.name] = item!.version)); // eslint-disable-line
  }

  if (rootManifest.devDependencies) {
    const res = await Promise.map(
      Object.entries(rootManifest.devDependencies),
      async (pair: [string, string]) => await collectDeps(...pair),
    ).filter(Boolean);
    res.forEach((item: any) => (rootManifest.devDependencies![item.name] = item.version)); // eslint-disable-line
  }

  return { topLevel, unsatisfied };
};
