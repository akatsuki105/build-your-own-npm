import { Promise } from 'bluebird';
import findUp from 'find-up';
import { readJson, writeJsonSync } from 'fs-extra';
import { Arguments } from 'yargs';
import { install } from 'install';
import { list, PackageJson } from 'list';
import { readLock } from 'lock';
import { prepareInstall } from 'log';
import { sortKeys } from 'utils';

console.log('Hello World!');

const main = async (args: Arguments) => {
  const jsonPath = await findUp('package.json');
  if (!jsonPath) throw new Error('Could not find package.json');
  const root = await readJson(jsonPath);

  // もし、`tiny-pm install <packageName>`を実行したなら`npm install` や `yarn add` のように動作させる
  const additionalPackages = args._.slice(1); // ['package0', 'package1', ...]
  if (!!additionalPackages.length) {
    if (args['save-dev'] || args.dev) {
      // devDependencies
      root.devDependencies ||= {};
      // 現時点ではバージョンが特定されていないので、空欄にしおいて、情報を取得した後に書き込みを行う
      additionalPackages.forEach((pkg) => (root.devDependencies[pkg] = ''));
    } else {
      // dependencies
      root.dependencies ||= {};
      // 現時点ではバージョンが特定されていないので、空欄にしおいて、情報を取得した後に書き込みを行う
      additionalPackages.forEach((pkg) => (root.dependencies[pkg] = ''));
    }
  }

  // productionモードでは devDependencies は必要ない
  if (args.production) delete root.devDependencies;

  // lockfileがあれば依存関係を読み取る
  readLock();

  // 依存関係を構築する
  const info = await list(root);

  // 構築した依存関係を lockfile に書き込む
  prepareInstall(Object.keys(info.topLevel).length + info.unsatisfied.length);

  // トップレベルのパッケージをインストール
  await Promise.each(Object.entries(info.topLevel), async ([name, { url }]) => {
    await install(name, url);
  });

  // コンフリクトがあるパッケージをインストール
  await Promise.each(info.unsatisfied, async (item) => {
    await install(item.name, item.url, `/node_modules/${item.parent}`);
  });

  beautifyPackageJson(root);

  writeJsonSync(jsonPath, root, { spaces: 2 }); // package.jsonを保存
};

const beautifyPackageJson = (packageJson: PackageJson) => {
  if (packageJson.dependencies) {
    packageJson.dependencies = sortKeys(packageJson.dependencies);
  }

  if (packageJson.devDependencies) {
    packageJson.devDependencies = sortKeys(packageJson.devDependencies);
  }
};
