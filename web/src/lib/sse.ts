export function parseSseEvent(raw: string): { event: string; payload: any } | null {
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  const event = lines.find((l) => l.startsWith('event:'))?.slice(6).trim();
  const data = lines.filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trimStart()).join('\n');
  if (!event || !data) return null;
  try { return { event, payload: JSON.parse(data) }; } catch { return null; }
}
