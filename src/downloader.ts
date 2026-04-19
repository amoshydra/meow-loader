import type { M3U8Encryption } from './m3u8-parser';

export async function downloadSegment(
  uri: string,
  baseUrl: string,
  encryption?: M3U8Encryption,
): Promise<Uint8Array> {
  const url = resolveUrl(uri, baseUrl);
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to download segment: ${url} (${response.status})`);
  }

  const buffer = await response.arrayBuffer();
  const data = new Uint8Array(buffer);

  if (encryption && encryption.method === 'AES-128') {
    return decryptSegment(data, encryption, baseUrl);
  }

  return data;
}

async function decryptSegment(
  data: Uint8Array,
  encryption: M3U8Encryption,
  baseUrl: string,
): Promise<Uint8Array> {
  const keyUrl = resolveUrl(encryption.uri, baseUrl);
  const keyResponse = await fetch(keyUrl);

  if (!keyResponse.ok) {
    throw new Error(`Failed to download encryption key: ${keyUrl}`);
  }

  const keyBuffer = await keyResponse.arrayBuffer();
  const key = new Uint8Array(keyBuffer);

  let iv: Uint8Array;
  if (encryption.iv) {
    const ivHex = encryption.iv.startsWith('0x') ? encryption.iv.slice(2) : encryption.iv;
    iv = hexToUint8Array(ivHex);
  } else {
    iv = new Uint8Array(16);
  }

  const keyData = key.buffer.slice(key.byteOffset, key.byteOffset + key.byteLength) as ArrayBuffer;
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'AES-CBC' },
    false,
    ['decrypt'],
  );

  const dataSlice = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-CBC', iv: iv.buffer.slice(iv.byteOffset, iv.byteOffset + iv.byteLength) as ArrayBuffer },
    cryptoKey,
    dataSlice,
  );

  return new Uint8Array(decrypted);
}

function resolveUrl(uri: string, baseUrl: string): string {
  if (uri.startsWith('http://') || uri.startsWith('https://')) {
    return uri;
  }
  return new URL(uri, baseUrl).href;
}

function hexToUint8Array(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}
