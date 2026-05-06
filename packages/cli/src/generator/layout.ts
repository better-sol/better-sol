export function paddingFor(offset: number, align: number): number {
  const remainder = offset % align;
  return remainder === 0 ? 0 : align - remainder;
}
