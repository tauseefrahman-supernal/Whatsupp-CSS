import type { NextRequest } from "next/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createAthlete, updateAthleteProfile, listAthletes, type AthleteProfile } from "@/lib/db";

interface Scenario {
  slug: string;
  title: string;
  athlete: {
    name: string;
    sex?: string | null;
    age?: number | null;
    weight_kg?: number | null;
    sport?: string | null;
    level?: string | null;
    context?: string | null;
  };
  opening_question: string;
}

interface ScenarioManifest {
  scenarios: Scenario[];
}

function loadScenario(slug: string): Scenario | null {
  const path = join(process.cwd(), "lib", "vault", "content", "demo-scenarios.json");
  const manifest = JSON.parse(readFileSync(path, "utf8")) as ScenarioManifest;
  return manifest.scenarios.find(s => s.slug === slug) ?? null;
}

/**
 * Idempotently create-or-reuse the canonical demo athlete for a scenario.
 * Returns { athleteId, openingQuestion } so the frontend can route to
 * /george?a=<id>&seed=<slug> and pre-fill the composer.
 */
export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const scenario = loadScenario(slug);
  if (!scenario) {
    return Response.json({ error: `Unknown scenario: ${slug}` }, { status: 404 });
  }

  // The canonical "demo athlete" name is "<athlete.name> (demo)" so we don't
  // collide with a real athlete the user has created. We look up by exact name.
  const canonicalName = `${scenario.athlete.name} (demo · scenario ${scenario.slug})`;

  const existing = listAthletes().find(a => a.name === canonicalName);
  let athlete: AthleteProfile;
  if (existing) {
    athlete = existing as AthleteProfile;
  } else {
    athlete = createAthlete(canonicalName);
  }

  // Patch profile with the scenario's archetype.
  const patched = updateAthleteProfile(athlete.id, {
    sex: scenario.athlete.sex ?? null,
    age: scenario.athlete.age ?? null,
    weight_kg: scenario.athlete.weight_kg ?? null,
    sport: scenario.athlete.sport ?? null,
    level: scenario.athlete.level ?? null,
    context: scenario.athlete.context ?? null,
    profile: { demo_scenario_slug: scenario.slug },
  });

  return Response.json({
    athleteId: (patched ?? athlete).id,
    athleteName: (patched ?? athlete).name,
    openingQuestion: scenario.opening_question,
    title: scenario.title,
  });
}
