const HEX = Array.from({ length: 256 }, (_, i) =>
  i.toString(16).padStart(2, "0"),
);

export function randomUUIDv7(): string {
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);

  const now = Date.now();
  buf[0] = (now / 0x10000000000) & 0xff;
  buf[1] = (now / 0x100000000) & 0xff;
  buf[2] = (now / 0x1000000) & 0xff;
  buf[3] = (now / 0x10000) & 0xff;
  buf[4] = (now / 0x100) & 0xff;
  buf[5] = now & 0xff;
  buf[6] = (buf[6] & 0x0f) | 0x70;
  buf[8] = (buf[8] & 0x3f) | 0x80;

  return (
    HEX[buf[0]] +
    HEX[buf[1]] +
    HEX[buf[2]] +
    HEX[buf[3]] +
    "-" +
    HEX[buf[4]] +
    HEX[buf[5]] +
    "-" +
    HEX[buf[6]] +
    HEX[buf[7]] +
    "-" +
    HEX[buf[8]] +
    HEX[buf[9]] +
    "-" +
    HEX[buf[10]] +
    HEX[buf[11]] +
    HEX[buf[12]] +
    HEX[buf[13]] +
    HEX[buf[14]] +
    HEX[buf[15]]
  );
}
