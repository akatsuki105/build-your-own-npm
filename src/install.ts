import { mkdirpSync } from 'fs-extra';
import fetch from 'node-fetch';
import { extract } from 'tar';
import { tickInstalling } from './log';

export const install = async (name: string, url: string, location = '') => {
  const path = `${process.cwd()}${location}/node_modules/${name}`; // インストール先
  mkdirpSync(path);

  const res = await fetch(url);

  // res.body は読み取り可能なストリームで、`tar.extract`は読み取り可能なストリームを受け付けるので、ディスクにファイルを作成する必要はなく、直接抽出すればよい
  res.body.pipe(extract({ cwd: path, strip: 1 })).on('close', tickInstalling); // on(...) でプログレスバーの更新
};
