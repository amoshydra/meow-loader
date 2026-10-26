<div align="center">
  <img src="https://raw.githubusercontent.com/amoshydra/meow-loader/refs/heads/main/assets/banner.png" alt="meow-loader banner" width="600" />

  <strong>meow-loader</strong><br />
  <i>HLS / M3U8 downloader CLI</i>
  <br /><br />

  [![npm](https://img.shields.io/npm/v/meow-loader.svg)](https://www.npmjs.com/package/meow-loader)
  [![License](https://img.shields.io/github/license/amoshydra/meow-loader.svg)](LICENSE)
  [![Node.js](https://img.shields.io/node/v/meow-loader.svg)](https://nodejs.org/)
</div>

Download an HLS (M3U8) video stream and remux it into a single MP4 file.

```bash
npx meow-loader <m3u8-url>
```

Despite the name, this is a command-line HLS downloader, not a webpack loader.

## Requirements

- [Node.js](https://nodejs.org/) 22 or newer
- [ffmpeg](https://ffmpeg.org/) and `ffprobe` available on your `PATH`

```bash
# macOS
brew install ffmpeg

# Ubuntu / Debian
sudo apt install ffmpeg

# Windows
winget install Gyan.FFmpeg
```

## Usage

```bash
# Download to output.mp4 (or output-1.mp4 if output.mp4 already exists)
npx meow-loader https://example.com/stream.m3u8

# Choose an output filename
npx meow-loader https://example.com/stream.m3u8 my-video.mp4

# Select a quality variant by index (highest quality is index 0)
npx meow-loader https://example.com/master.m3u8 my-video.mp4 1

# Inspect variants, duration, and estimated size without downloading
npx meow-loader https://example.com/master.m3u8 --dry-run

# Keep partial downloads and resume later
npx meow-loader https://example.com/stream.m3u8 --resume /tmp/meow-abc123

# Resume, then remove the downloaded segments after a successful merge
npx meow-loader https://example.com/stream.m3u8 --resume /tmp/meow-abc123 --cleanup

# Overwrite an existing output file
npx meow-loader https://example.com/stream.m3u8 my-video.mp4 --force
```

### Authenticated downloads

Custom headers are scoped to the playlist origin by default:

```bash
npx meow-loader https://media.example.com/stream.m3u8 \
  -H "Authorization: Bearer token"
```

If the manifest uses a separate CDN or key host that needs the same headers, allow that origin explicitly:

```bash
npx meow-loader https://media.example.com/stream.m3u8 \
  -H "Authorization: Bearer token" \
  --header-origin https://cdn.example.com
```

`--header-origin` is repeatable. Headers are not forwarded across cross-origin redirects unless the target origin is allowed. Signed URLs continue to work without any header configuration.

This matches browser behavior more closely: browsers do not automatically attach an arbitrary `Authorization` header to every host referenced by a playlist. If a host returns 401/403 after headers are withheld, the CLI prints the `--header-origin` hint.

### Private networks and HTTP

Manifest URLs on loopback or private networks are blocked by default to reduce SSRF risk. For local testing or a LAN media server:

```bash
npx meow-loader http://192.168.1.10/stream.m3u8 --allow-private-network
```

An HTTPS playlist is not allowed to reference HTTP resources unless you pass `--allow-insecure`.

## Large downloads

Segment bodies are streamed to disk with incrementally computed hashes; they are not loaded into memory.

Defaults:

| Limit | Default |
|---|---:|
| Playlist size | 16 MiB |
| Single segment | 1 GiB |
| Total download | 50 GiB |
| Segments | 100,000 |
| Redirects | 10 |
| Request-header / segment-inactivity timeout | 120 s |

Override the download limits when needed:

```bash
# Allow up to 100 GB total
npx meow-loader <url> --max-download 100GB

# Allow larger individual segments
npx meow-loader <url> --max-segment-size 2GB

# No total limit for this run
npx meow-loader <url> --max-download 0
```

During download, the CLI reports segment progress, total downloaded, speed, and an ETA. It checks free disk space before downloading when an estimate is available, periodically during the download, and before merging.

If a limit is reached:

- Interactive terminals are asked whether to continue when an estimated size exceeds the limit.
- Non-interactive runs fail with exit code 1.
- Downloaded segments and resume metadata are preserved.
- The CLI prints the resume command and how to raise the limit.

`--dry-run` prints the selected variant, segment count, duration, estimated size, and free space without downloading.

### Output safety

- With no output filename, an existing `output.mp4` is never overwritten;
  the CLI uses `output-1.mp4`, `output-2.mp4`, and so on.
- With an explicit output filename, the CLI refuses to overwrite an existing
  file unless you pass `--force`.
- Output filenames must end in `.mp4`.
- The merged file is written to a private temporary directory and renamed only
  after ffmpeg succeeds and ffprobe confirms the expected duration.
- A failed or truncated merge does not destroy an existing output file.

### Resume safety

`--resume` never deletes the directory you pass. Segments are kept after a
successful merge unless `--cleanup` is used, and `--cleanup` only removes
files recorded by meow-loader.

Resume metadata is written atomically with mode `0600` and contains hashed
playlist identities plus per-segment SHA-256 hashes. It does not store raw
playlist URLs or query tokens. A different playlist, variant, or corrupted
segment is rejected instead of being reused. A resume directory is intended
for a single writer at a time.

### Logs and privacy

There is no log file. Normal output goes to stdout; warnings and errors go to
stderr. ffmpeg stderr is captured in memory and printed only when merging
fails. It is not persisted.

If you redirect output to a file or run in CI, that captured output becomes a
log. URLs are redacted in logs and errors, and terminal control characters from
manifest-controlled strings are escaped.

## Features

- Parse master and media M3U8 playlists
- Select the highest-bandwidth variant by default
- Interactive variant selection for master playlists
- AES-128 encrypted HLS support, including key rotation and default IVs
- Streamed segment downloads with incremental SHA-256 hashing
- MPEG-TS validation and ffprobe duration verification before replacing output
- Resume interrupted downloads without treating partial files as complete
- Merge segments into a single MP4 via ffmpeg
- Per-origin header scoping, SSRF protection, and request timeouts

## Limitations

- DRM-protected streams (Widevine, FairPlay, etc.) are not supported.
- `SAMPLE-AES` and `SAMPLE-AES-CTR` encryption are not supported.
- Fragmented MP4 playlists using `#EXT-X-MAP` are not supported.
- Byte-range playlists using `#EXT-X-BYTERANGE` are not supported.
- Live playlists (missing `#EXT-X-ENDLIST`) are not supported.
- Variants that reference a separate audio rendition
  (`#EXT-X-MEDIA:TYPE=AUDIO` with a URI) are not supported.
- The output is remuxed with `-c copy`; the codecs must be compatible with
  the MP4 container.
- ffmpeg and ffprobe parse untrusted media. Keep them updated; use a sandbox or
  container if you need stronger isolation.
- SSRF protection resolves hostnames and blocks private ranges before requests.
  DNS rebinding is not fully preventable in-process; use a sandbox for hostile
  manifests.

Unsupported inputs fail with a clear error instead of producing a corrupt
output file.

## Development

```bash
git clone https://github.com/amoshydra/meow-loader.git
cd meow-loader
pnpm install
```

Run the checks:

```bash
pnpm typecheck
pnpm build
pnpm test:run
pnpm lint:package
```

Run the CLI from the local build:

```bash
node dist/index.mjs <m3u8-url>
```

## License

MIT. See [LICENSE](LICENSE).
