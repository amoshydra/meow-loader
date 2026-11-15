# Changelog

## [1.1.0](https://github.com/amoshydra/meow-loader/compare/v1.0.0...v1.1.0) (2026-11-15)


### Features

* add resume validation progress and batch metadata writes ([2e33518](https://github.com/amoshydra/meow-loader/commit/2e335188f2bcdcad72df0f9832a9e277dd2baba2))
* pin validated DNS addresses and add a security policy ([75e6250](https://github.com/amoshydra/meow-loader/commit/75e6250471037f00f0345064827197c2c6f8d126))


### Bug Fixes

* detect byte-range overflow without floating-point loss ([6e7fde7](https://github.com/amoshydra/meow-loader/commit/6e7fde784bd14e86dc4fcd005ceadd922670b929))
* harden redirect header scoping and special-use IPv6 ranges ([422df0d](https://github.com/amoshydra/meow-loader/commit/422df0d0efe8e23aeb73cade668868f521dc2a48))
* harden subtitle, metadata, and work-dir handling ([afe191f](https://github.com/amoshydra/meow-loader/commit/afe191fa869f6b01770591014a3f6b7a0b8f3954))
* whitelist ffmpeg protocols and reject overflowing byte ranges ([79851f7](https://github.com/amoshydra/meow-loader/commit/79851f7cfb288be6444aaf6b7d62ec3e0974bae9))

## [1.0.0](https://github.com/amoshydra/meow-loader/compare/v0.4.4...v1.0.0) (2026-11-15)


### Features

* add --audio to select an audio rendition ([8d1ae74](https://github.com/amoshydra/meow-loader/commit/8d1ae74f37e8fc87d2935a13b6bfd1859e273fae))
* add --concurrency for parallel segment downloads ([f0b1ea4](https://github.com/amoshydra/meow-loader/commit/f0b1ea4b086c2a4aa7f02cc67bb7e93c5fe2b125))
* add audio language selection and configurable retries/timeouts ([cb568be](https://github.com/amoshydra/meow-loader/commit/cb568beebabf7dd10805c9a1f05f30a14078216e))
* download sidecar WebVTT subtitles ([6174eb9](https://github.com/amoshydra/meow-loader/commit/6174eb93368efc4dcd9e0451b8cf9c82eb6f590c))
* support separate audio renditions ([ab862eb](https://github.com/amoshydra/meow-loader/commit/ab862eb5ba4b158a88d2c67e96ee5f728404771e))


### Bug Fixes

* reject rendition flags with --merge-only ([b9f663c](https://github.com/amoshydra/meow-loader/commit/b9f663cec04bd3a35a11689959390e2435787e99))


### Documentation

* add a supported-inputs table and a quick summary ([ed3c8a9](https://github.com/amoshydra/meow-loader/commit/ed3c8a92975d90e709b0f3a7751bb15485c66673))
* add an animated terminal demo and social preview ([18ca798](https://github.com/amoshydra/meow-loader/commit/18ca7989c402c2bdc0ddbeeb8324932cce2d52ac))
* mark cross-platform CI complete in the roadmap ([1ee75e3](https://github.com/amoshydra/meow-loader/commit/1ee75e3616a9850f981902d1aef060eeb0d575e3))
* polish README wording and tables ([7154aaf](https://github.com/amoshydra/meow-loader/commit/7154aaf09ebd4cea58d5fb8ae0b0b46ad786af54))
* tighten the README header and add a CI badge ([3736236](https://github.com/amoshydra/meow-loader/commit/37362369385c3957a9c152c9ed3a5750786a8838))


### Chores

* **deps:** update vitest to 5 and vite to 8 ([d1ff583](https://github.com/amoshydra/meow-loader/commit/d1ff5831b1fc567f15652a2d2a29e683524866bf))
* release 1.0.0 ([c735b8a](https://github.com/amoshydra/meow-loader/commit/c735b8ab1b715da825a111830e653527664bf1d3))


### CI/CD

* run tests on macOS and Windows ([f05d3fb](https://github.com/amoshydra/meow-loader/commit/f05d3fba5957d551aa334c2772e5bc743ac49663))

## [0.4.4](https://github.com/amoshydra/meow-loader/compare/v0.4.3...v0.4.4) (2026-11-15)


### Features

* support byte-range HLS playlists ([b1fa51c](https://github.com/amoshydra/meow-loader/commit/b1fa51c58f48a8142435f5f04bbc7107eb2a8443))
* support fragmented MP4 (fMP4) HLS playlists ([345ac2e](https://github.com/amoshydra/meow-loader/commit/345ac2ed01e8244a2f1c8316885afaa6b078083d))


### Bug Fixes

* clear stale characters when redrawing the TTY progress line ([9554940](https://github.com/amoshydra/meow-loader/commit/9554940253bceecf56613339a6cac9ca21bc3503))


### Documentation

* add troubleshooting section for common failures ([6803d4e](https://github.com/amoshydra/meow-loader/commit/6803d4e6f78f12db591009e2ebba2f641e81cac5))


### CI/CD

* verify the published version is visible on npm ([6bfaa65](https://github.com/amoshydra/meow-loader/commit/6bfaa655654755cd3fc6b6322ff017a59fbfaffc))

## [0.4.3](https://github.com/amoshydra/meow-loader/compare/v0.4.2...v0.4.3) (2026-11-15)


### Features

* add --merge-only to merge a saved working directory offline ([582c990](https://github.com/amoshydra/meow-loader/commit/582c990b4ee2c9e87f5d371573e9287e9d99e8a9))

## [0.4.2](https://github.com/amoshydra/meow-loader/compare/v0.4.1...v0.4.2) (2026-10-30)


### Bug Fixes

* keep completed downloads when the output name appears mid-download ([f018df5](https://github.com/amoshydra/meow-loader/commit/f018df5e0487424d514e378c624ce56acef50688))

## [0.4.1](https://github.com/amoshydra/meow-loader/compare/v0.4.0...v0.4.1) (2026-10-30)


### Features

* add curl mode for Copy as cURL commands ([bf71f35](https://github.com/amoshydra/meow-loader/commit/bf71f358567baac3a7027876c2fb9257965f0db9))


### CI/CD

* keep component-less release tags in manifest mode ([aca242c](https://github.com/amoshydra/meow-loader/commit/aca242ce1361eea3838b53e0e9cdb28df5389d96))
* read release-please config instead of release-type input ([73c8c0a](https://github.com/amoshydra/meow-loader/commit/73c8c0a6e29c03ff5e0e1a844170cde60c9970c6))

## [0.4.0](https://github.com/amoshydra/meow-loader/compare/v0.3.0...v0.4.0) (2026-10-26)


### ⚠ BREAKING CHANGES

* requires Node.js 22+, custom headers are playlist-origin-scoped by default, private-network URLs require --allow-private-network, explicit outputs require --force and .mp4, unsupported HLS inputs now fail, and default download/segment limits apply.

### Features

* harden security boundaries and large-file handling ([40ba490](https://github.com/amoshydra/meow-loader/commit/40ba490996777279e9c393544f2d8f34e66e7af9))


### Bug Fixes

* **ci:** use packageManager pnpm version ([116aad4](https://github.com/amoshydra/meow-loader/commit/116aad4f4d7d6f61daa56da7f439be40dd8e9ffb))


### Miscellaneous Chores

* release 0.4.0 ([9085e5c](https://github.com/amoshydra/meow-loader/commit/9085e5c4f165cb51eec9c752ca9b734c242ce22b))

## [0.3.0](https://github.com/amoshydra/meow-loader/compare/v0.2.0...v0.3.0) (2026-07-26)


### Features

* auto-suffix output filename to prevent overwriting existing files ([dbfb8a0](https://github.com/amoshydra/meow-loader/commit/dbfb8a03a4f5e5e269b78069c530033aef336e55))


### Bug Fixes

* default to highest quality variant (index 0) instead of lowest ([0ab489f](https://github.com/amoshydra/meow-loader/commit/0ab489fab23b3768ed99e2b87497668fc4edbf34))

## [0.2.0](https://github.com/amoshydra/meow-loader/compare/v0.1.0...v0.2.0) (2026-06-12)


### Features

* add --header/-H flag support for custom HTTP headers ([508da89](https://github.com/amoshydra/meow-loader/commit/508da8984fb2d81645da36d235020647c07f902d))
* add --help / -h flag ([79541a9](https://github.com/amoshydra/meow-loader/commit/79541a9e0544fefe37705dcf4ffab68bb2e48865))
* download to temp dir with retry prompt, resume support, and default browser headers ([d07e2e0](https://github.com/amoshydra/meow-loader/commit/d07e2e04801b87592ff0934c003a3f9e7cb46ca5))
* set default User-Agent header (Chrome 148) unless overridden via --header ([3c7263b](https://github.com/amoshydra/meow-loader/commit/3c7263bdff6ae3b629bbdfabec4ea8d378e0bb49))

## [0.1.0](https://github.com/amoshydra/meow-loader/compare/v0.1.0...v0.1.0) (2026-04-19)


### Features

* add interactive variant selection for master playlists ([2d0a335](https://github.com/amoshydra/meow-loader/commit/2d0a33588984aadece96120abf62de2b1904da1b))
* add M3U8 video downloader with AES-128 decryption and MP4 merge ([d6c5c0f](https://github.com/amoshydra/meow-loader/commit/d6c5c0fb1e5c389ca37cada6a1c7c2a53e66e343))
* support npx execution with Node.js target and switch to pnpm ([4053f1b](https://github.com/amoshydra/meow-loader/commit/4053f1bc088e231a0eb578e79f04eb10e42b0b03))


### Bug Fixes

* improve ffmpeg error handling and add pre-flight check ([0a6c91e](https://github.com/amoshydra/meow-loader/commit/0a6c91e1e385ae3a6245507e35d9a01038a4d2d4))
* resolve TypeScript errors and fix master playlist variant parsing ([831e298](https://github.com/amoshydra/meow-loader/commit/831e2981f9825a9ca0e5edf4e3a969371f1d6b4d))


### Reverts

* "chore(main): release 0.1.0" ([adadeb0](https://github.com/amoshydra/meow-loader/commit/adadeb035bb10789160779d7f796240a207d8cd9))
* "chore(main): release 0.2.0" ([adadeb0](https://github.com/amoshydra/meow-loader/commit/adadeb035bb10789160779d7f796240a207d8cd9))
* "chore(main): release meow-loader 0.1.0" ([adadeb0](https://github.com/amoshydra/meow-loader/commit/adadeb035bb10789160779d7f796240a207d8cd9))
* "chore(main): release meow-loader 0.1.1" ([adadeb0](https://github.com/amoshydra/meow-loader/commit/adadeb035bb10789160779d7f796240a207d8cd9))


### Miscellaneous Chores

* release 0.1.0 ([1f7a399](https://github.com/amoshydra/meow-loader/commit/1f7a399491ecedb10fb362b82513ff9277868506))
* release 0.1.0 ([adadeb0](https://github.com/amoshydra/meow-loader/commit/adadeb035bb10789160779d7f796240a207d8cd9))
* release 0.1.0 ([adadeb0](https://github.com/amoshydra/meow-loader/commit/adadeb035bb10789160779d7f796240a207d8cd9))

## [0.1.0](https://github.com/amoshydra/meow-loader/compare/v0.0.1...v0.1.0) (2026-04-19)


### Bug Fixes

* improve ffmpeg error handling and add pre-flight check ([0a6c91e](https://github.com/amoshydra/meow-loader/commit/0a6c91e1e385ae3a6245507e35d9a01038a4d2d4))


### Reverts

* "chore(main): release 0.1.0" ([adadeb0](https://github.com/amoshydra/meow-loader/commit/adadeb035bb10789160779d7f796240a207d8cd9))
* "chore(main): release 0.2.0" ([adadeb0](https://github.com/amoshydra/meow-loader/commit/adadeb035bb10789160779d7f796240a207d8cd9))
* "chore(main): release meow-loader 0.1.0" ([adadeb0](https://github.com/amoshydra/meow-loader/commit/adadeb035bb10789160779d7f796240a207d8cd9))
* "chore(main): release meow-loader 0.1.1" ([adadeb0](https://github.com/amoshydra/meow-loader/commit/adadeb035bb10789160779d7f796240a207d8cd9))


### Miscellaneous Chores

* release 0.1.0 ([1f7a399](https://github.com/amoshydra/meow-loader/commit/1f7a399491ecedb10fb362b82513ff9277868506))
* release 0.1.0 ([adadeb0](https://github.com/amoshydra/meow-loader/commit/adadeb035bb10789160779d7f796240a207d8cd9))
* release 0.1.0 ([adadeb0](https://github.com/amoshydra/meow-loader/commit/adadeb035bb10789160779d7f796240a207d8cd9))

## [0.1.0](https://github.com/amoshydra/meow-loader/compare/v0.1.0...v0.1.0) (2026-04-19)


### Features

* add interactive variant selection for master playlists ([2d0a335](https://github.com/amoshydra/meow-loader/commit/2d0a33588984aadece96120abf62de2b1904da1b))
* add M3U8 video downloader with AES-128 decryption and MP4 merge ([d6c5c0f](https://github.com/amoshydra/meow-loader/commit/d6c5c0fb1e5c389ca37cada6a1c7c2a53e66e343))
* support npx execution with Node.js target and switch to pnpm ([4053f1b](https://github.com/amoshydra/meow-loader/commit/4053f1bc088e231a0eb578e79f04eb10e42b0b03))


### Bug Fixes

* improve ffmpeg error handling and add pre-flight check ([59f66c3](https://github.com/amoshydra/meow-loader/commit/59f66c33a5ee10865c7a18046a03e94c453ccb0b))
* resolve TypeScript errors and fix master playlist variant parsing ([831e298](https://github.com/amoshydra/meow-loader/commit/831e2981f9825a9ca0e5edf4e3a969371f1d6b4d))


### Reverts

* "chore(main): release 0.1.0" ([4f51fd1](https://github.com/amoshydra/meow-loader/commit/4f51fd1295d576ff698a6411194f0faf89457db3))
* "chore(main): release 0.2.0" ([0a4d16c](https://github.com/amoshydra/meow-loader/commit/0a4d16c2863f808187ec15abc08b996f86e375b1))
* "chore(main): release meow-loader 0.1.0" ([14615a7](https://github.com/amoshydra/meow-loader/commit/14615a77b96ae0054ea2ac11aca5f0e1b8c9139c))
* "chore(main): release meow-loader 0.1.1" ([a73abb0](https://github.com/amoshydra/meow-loader/commit/a73abb0c6b3b68112f77eed8588fc5de6e53c290))


### Miscellaneous Chores

* release 0.1.0 ([63a1755](https://github.com/amoshydra/meow-loader/commit/63a17555ba98cf4fda5bc71d0b341fb490845d6e))
* release 0.1.0 ([dfe5357](https://github.com/amoshydra/meow-loader/commit/dfe535703d72da2ade28fa4dc2ac6d3c04079611))
