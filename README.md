# build-your-own-npm

TypeScript製のミニマルなNode.jsパッケージマネージャーです。

npm や yarn のようなものです。

コードを読む前にまず[Node.jsクイズ第58問 ./node_modules直下にはどのパッケージが入る?](https://blog.tai2.net/node-quiz-about-npm-install.html)を読んで、install時の挙動について概要を理解しておくことをおすすめします。

## Usage

```sh
$ gh repo clone pokemium/build-your-own-npm
$ yarn install
$ yarn dev
```

## References

- [Node.jsクイズ第58問 ./node_modules直下にはどのパッケージが入る?](https://blog.tai2.net/node-quiz-about-npm-install.html)
- [package.json のチルダ(~) とキャレット(^)](https://qiita.com/sotarok/items/4ebd4cfedab186355867)
- [g-plane/tiny-package-manager](https://github.com/g-plane/tiny-package-manager)