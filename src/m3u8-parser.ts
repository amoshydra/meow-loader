export interface M3U8Segment {
  uri: string;
  duration: number;
  title?: string;
}

export interface M3U8Encryption {
  method: string;
  uri: string;
  iv?: string;
}

export interface M3U8Playlist {
  isMaster: boolean;
  variants?: M3U8Variant[];
  segments?: M3U8Segment[];
  encryption?: M3U8Encryption;
  targetDuration?: number;
}

export interface M3U8Variant {
  bandwidth: number;
  resolution?: string;
  uri: string;
}

export function parseM3U8(content: string): M3U8Playlist {
  const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  if (lines[0] !== '#EXTM3U') {
    throw new Error('Invalid M3U8 file: missing #EXTM3U header');
  }

  const playlist: M3U8Playlist = {
    isMaster: false,
    segments: [],
  };

  let currentSegment: Partial<M3U8Segment> = {};
  let encryption: Partial<M3U8Encryption> = {};

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!;

    if (line.startsWith('#EXT-X-STREAM-INF') && !playlist.isMaster) {
      playlist.isMaster = true;
      playlist.variants = [];
      playlist.segments = undefined;
    }

    if (line.startsWith('#EXT-X-TARGETDURATION:')) {
      playlist.targetDuration = parseFloat(line.split(':')[1]!);
    }

    if (line.startsWith('#EXT-X-KEY:')) {
      const attrs = parseAttributes(line.split(':').slice(1).join(':'));
      encryption.method = attrs.METHOD || 'NONE';
      encryption.uri = attrs.URI || '';
      encryption.iv = attrs.IV;
    }

    if (line.startsWith('#EXTINF')) {
      const parts = line.split(':');
      const durationPart = parts[1]!;
      const duration = parseFloat(durationPart.split(',')[0]!);
      const title = durationPart.includes(',') ? durationPart.split(',')[1] : undefined;
      currentSegment = { duration, title };
    }

    if (line.startsWith('#')) continue;

    if (playlist.isMaster && playlist.variants) {
      const attrs = parseAttributes(lines[i - 1]!);
      playlist.variants.push({
        bandwidth: parseInt(attrs.BANDWIDTH || '0'),
        resolution: attrs.RESOLUTION,
        uri: line,
      });
    } else if (currentSegment.duration !== undefined) {
      playlist.segments!.push({
        uri: line,
        duration: currentSegment.duration,
        title: currentSegment.title,
      });
      currentSegment = {};
    }
  }

  if (encryption.uri) {
    playlist.encryption = encryption as M3U8Encryption;
  }

  return playlist;
}

function parseAttributes(str: string): Record<string, string | undefined> {
  const attrs: Record<string, string | undefined> = {};
  const regex = /([A-Z0-9-]+)=("([^"]*)"|([^,]*))/g;
  let match;
  while ((match = regex.exec(str)) !== null) {
    attrs[match[1]!] = match[3] || match[4];
  }
  return attrs;
}
