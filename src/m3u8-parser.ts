export interface M3U8Segment {
  uri: string;
  duration: number;
  title?: string;
  /** HLS media sequence number used for the default AES-128 IV. */
  sequence: number;
  encryption?: M3U8Encryption;
}

export interface M3U8Encryption {
  method: 'AES-128';
  uri: string;
  iv?: string;
}

export interface M3U8Playlist {
  isMaster: boolean;
  variants?: M3U8Variant[];
  segments?: M3U8Segment[];
  targetDuration?: number;
  mediaSequence: number;
  hasEndList: boolean;
  hasMap: boolean;
  hasByteRange: boolean;
  separateAudioGroups: string[];
}

export interface M3U8Variant {
  bandwidth: number;
  resolution?: string;
  uri: string;
  audioGroup?: string;
}

export function parseM3U8(content: string): M3U8Playlist {
  const lines = content
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0);

  if (lines[0] !== '#EXTM3U') {
    throw new Error('Invalid M3U8 file: missing #EXTM3U header');
  }

  const playlist: M3U8Playlist = {
    isMaster: false,
    segments: [],
    mediaSequence: 0,
    hasEndList: false,
    hasMap: false,
    hasByteRange: false,
    separateAudioGroups: [],
  };

  let currentSegment: { duration: number; title?: string } | undefined;
  let currentEncryption: M3U8Encryption | undefined;
  let pendingVariantAttrs: Record<string, string | undefined> | undefined;
  let segmentIndex = 0;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!;

    if (line.startsWith('#EXT-X-STREAM-INF:')) {
      if (!playlist.isMaster) {
        playlist.isMaster = true;
        playlist.variants = [];
        playlist.segments = undefined;
      }
      if (pendingVariantAttrs) {
        throw new Error('Invalid M3U8 file: #EXT-X-STREAM-INF without a URI');
      }
      pendingVariantAttrs = parseAttributes(line.slice(line.indexOf(':') + 1));
      continue;
    }

    if (line.startsWith('#EXT-X-MEDIA:')) {
      const attrs = parseAttributes(line.slice(line.indexOf(':') + 1));
      const groupId = attrs['GROUP-ID'];
      if ((attrs.TYPE || '').toUpperCase() === 'AUDIO' && attrs.URI && groupId) {
        if (!playlist.separateAudioGroups.includes(groupId)) {
          playlist.separateAudioGroups.push(groupId);
        }
      }
      continue;
    }

    if (line.startsWith('#EXT-X-TARGETDURATION:')) {
      const targetDuration = Number.parseFloat(line.slice(line.indexOf(':') + 1));
      if (!Number.isFinite(targetDuration) || targetDuration <= 0) {
        throw new Error('Invalid #EXT-X-TARGETDURATION');
      }
      playlist.targetDuration = targetDuration;
      continue;
    }

    if (line.startsWith('#EXT-X-MEDIA-SEQUENCE:')) {
      const value = line.slice(line.indexOf(':') + 1).trim();
      if (!/^\d+$/.test(value)) {
        throw new Error('Invalid #EXT-X-MEDIA-SEQUENCE');
      }
      const mediaSequence = Number(value);
      if (!Number.isSafeInteger(mediaSequence)) {
        throw new Error('Invalid #EXT-X-MEDIA-SEQUENCE');
      }
      playlist.mediaSequence = mediaSequence;
      continue;
    }

    if (line.startsWith('#EXT-X-KEY:')) {
      const attrs = parseAttributes(line.slice(line.indexOf(':') + 1));
      const method = (attrs.METHOD || 'NONE').toUpperCase();

      if (method === 'NONE') {
        currentEncryption = undefined;
      } else if (method === 'AES-128') {
        const keyFormat = attrs.KEYFORMAT;
        if (keyFormat && keyFormat.toLowerCase() !== 'identity') {
          throw new Error('Unsupported AES-128 key format (only identity is supported)');
        }
        if (!attrs.URI) {
          throw new Error('Invalid M3U8 file: AES-128 key is missing the URI attribute');
        }
        if (!isSupportedKeyUri(attrs.URI)) {
          throw new Error('Unsupported AES-128 key URI (only HTTP(S) and relative URLs are supported)');
        }
        currentEncryption = {
          method: 'AES-128',
          uri: attrs.URI,
          iv: attrs.IV,
        };
      } else {
        throw new Error('Unsupported encryption method (only AES-128 and NONE are supported)');
      }
      continue;
    }

    if (line.startsWith('#EXT-X-MAP')) {
      playlist.hasMap = true;
      continue;
    }

    if (line.startsWith('#EXT-X-BYTERANGE')) {
      playlist.hasByteRange = true;
      continue;
    }

    if (line.startsWith('#EXT-X-ENDLIST')) {
      playlist.hasEndList = true;
      continue;
    }

    if (line.startsWith('#EXTINF')) {
      if (currentSegment) {
        throw new Error('Invalid M3U8 file: duplicate #EXTINF before a segment URI');
      }

      const separator = line.indexOf(':');
      const comma = line.indexOf(',', separator + 1);
      const durationText = comma === -1 ? line.slice(separator + 1) : line.slice(separator + 1, comma);
      const duration = Number.parseFloat(durationText);
      if (!Number.isFinite(duration) || duration < 0) {
        throw new Error('Invalid #EXTINF duration');
      }
      currentSegment = {
        duration,
        title: comma === -1 ? undefined : line.slice(comma + 1),
      };
      continue;
    }

    if (line.startsWith('#')) {
      continue;
    }

    if (playlist.isMaster && playlist.variants) {
      if (!pendingVariantAttrs) {
        throw new Error('Invalid M3U8 file: segment URI without #EXT-X-STREAM-INF');
      }

      const attrs = pendingVariantAttrs;
      const bandwidth = Number.parseInt(attrs.BANDWIDTH || '0', 10);
      playlist.variants.push({
        bandwidth: Number.isNaN(bandwidth) ? 0 : bandwidth,
        resolution: attrs.RESOLUTION,
        uri: line,
        audioGroup: attrs.AUDIO,
      });
      pendingVariantAttrs = undefined;
      continue;
    }

    if (!currentSegment) {
      throw new Error('Invalid M3U8 file: segment URI without #EXTINF');
    }

    playlist.segments!.push({
      uri: line,
      duration: currentSegment.duration,
      title: currentSegment.title,
      sequence: playlist.mediaSequence + segmentIndex,
      ...(currentEncryption ? { encryption: { ...currentEncryption } } : {}),
    });
    segmentIndex++;
    currentSegment = undefined;
  }

  if (currentSegment) {
    throw new Error('Invalid M3U8 file: #EXTINF without a segment URI');
  }
  if (pendingVariantAttrs) {
    throw new Error('Invalid M3U8 file: #EXT-X-STREAM-INF without a URI');
  }

  return playlist;
}

/** Return variants ordered from highest to lowest bandwidth. */
export function sortVariantsByBandwidth(variants: M3U8Variant[]): M3U8Variant[] {
  return [...variants].sort((a, b) => b.bandwidth - a.bandwidth);
}

function isSupportedKeyUri(uri: string): boolean {
  if (/^[a-z][a-z0-9+.-]*:/i.test(uri)) {
    return /^https?:/i.test(uri);
  }
  return true;
}

function parseAttributes(str: string): Record<string, string | undefined> {
  const attrs: Record<string, string | undefined> = {};
  const regex = /([A-Z0-9-]+)=("([^"]*)"|([^,]*))/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(str)) !== null) {
    attrs[match[1]!] = match[3] ?? match[4];
  }

  return attrs;
}
