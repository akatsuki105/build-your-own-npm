import { Promise } from 'bluebird';
import { maxSatisfying, satisfies } from 'semver';
import { TARGET } from './constant';
import { getItem, updateOrCreate } from './lock';
import { logResolving } from './log';
import { resolve } from './resolve';

/**
 * packagename -> version
 */
export type DependenciesMap = {
  [dependency: string]: string;
};

/**
 * パッケージの依存関係を辿る処理で依存関係をスタック上に表したデータ構造
 * [親, 子, 孫, ひ孫, ひひ孫, ひひひ孫, ...]
 */
type DependencyStack = {
  name: string;
  version: string;
  dependencies: { [dep: string]: string }; // package -> version
}[];

/**
 * package.jsonのdep,devDep内容と対応するバッファのようなデータ
 * package.jsonの内容を更新する場合は、この型のインスタンスに書き込んでおけば、終了時にこのインスタンスがpackage.jsonにflushされる
 */
export type PackageJson = {
  dependencies?: DependenciesMap; // package -> version
  devDependencies?: DependenciesMap; // package -> version
};

/**
 * ./node_modules/　に配置されるパッケージ。ここに書いたパッケージがまずinstallされる
 * package.jsonに書いてあるやつだけでなく、その依存のパッケージも依存関係がコンフリクトしなかった場合はここに配置される
 * 注意: パッケージが重複しないようにパッケージツリーを平坦化したものを格納しておく
 */
const topLevel: {
  [name: string]: { url: string; version: string };
} = {};

/**
 * パッケージの中にはパッケージ本体の中にnode_modulesがあるものがある e.g. ./node_modules/eslint-plugin-import/node_modules
 * 依存関係がコンフリクトしたパッケージをその親(依存元)のパッケージとともに保存しておく
 */
const unsatisfied: { name: string; parent: string; url: string }[] = [];

/**
 * 依存関係を再起的に収集する
 * 集めた依存関係は `topLevel` と `unsatisfied` に蓄積される
 * @param {string} name - パッケージ名、このパッケージの依存関係を取得する
 * @param {string} constraint - バージョン制約 e.g. "0.1.0", "^7.3.5"
 * @param {DependencyStack} stack - nameのパッケージの祖先パッケージたち
 */
const collectDeps = async (name: string, constraint: string, stack: DependencyStack = []) => {
  // パッケージのManifestを取得
  const fromLock = getItem(name, constraint); // lockfileにマニフェストがあれば取得
  const manifest = fromLock || (await resolve(name));
  logResolving(name);

  // constraintで指定があるならセマンティックバージョンにあうもの、指定してないなら最新のバージョンを取得
  const versions = Object.keys(manifest); // npmレジストリで利用可能なバージョン一覧 e.g. ["0.1.0", "0.1.1", "1.0.0", ...]
  const matched = constraint ? maxSatisfying(versions, constraint) : versions[versions.length - 1];
  if (!matched) throw new Error('Cannot resolve suitable package.');

  switch (true as boolean) {
    case !topLevel[name]: // topLevelにないときは、topLevelに入れる
      topLevel[name] = { url: manifest[matched].dist.tarball, version: matched };
      break;

    case satisfies(topLevel[name].version, constraint): // topLevelに互換性のある同じパッケージが存在する
      const conflictIndex = checkStackDependencies(name, matched, stack);
      if (conflictIndex === -1) {
        // TODO: わからないが依存関係の循環を避けるのに必要
        return;
      }

      const parent = stack
        .map((name) => name)
        .slice(conflictIndex - 2) // なぜ-2?
        .join(`/${TARGET}`); // p1/node_modules/p2/node_modules/p3
      unsatisfied.push({
        name,
        parent,
        url: manifest[matched].dist.tarball,
      });
      break;

    default:
      // topLevelにすでに同じパッケージが存在するが、互換性がない(セマンティックバージョンを満たしていない)
      unsatisfied.push({
        name,
        parent: stack[stack.length - 1].name, // pkg (.../pkg/node_modules/${name})
        url: manifest[matched].dist.tarball,
      });
      break;
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

  // 依存関係ツリーを取得するのが目的なので、再起的に依存関係の依存関係も集める必要がある
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
 * topLevelの依存関係ではなく、依存関係の依存関係にコンフリクトがあるかどうかをチェックする
 * 祖先パッケージのうち、`name`で指定したパッケージとコンフリクトしないもの(nameを使ってない or nameを使っているがセマンティックバージョン的にOK)のインデックスを返す
 *
 * @param {string} name - パッケージ名
 * @param {string} version - セマンティックバージョン
 * @param {DependencyStack} stack - 祖先パッケージたち
 * @return {number} conflictIndex - -1: 祖先全てがnameを使っているがそのnameはセマンティックバージョン的にダメ
 */
const checkStackDependencies = (name: string, version: string, stack: DependencyStack): number => {
  return stack.findIndex(({ dependencies }) => {
    if (!dependencies[name]) return true; // パッケージが依存していない

    return satisfies(version, dependencies[name]); // 依存している
  });
};

/**
 * 依存関係が循環しているかどうか。
 * パッケージがスタックに存在し、それがセマンティックバージョンを満たす場合、依存関係が循環している
 * 例: stack: [p0 -> p1 -> p2 -> p3 -> p4 -> p3]
 */
const hasCirculation = (name: string, range: string, stack: DependencyStack) => {
  return stack.some((item) => item.name === name && satisfies(item.version, range));
};

/**
 * package.jsonのdep, devDepをもとにインストールするべきパッケージのリストを構築
 * dep、devdepともに、パッケージ名とセマンティックバージョンが返ってきたら、`package.json`ファイルに追加する必要がある(新しいパッケージを追加するときに必要)
 */
export const list = async (rootManifest: PackageJson) => {
  if (rootManifest.dependencies) {
    const res = await Promise.map(
      Object.entries(rootManifest.dependencies), // [[pkg, version], [pkg, version], ...]
      async ([name, version]) => await collectDeps(name, version),
    ).filter(Boolean); // filter(Boolean)でfalsyなもの(nullとか)を配列から取り除く

    // パッケージ名とセマンティックバージョンが返ってきたら、`package.json`ファイルに追加する
    res.forEach((item) => (rootManifest.dependencies![item!.name] = item!.version)); // eslint-disable-line
  }

  if (rootManifest.devDependencies) {
    const res = await Promise.map(
      Object.entries(rootManifest.devDependencies),
      async ([name, version]) => await collectDeps(name, version),
    ).filter(Boolean); // filter(Boolean)でfalsyなもの(nullとか)を配列から取り除く

    // パッケージ名とセマンティックバージョンが返ってきたら、`package.json`ファイルに追加する
    res.forEach((item: any) => (rootManifest.devDependencies![item.name] = item.version)); // eslint-disable-line
  }

  return { topLevel, unsatisfied };
};
