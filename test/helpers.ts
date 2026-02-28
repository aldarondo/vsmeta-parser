/**
 * Binary-building utilities shared across all test files.
 *
 * These functions mirror the Protocol Buffer TLV encoding that .vsmeta files use,
 * making it possible to construct synthetic buffers in unit tests without needing
 * real .vsmeta fixture files.
 */

/** Encode a non-negative integer as a protobuf varint byte sequence. */
export function encodeVarint(value: bigint | number): number[] {
  let v = typeof value === 'bigint' ? value : BigInt(value);
  const bytes: number[] = [];
  while (v > 0x7fn) {
    bytes.push(Number(v & 0x7fn) | 0x80);
    v >>= 7n;
  }
  bytes.push(Number(v));
  return bytes;
}

/** Encode a tag byte (field number + wire type). */
export function tag(fieldNum: number, wireType: number): number[] {
  return encodeVarint((fieldNum << 3) | wireType);
}

/** Encode a varint field (wire type 0). */
export function varintField(fieldNum: number, value: bigint | number): number[] {
  return [...tag(fieldNum, 0), ...encodeVarint(value)];
}

/** Encode a length-delimited string field (wire type 2). */
export function stringField(fieldNum: number, str: string): number[] {
  const data = Buffer.from(str, 'utf8');
  return [...tag(fieldNum, 2), ...encodeVarint(data.length), ...data];
}

/** Encode a length-delimited bytes field (wire type 2). */
export function bytesField(fieldNum: number, data: Buffer): number[] {
  return [...tag(fieldNum, 2), ...encodeVarint(data.length), ...data];
}

/**
 * Encode a minimal JPEG (SOI + EOI markers) as a base64 string field.
 * Used for testing poster and backdrop image decoding.
 */
export function base64JpegField(fieldNum: number): number[] {
  const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  return stringField(fieldNum, jpegBytes.toString('base64'));
}

/** Assemble an array of pre-encoded field bytes into a Buffer. */
export function buildVsMeta(fields: number[]): Buffer {
  return Buffer.from(fields);
}

/** Build a field-10 cast/crew nested message buffer. */
export function buildCastBlock(
  actors: string[],
  directors: string[],
  genres: string[],
  writers: string[],
): Buffer {
  const fields: number[] = [];
  for (const a of actors)    fields.push(...stringField(1, a));
  for (const d of directors) fields.push(...stringField(2, d));
  for (const g of genres)    fields.push(...stringField(3, g));
  for (const w of writers)   fields.push(...stringField(4, w));
  return Buffer.from(fields);
}

/** Build a field-19 TV episode details nested message buffer. */
export function buildEpisodeDetails(opts: {
  season: number;
  episode: number;
  year: number;
  airDate: string;
  plot: string;
  withImage?: boolean;
}): Buffer {
  const fields: number[] = [
    ...varintField(1, opts.season),
    ...varintField(2, opts.episode),
    ...varintField(3, opts.year),
    ...stringField(4, opts.airDate),
    ...stringField(6, opts.plot),
  ];
  if (opts.withImage) fields.push(...base64JpegField(7));
  return Buffer.from(fields);
}
