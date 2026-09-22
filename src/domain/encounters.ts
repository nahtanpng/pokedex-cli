import type { ApiReader } from '../api/client.js';
import type { LocationArea, LocationAreaEncounter, LocalizedName, NamedResource } from '../api/types.js';
import { titleCase } from '../util.js';

export interface MethodSummary {
  method: string;
  minLevel: number;
  maxLevel: number;
  chance: number;
  conditions: string[];
}

export interface EncounterEntry {
  location: string;
  areas: string[];
  versions: string[];
  methods: MethodSummary[];
}

interface LocationResource {
  name: string;
  names: LocalizedName[];
  region: NamedResource | null;
}

function englishName(names: LocalizedName[], fallback: string): string {
  return names.find((entry) => entry.language.name === 'en')?.name ?? titleCase(fallback);
}

/** "kanto-route-2-south-towards-viridian-city" under "kanto-route-2" -> "south towards viridian city" */
function areaLabel(areaSlug: string, locationSlug: string): string | null {
  const suffix = areaSlug.startsWith(`${locationSlug}-`) ? areaSlug.slice(locationSlug.length + 1) : areaSlug;
  if (suffix === 'area' || suffix === '' || suffix === areaSlug) return null;
  return suffix.replace(/-/g, ' ');
}

export async function collectEncounters(
  client: ApiReader,
  encountersUrl: string,
  versionNames: string[],
): Promise<EncounterEntry[]> {
  const raw = await client.get<LocationAreaEncounter[]>(encountersUrl);
  const wanted = new Set(versionNames);

  const matching = raw
    .map((entry) => ({
      area: entry.location_area,
      details: entry.version_details.filter((detail) => wanted.size === 0 || wanted.has(detail.version.name)),
    }))
    .filter((entry) => entry.details.length > 0);

  if (matching.length === 0) return [];

  const areas = await client.getAll<LocationArea>(matching.map((entry) => entry.area.url));
  const locationUrls = [...new Set(areas.map((area) => area.location.url))];
  const locations = await client.getAll<LocationResource>(locationUrls);
  const locationByUrl = new Map(locationUrls.map((url, index) => [url, locations[index]!]));

  const byLocation = new Map<string, EncounterEntry>();

  matching.forEach((entry, index) => {
    const area = areas[index]!;
    const location = locationByUrl.get(area.location.url)!;
    const locationName = englishName(location.names, location.name);

    const existing = byLocation.get(locationName) ?? {
      location: locationName,
      areas: [],
      versions: [],
      methods: [],
    };

    const label = areaLabel(area.name, location.name);
    if (label && !existing.areas.includes(label)) existing.areas.push(label);

    const chanceByMethod = new Map<string, number>();

    for (const detail of entry.details) {
      if (!existing.versions.includes(detail.version.name)) existing.versions.push(detail.version.name);

      const perVersion = new Map<string, number>();

      for (const encounter of detail.encounter_details) {
        const method = encounter.method.name;
        perVersion.set(method, (perVersion.get(method) ?? 0) + encounter.chance);

        const summary = existing.methods.find((item) => item.method === method);
        const conditions = encounter.condition_values.map((value) => value.name);

        if (summary) {
          summary.minLevel = Math.min(summary.minLevel, encounter.min_level);
          summary.maxLevel = Math.max(summary.maxLevel, encounter.max_level);
          for (const condition of conditions) {
            if (!summary.conditions.includes(condition)) summary.conditions.push(condition);
          }
        } else {
          existing.methods.push({
            method,
            minLevel: encounter.min_level,
            maxLevel: encounter.max_level,
            chance: 0,
            conditions: [...conditions],
          });
        }
      }

      // The listed chance is per condition, so the rate for a method is the sum within a
      // version; across versions we keep the best one.
      for (const [method, chance] of perVersion) {
        chanceByMethod.set(method, Math.max(chanceByMethod.get(method) ?? 0, chance));
      }
    }

    for (const summary of existing.methods) {
      const chance = chanceByMethod.get(summary.method);
      if (chance !== undefined) summary.chance = Math.max(summary.chance, Math.min(chance, 100));
    }

    byLocation.set(locationName, existing);
  });

  return [...byLocation.values()].sort((a, b) => {
    const best = (entry: EncounterEntry) => Math.max(...entry.methods.map((method) => method.chance), 0);
    return best(b) - best(a) || a.location.localeCompare(b.location);
  });
}
