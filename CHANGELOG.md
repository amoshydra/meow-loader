# Changelog

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
