<div align="center">
  <img src="https://raw.githubusercontent.com/amoshydra/meow-loader/refs/heads/main/assets/banner.png" alt="meow-loader banner" width="420" />

  <strong>meow-loader</strong><br />
  <i>HLS / M3U8 downloader CLI</i>
  <br /><br />

  [![npm](https://img.shields.io/npm/v/meow-loader.svg)](https://www.npmjs.com/package/meow-loader)
  [![CI](https://github.com/amoshydra/meow-loader/actions/workflows/ci.yml/badge.svg)](https://github.com/amoshydra/meow-loader/actions/workflows/ci.yml)
  [![License](https://img.shields.io/github/license/amoshydra/meow-loader.svg)](LICENSE)
  [![Node.js](https://img.shields.io/node/v/meow-loader.svg)](https://nodejs.org/)
</div>

Download an HLS (M3U8) video stream and remux it into a single MP4 file.

```bash
npx meow-loader <m3u8-url>

# or install it once
npm install -g meow-loader
meow-loader <m3u8-url>
```

Despite the name, this is a command-line HLS downloader, not a webpack loader.

<div align="center">
  <img src="https://raw.githubusercontent.com/amoshydra/meow-loader/main/assets/demo.svg" alt="Animated meow-loader demo: selecting a variant, audio and subtitles, downloading segments in parallel, and saving an MP4 with a WebVTT sidecar" width="860" />
</div>

**Jump to:** [Usage](#usage) · [Features](#features) · [Input support](#supported-inputs) · [Limitations](#limitations) · [Security](#security) · [Troubleshooting](#troubleshooting) · [Releases](https://github.com/amoshydra/meow-loader/releases) · [Changelog](CHANGELOG.md)

## What you get

- **MPEG-TS and fMP4/CMAF** segments, with byte-range (`#EXT-X-BYTERANGE`) and AES-128 support
- **Separate audio tracks** selected by index or language, muxed into the MP4
- **Sidecar WebVTT subtitles** written next to the video
- **Resumable downloads** with per-segment SHA-256 checks, plus offline `--merge-only`
- **Paste a browser "Copy as cURL"** command and keep its headers and cookies
- **Parallel segment downloads** (`--concurrency`) with shared size limits
- **No re-encode**: streams are remuxed with ffmpeg `-c copy`
- **Runs on Linux, macOS, and Windows**, with Node.js 22+ and ffmpeg

## Requirements

- [Node.js](https://nodejs.org/) 22 or newer
- [ffmpeg](https://ffmpeg.org/) and `ffprobe` available on your `PATH`
- Linux, macOS, or Windows

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

# Select an audio rendition by index (master playlists)
npx meow-loader https://example.com/master.m3u8 my-video.mp4 0 --audio 1

# Select an audio rendition by language or name
npx meow-loader https://example.com/master.m3u8 my-video.mp4 --audio-language es

# Select a subtitle rendition (master playlists)
npx meow-loader https://example.com/master.m3u8 my-video.mp4 --subtitle 0

# Retry a failed download up to five attempts, with a 60 second timeout
npx meow-loader https://example.com/stream.m3u8 --retries 5 --timeout 60

# Inspect variants, duration, and estimated size without downloading
npx meow-loader https://example.com/master.m3u8 --dry-run

# Download up to 3 segments at once
npx meow-loader https://example.com/stream.m3u8 --concurrency 3

# Keep partial downloads and resume later
npx meow-loader https://example.com/stream.m3u8 --resume /tmp/meow-abc123

# Merge a saved working dir without contacting the playlist endpoint
npx meow-loader --merge-only /tmp/meow-abc123 recovered.mp4

# Resume, then remove the downloaded segments after a successful merge
npx meow-loader https://example.com/stream.m3u8 --resume /tmp/meow-abc123 --cleanup

# Overwrite an existing output file
npx meow-loader https://example.com/stream.m3u8 my-video.mp4 --force

# Paste a browser "Copy as cURL" command directly
npx meow-loader curl 'https://example.com/stream.m3u8' -H 'Pragma: no-cache'
```

`--dry-run` inspects the playlist without downloading:

```text
$ npx meow-loader https://example.com/master.m3u8 --dry-run
Fetching playlist: https://example.com/master.m3u8
Master playlist detected. Available variants (highest first):
  [0] 5000 kbps (1920x1080)
  [1] 2500 kbps (1280x720)
Selected variant: 1920x1080 @ 5000 kbps
Fetching variant playlist: https://example.com/1080p.m3u8
Segments: 1450
Container: MPEG-TS
Duration: 1h 12m 23s
Estimated size: ~2.5 GB (bandwidth-based)
Download limit: 50.0 GB
Free space: 94.3 GB
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

### Copy as cURL

Paste a command from the browser's "Copy as cURL" menu directly after `meow-loader`. The `curl` word must be the first argument:

```bash
npx meow-loader curl 'https://media.example.com/stream.m3u8' \
  -H 'Pragma: no-cache' \
  -H 'Referer: https://example.com/' \
  -b 'session=abc123'
```

Supported curl options: `--url`, `-H`/`--header`, `-b`/`--cookie` (a cookie string, not a file), `-A`/`--user-agent`, `-e`/`--referer`, `-o`/`--output`, `-k`/`--insecure`, and the harmless `-L`, `--compressed`, `--http1.1`, `--http2`, `-s`, `-S`. `-k` maps to `--allow-insecure`.

Only GET requests are supported. Options that change the method or send a body (`-X`, `-d`, `--data-raw`, `-F`, `-I`), bypass the URL safety checks (`--resolve`, `--connect-to`, `--proxy`, `-4`, `-6`, `--unix-socket`), or upload files (`-T`) are rejected with an explanation instead of being silently ignored. In this mode `-o` sets the output file and `-f` means curl's `--fail`; use `--force` to overwrite an existing file.

Headers remain scoped to the playlist origin, so a separate CDN host still needs `--header-origin`. For a loopback or LAN URL, add `--allow-private-network`. Use the "Copy as cURL (bash)" variant: Windows `cmd` and PowerShell quoting is not supported.

Copied commands usually contain cookies and other credentials. They end up in shell history unless you prevent it, so treat them as secrets.

### Separate audio tracks

When a master playlist declares audio renditions (`#EXT-X-MEDIA:TYPE=AUDIO`),
meow-loader lists them and picks the one marked `DEFAULT=YES` by default:

```
Available audio renditions:
  [0] English (en, default)
  [1] Spanish (es)
```

Choose another rendition by index, or by language/name:

```bash
npx meow-loader https://example.com/master.m3u8 out.mp4 0 --audio 1
npx meow-loader https://example.com/master.m3u8 out.mp4 --audio-language es
```

Index 0 is the default rendition, followed by `AUTOSELECT` entries and then
playlist order. `--audio-language` matches BCP-47 language tags (`en`, `en-US`)
and falls back to the rendition name. `--audio` and `--audio-language` cannot
be combined. With multiple renditions and an interactive terminal, the CLI
asks which one to use; non-interactive runs take the default. If the variant's
audio is already muxed, no listing or separate download happens.

### Subtitles

When a master playlist declares subtitle renditions
(`#EXT-X-MEDIA:TYPE=SUBTITLES`), meow-loader downloads the `DEFAULT=YES`
rendition (then `AUTOSELECT`, then the first) and writes a sidecar WebVTT file
next to the MP4:

```
video.mp4
video.en.vtt
```

Choose another rendition with `--subtitle <index>`; the list is printed with
the same default ordering as audio. Subtitles are not muxed into the MP4, and
`--merge-only` does not recreate them because they are not stored in the resume
directory. Byte-range and encrypted subtitle segments are not supported.

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

### Retries, timeouts, and the working directory

`--retries <n>` controls attempts per resource (default 3, range 1-10).
`--timeout <seconds>` controls the playlist, header, and inactivity timeouts
(default 120, range 1-3600).

The working directory is created under the operating system temporary
directory (`os.tmpdir()`, which honours `TMPDIR`). For very large downloads or
a small temporary filesystem, point `TMPDIR` at a larger disk or use
`--resume <dir>` to choose the directory explicitly.

### Concurrency

Segment downloads are sequential by default. `--concurrency <n>` downloads up
to `n` segments at once, from 1 to 16:

```bash
npx meow-loader https://example.com/stream.m3u8 --concurrency 4
```

`--max-download` and `--max-segment-size` are shared across in-flight requests.
The remaining budget is reserved per worker, so a tight limit can stop new
workers before they start. In parallel mode retries use automatic backoff
instead of the interactive retry prompt. Concurrency applies per track: the
video track is downloaded first, then a separate audio track.

### Output safety

- With no output filename, an existing `output.mp4` is never overwritten;
  the CLI uses `output-1.mp4`, `output-2.mp4`, and so on.
- With an explicit output filename, the CLI refuses to overwrite an existing
  file unless you pass `--force`.
- If the chosen filename appears while downloading (for example, another
  process creates it), the CLI saves to the next free `-1`, `-2`, ... name
  instead of discarding the completed download.
- Output filenames must end in `.mp4`.
- The merged file is written to a private temporary directory and renamed only
  after ffmpeg succeeds and ffprobe confirms the expected duration.
- A failed or truncated merge does not destroy an existing output file.

### Resume safety

`--resume` never deletes the directory you pass. Segments are kept after a
successful merge unless `--cleanup` is used, and `--cleanup` only removes
files recorded by meow-loader.

Resuming also works after a failed merge: the downloaded segments are still in
the working directory printed during the run (`Working dir: ...`), so
`--resume <dir>` validates them and merges again without downloading. Existing
segments are hashed with a progress line showing files and bytes checked. The
same playlist URL is re-fetched and checked; if it has changed, the resume is
rejected.

CloudFront URLs may use a refreshed JWT access token in the first path
component when resuming. The playlist path, variant, query, segment list,
and saved segment hashes must still match.

If the playlist endpoint is gone entirely, merge the saved directory offline:

```bash
npx meow-loader --merge-only /tmp/meow-abc123 recovered.mp4
```

This reads `meow-loader.resume.json`, verifies every recorded segment against
its size and SHA-256, and refuses to merge if any segment is missing or
corrupt. `--cleanup` removes the segments after a successful merge. Resume
directories created by older versions do not record the playlist duration, so
for those only the presence of streams and a readable duration is checked.

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

## Troubleshooting

**`Output file already exists` after the download finished.** Another process
created the target filename while segments were downloading. Current versions
save to `output-1.mp4` (or the next free name) automatically; if you are on an
older version, the segments are still in the printed `Working dir:` — re-run
with `--resume <dir>` and a different output name, or with `--force`.

**The playlist endpoint is gone.** If the working directory still contains
`meow-loader.resume.json` and the recorded segment files, merge it without any network
access:

```bash
npx meow-loader --merge-only /tmp/meow-abc123 recovered.mp4
```

Every recorded segment is verified by size and SHA-256; the merge is refused if
any are missing or corrupt.

**The download stopped part-way.** Re-run with the same playlist URL and
`--resume <dir>`; completed segments are validated and skipped. The resume
directory must still match the playlist.

**A CDN or key host returns 401/403.** Custom headers are scoped to the
playlist origin. Add `--header-origin https://cdn.example.com` for each host
that needs them.

**`Invalid M3U8 file: missing #EXTM3U header` / an HTML page error.** The URL is
a web page, not a playlist. In the browser Network tab, copy the `.m3u8`
request (or its cURL) instead of the page.

**`Refusing ... private network address`.** Loopback and LAN URLs require
`--allow-private-network`; HTTPS playlists that reference HTTP resources also
need `--allow-insecure`.

**`server ignored the HTTP Range request`.** The playlist uses byte ranges, but
the host returned the whole file instead of a partial response. Byte-range
playlists require a server or CDN that honors `Range` requests.

## Supported inputs

| Input | Supported | Notes |
|---|:---:|---|
| MPEG-TS and fMP4/CMAF | Yes | fMP4 playlists may use one `#EXT-X-MAP` init segment; changing it mid-playlist is unsupported |
| Byte ranges | Yes | `#EXT-X-BYTERANGE`; the server or CDN must honor `Range` requests |
| AES-128 encryption | Yes | Includes key rotation and default IVs |
| Separate audio | Yes | `--audio` or `--audio-language`; muxed into the MP4 |
| Subtitles | Yes (sidecar) | `--subtitle`; plain WebVTT only, not muxed; byte-range and encrypted subtitle segments are unsupported |
| Live playlists | No | `#EXT-X-ENDLIST` is required |
| DRM / SAMPLE-AES | No | Widevine, FairPlay, `SAMPLE-AES`, and `SAMPLE-AES-CTR` are unsupported |
| MP4 output | Yes | Remuxed with ffmpeg `-c copy`; codecs must be MP4-compatible |

## Features

- Parse master and media M3U8 playlists
- Select the highest-bandwidth variant by default
- Interactive variant selection for master playlists
- AES-128 encrypted HLS support, including key rotation and default IVs
- MPEG-TS and fMP4/CMAF segments, including a single `#EXT-X-MAP` init segment
- Streamed segment downloads with incremental SHA-256 hashing
- Segment container validation and ffprobe duration verification before replacing output
- Resume interrupted downloads without treating partial files as complete
- Optional parallel segment downloads with shared limits (`--concurrency`)
- Configurable retries, timeouts, and interruption cleanup
- DNS-pinned SSRF protection, per-origin header scoping, and request timeouts

## Limitations

- DRM-protected streams (Widevine, FairPlay, etc.) are not supported.
- `SAMPLE-AES` and `SAMPLE-AES-CTR` encryption are not supported.
- Changing the `#EXT-X-MAP` initialization segment mid-playlist is not supported.
- Live playlists (missing `#EXT-X-ENDLIST`) are not supported.
- The output is remuxed with `-c copy`; the codecs must be compatible with
  the MP4 container.
- Subtitles are written as sidecar `.vtt` files, not muxed into the MP4.
- Byte-range and encrypted subtitle segments are not supported.
- ffmpeg and ffprobe parse untrusted media. Keep them updated; use a sandbox or
  container if you need stronger isolation.
- SSRF protection resolves and validates addresses and pins connections to
  them; redirect targets are validated separately. A malicious local DNS
  resolver can still lie about addresses, so use a sandbox for hostile input.

Unsupported inputs fail with a clear error instead of producing a corrupt
output file.

## Security

See [SECURITY.md](SECURITY.md) for the threat model, private vulnerability
reporting, and hardening guidance. The largest residual risk is
`ffmpeg`/`ffprobe` parsing untrusted media; keep them updated and use a sandbox
for hostile input.

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

Version history lives in [CHANGELOG.md](CHANGELOG.md) and [Releases](https://github.com/amoshydra/meow-loader/releases).

## License

MIT. See [LICENSE](LICENSE).
