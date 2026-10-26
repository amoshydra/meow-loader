import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

const MPEG_TS_PACKET_SIZE = 188;
const MPEG_TS_SYNC_BYTE = 0x47;

/**
 * HLS segments handled by this CLI are MPEG-TS. Validate the packet structure
 * before treating a download as complete; this catches HTML error pages and
 * truncated responses that still return HTTP 200.
 */
export class MpegTsValidator {
  private bytes = 0;
  private invalid = false;

  update(chunk: Uint8Array): boolean {
    const chunkStart = this.bytes;

    for (let index = 0; index < chunk.byteLength; index++) {
      if ((chunkStart + index) % MPEG_TS_PACKET_SIZE === 0 && chunk[index] !== MPEG_TS_SYNC_BYTE) {
        this.invalid = true;
      }
    }

    this.bytes += chunk.byteLength;
    return !this.invalid;
  }

  get size(): number {
    return this.bytes;
  }

  get valid(): boolean {
    return !this.invalid && this.bytes >= MPEG_TS_PACKET_SIZE && this.bytes % MPEG_TS_PACKET_SIZE === 0;
  }
}

export interface MpegTsFileScan {
  size: number;
  sha256: string;
  valid: boolean;
}

export async function scanMpegTsFile(filePath: string): Promise<MpegTsFileScan> {
  const hash = createHash('sha256');
  const validator = new MpegTsValidator();
  const stream = createReadStream(filePath);

  for await (const chunk of stream) {
    const buffer = chunk as Buffer;
    hash.update(buffer);

    if (!validator.update(buffer)) {
      stream.destroy();
      break;
    }
  }

  return {
    size: validator.size,
    sha256: hash.digest('hex'),
    valid: validator.valid,
  };
}
