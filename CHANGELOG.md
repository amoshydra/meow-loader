# Changelog

## [0.3.0](https://github.com/amoshydra/meow-loader/compare/v0.2.0...v0.3.0) (2026-04-19)


### Features

* add interactive variant selection for master playlists ([2d0a335](https://github.com/amoshydra/meow-loader/commit/2d0a33588984aadece96120abf62de2b1904da1b))
* add M3U8 video downloader with AES-128 decryption and MP4 merge ([d6c5c0f](https://github.com/amoshydra/meow-loader/commit/d6c5c0fb1e5c389ca37cada6a1c7c2a53e66e343))
* support npx execution with Node.js target and switch to pnpm ([4053f1b](https://github.com/amoshydra/meow-loader/commit/4053f1bc088e231a0eb578e79f04eb10e42b0b03))


### Bug Fixes

* improve ffmpeg error handling and add pre-flight check ([59f66c3](https://github.com/amoshydra/meow-loader/commit/59f66c33a5ee10865c7a18046a03e94c453ccb0b))
* resolve TypeScript errors and fix master playlist variant parsing ([831e298](https://github.com/amoshydra/meow-loader/commit/831e2981f9825a9ca0e5edf4e3a969371f1d6b4d))

## [0.2.0](https://github.com/amoshydra/meow-loader/compare/v0.1.1...v0.2.0) (2026-04-19)


### Features

* add interactive variant selection for master playlists ([2d0a335](https://github.com/amoshydra/meow-loader/commit/2d0a33588984aadece96120abf62de2b1904da1b))
* add M3U8 video downloader with AES-128 decryption and MP4 merge ([d6c5c0f](https://github.com/amoshydra/meow-loader/commit/d6c5c0fb1e5c389ca37cada6a1c7c2a53e66e343))
* support npx execution with Node.js target and switch to pnpm ([4053f1b](https://github.com/amoshydra/meow-loader/commit/4053f1bc088e231a0eb578e79f04eb10e42b0b03))


### Bug Fixes

* improve ffmpeg error handling and add pre-flight check ([59f66c3](https://github.com/amoshydra/meow-loader/commit/59f66c33a5ee10865c7a18046a03e94c453ccb0b))
* resolve TypeScript errors and fix master playlist variant parsing ([831e298](https://github.com/amoshydra/meow-loader/commit/831e2981f9825a9ca0e5edf4e3a969371f1d6b4d))

## [0.1.1](https://github.com/amoshydra/meow-loader/compare/meow-loader-v0.1.0...meow-loader-v0.1.1) (2026-04-19)


### Bug Fixes

* improve ffmpeg error handling and add pre-flight check ([59f66c3](https://github.com/amoshydra/meow-loader/commit/59f66c33a5ee10865c7a18046a03e94c453ccb0b))


### CI/CD

* add workflow_dispatch trigger to publish workflow ([bcfecf4](https://github.com/amoshydra/meow-loader/commit/bcfecf49cbb56d16bb984d2e21f53ad5e73a6408))
* fix publish trigger to match release-please tag pattern ([c837a89](https://github.com/amoshydra/meow-loader/commit/c837a89e835466bb3bb1a512eaa83299d40d0514))
* trigger publish workflow on git tag push instead of release event ([b71a45f](https://github.com/amoshydra/meow-loader/commit/b71a45f2ef37a2063552d33d087ece50e0492166))

## [0.1.0](https://github.com/amoshydra/meow-loader/compare/meow-loader-v0.0.1...meow-loader-v0.1.0) (2026-04-19)


### Features

* add interactive variant selection for master playlists ([2d0a335](https://github.com/amoshydra/meow-loader/commit/2d0a33588984aadece96120abf62de2b1904da1b))
* add M3U8 video downloader with AES-128 decryption and MP4 merge ([d6c5c0f](https://github.com/amoshydra/meow-loader/commit/d6c5c0fb1e5c389ca37cada6a1c7c2a53e66e343))
* support npx execution with Node.js target and switch to pnpm ([4053f1b](https://github.com/amoshydra/meow-loader/commit/4053f1bc088e231a0eb578e79f04eb10e42b0b03))


### Bug Fixes

* resolve TypeScript errors and fix master playlist variant parsing ([831e298](https://github.com/amoshydra/meow-loader/commit/831e2981f9825a9ca0e5edf4e3a969371f1d6b4d))


### Build System

* replace bun with tsdown, add CI workflow, enable isolatedModules ([c0b2697](https://github.com/amoshydra/meow-loader/commit/c0b26975c21d87bda36f78aab893b0616c8b0070))


### Tests

* add vitest with fixtures for M3U8 parser, downloader, and video segments ([63880d0](https://github.com/amoshydra/meow-loader/commit/63880d06aaaa090f8fe9acae82728dc7a307eda5))


### Documentation

* add homepage, repository, and bugs links to package.json ([528c4b6](https://github.com/amoshydra/meow-loader/commit/528c4b6ee601ac44999e0facec1e65d27d6c2d43))
* add README.md ([582d907](https://github.com/amoshydra/meow-loader/commit/582d90718a1da939cb75d93c94cd0de89bb9c50b))
* fix banner url for npm homepage, remove unsupported html tag, add repo link ([f2629a3](https://github.com/amoshydra/meow-loader/commit/f2629a34cf0240b2be743044ff612f257b649590))


### Chores

* bump version down, update dev dependency ([b413c3d](https://github.com/amoshydra/meow-loader/commit/b413c3df13d77ec534a30eeff805406f16eaf29c))
* initialize project ([e51ac54](https://github.com/amoshydra/meow-loader/commit/e51ac543e3f0ae51bfc133319b8505651a4021a6))


### CI/CD

* add release-please and automated npm publish via OIDC trusted publishing ([cfbe15a](https://github.com/amoshydra/meow-loader/commit/cfbe15aa92bc027e5517e51b946cd84cd44062a4))
* add release-please manifest file ([a2d1e37](https://github.com/amoshydra/meow-loader/commit/a2d1e37d4fad69d573668b48cbaf60d66eae593b))
