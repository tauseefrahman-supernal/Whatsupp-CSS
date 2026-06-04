import type { NextRequest } from "next/server";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

/**
 * QA helper — POST JSON body and it gets written to qa-screenshots/<filename>
 * as a UTF-8 file. Used to dump live conversation transcripts for QA reporting.
 * Dev-only convenience, not production.
 */
export async function POST(request: NextRequest) {
  const url = new URL(request.url);
  const filename = url.searchParams.get("filename") || "dump.json";
  const mode = url.searchParams.get("mode") || "text"; // "text" | "datauri"
  if (!/^[\w.\-]+$/.test(filename)) {
    return Response.json({ error: "Invalid filename" }, { status: 400 });
  }
  const dir = join(process.cwd(), "qa-screenshots");
  await mkdir(dir, { recursive: true });
  const path = join(dir, filename);

  if (mode === "datauri") {
    // Body is a JSON-quoted data URI like "data:image/png;base64,..."
    const raw = await request.text();
    const trimmed = raw.replace(/^"|"$/g, "");
    const m = trimmed.match(/^data:image\/[a-z+]+;base64,(.+)$/);
    if (!m) return Response.json({ error: "Invalid data URI" }, { status: 400 });
    const buf = Buffer.from(m[1], "base64");
    await writeFile(path, buf);
    return Response.json({ path, bytes: buf.length });
  }

  const body = await request.text();
  await writeFile(path, body, "utf8");
  return Response.json({ path, bytes: body.length });
}
