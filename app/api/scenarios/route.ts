import { readFileSync } from "node:fs";
import { join } from "node:path";

interface ScenarioManifest {
  scenarios: Array<{
    number: number;
    slug: string;
    title: string;
    tagline: string;
    summary: string;
    demonstrates: string[];
    primary_channel: string;
    secondary_channel: string | null;
    athlete: Record<string, unknown>;
    vault_entry_id: string;
    vault_path: string;
    opening_question: string;
    video_treatment: string;
  }>;
  production_notes: Record<string, unknown>;
}

let _cached: ScenarioManifest | null = null;

function loadManifest(): ScenarioManifest {
  if (_cached && process.env.NODE_ENV !== "development") return _cached;
  const path = join(process.cwd(), "lib", "vault", "content", "demo-scenarios.json");
  const raw = readFileSync(path, "utf8");
  _cached = JSON.parse(raw) as ScenarioManifest;
  return _cached;
}

export function GET() {
  return Response.json(loadManifest());
}
