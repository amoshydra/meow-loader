import { formatBytes, formatEta } from './display';

const LARGE_DOWNLOAD_WARNING_BYTES = 5 * 1024 ** 3;

export class DownloadProgress {
  private readonly tty: boolean;
  private readonly totalSegments: number;
  private completedSegments: number;
  private baseBytes: number;
  private segmentIndex = 0;
  private segmentBytes = 0;
  private segmentExpected: number | undefined;
  private lastRenderAt = 0;
  private lastLogAt = 0;
  private lastSampleAt = Date.now();
  private lastSampleBytes = 0;
  private speedBytesPerSecond = 0;
  private warnedLarge = false;
  private hasRendered = false;

  constructor(totalSegments: number, initialBytes: number, initialCompleted: number, tty: boolean) {
    this.totalSegments = totalSegments;
    this.baseBytes = initialBytes;
    this.completedSegments = initialCompleted;
    this.lastSampleBytes = initialBytes;
    this.tty = tty;
  }

  startSegment(index: number, expectedBytes?: number): void {
    this.segmentIndex = index;
    this.segmentBytes = 0;
    this.segmentExpected = expectedBytes;
    this.render(false);
  }

  addBytes(bytes: number): void {
    this.segmentBytes = bytes;
    const now = Date.now();
    if (now - this.lastRenderAt >= 250) {
      this.render(false);
    }
  }

  completeSegment(size: number): void {
    this.baseBytes += size;
    this.completedSegments++;
    this.segmentBytes = 0;
    this.segmentExpected = undefined;
    this.render(true);
  }

  finish(): void {
    if (this.tty && this.hasRendered) {
      process.stdout.write('\n');
    }
  }

  private render(final: boolean): void {
    const now = Date.now();
    this.updateSpeed(now);

    const totalBytes = this.baseBytes + this.segmentBytes;
    if (!this.warnedLarge && totalBytes >= LARGE_DOWNLOAD_WARNING_BYTES) {
      this.warnedLarge = true;
      console.error(
        `Warning: downloaded ${formatBytes(totalBytes)}. Use --max-download to set a hard limit.`,
      );
    }

    const parts = [`Segment ${this.segmentIndex + 1}/${this.totalSegments}`];

    if (this.segmentExpected !== undefined) {
      parts.push(`${formatBytes(this.segmentBytes)} / ${formatBytes(this.segmentExpected)}`);
    } else if (this.segmentBytes > 0) {
      parts.push(formatBytes(this.segmentBytes));
    }

    parts.push(`total ${formatBytes(totalBytes)}`);

    if (this.speedBytesPerSecond > 0) {
      parts.push(`${formatBytes(this.speedBytesPerSecond)}/s`);
    }

    const averageBytes =
      this.completedSegments > 0 ? this.baseBytes / this.completedSegments : undefined;
    const remainingSegments = Math.max(0, this.totalSegments - this.completedSegments);
    if (averageBytes !== undefined && this.speedBytesPerSecond > 0) {
      parts.push(`ETA ${formatEta((averageBytes * remainingSegments) / this.speedBytesPerSecond)}`);
    }

    const line = parts.join(' · ');

    if (this.tty) {
      process.stdout.write(`\r${line}`);
      this.hasRendered = true;
    } else if (final) {
      const shouldLog =
        this.totalSegments <= 10 ||
        (this.segmentIndex + 1) % 10 === 0 ||
        this.segmentIndex + 1 === this.totalSegments ||
        now - this.lastLogAt >= 5_000;

      if (shouldLog) {
        console.log(line);
        this.lastLogAt = now;
      }
    }

    this.lastRenderAt = now;
  }

  private updateSpeed(now: number): void {
    const elapsed = now - this.lastSampleAt;
    if (elapsed < 500) return;

    const currentBytes = this.baseBytes + this.segmentBytes;
    const deltaBytes = currentBytes - this.lastSampleBytes;
    this.speedBytesPerSecond = (deltaBytes * 1000) / elapsed;
    this.lastSampleAt = now;
    this.lastSampleBytes = currentBytes;
  }
}
