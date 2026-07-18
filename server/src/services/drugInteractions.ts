/**
 * Rule-based drug-interaction / safety engine.
 *
 * Checks a candidate drug against a patient's active medication profile and
 * produces alerts for: drug-drug interactions, duplicate therapy, allergy
 * conflicts, and Beers Criteria (potentially inappropriate in the elderly).
 *
 * This is a deterministic, self-contained ruleset so the workflow is real and
 * testable now. A production deployment replaces the class tags + rule tables
 * with a licensed clinical database (e.g. via the interactionClasses feed).
 */

export type AlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export interface InteractionAlert {
  type: 'DRUG_INTERACTION' | 'DUPLICATE_THERAPY' | 'ALLERGY' | 'BEERS_CRITERIA';
  severity: AlertSeverity;
  message: string;
}

export interface ActiveMed {
  drugName: string;
  classes: string[];
}

export interface InteractionCheckInput {
  candidate: { drugName: string; classes: string[] };
  activeMeds: ActiveMed[];
  patientAgeYears: number | null;
  patientAllergyClasses: string[]; // normalized allergy substances/classes
}

// Pairs of drug classes that interact, with severity + rationale.
const INTERACTION_PAIRS: Array<{ a: string; b: string; severity: AlertSeverity; note: string }> = [
  { a: 'nsaid', b: 'anticoagulant', severity: 'CRITICAL', note: 'increased bleeding risk' },
  { a: 'opioid', b: 'benzodiazepine', severity: 'CRITICAL', note: 'risk of respiratory depression' },
  { a: 'nitrate', b: 'pde5_inhibitor', severity: 'CRITICAL', note: 'risk of severe hypotension' },
  { a: 'maoi', b: 'ssri', severity: 'CRITICAL', note: 'risk of serotonin syndrome' },
  { a: 'ace_inhibitor', b: 'potassium_sparing_diuretic', severity: 'WARNING', note: 'hyperkalemia risk' },
  { a: 'ssri', b: 'nsaid', severity: 'WARNING', note: 'increased GI bleeding risk' },
  { a: 'statin', b: 'macrolide', severity: 'WARNING', note: 'increased myopathy risk' },
];

// Classes flagged as potentially inappropriate for patients 65+.
const BEERS_CLASSES: Record<string, string> = {
  benzodiazepine: 'increased risk of falls and cognitive impairment',
  first_gen_antihistamine: 'strong anticholinergic effects',
  anticholinergic: 'confusion, constipation, falls',
  nsaid: 'GI bleeding and renal risk with chronic use',
};

const BEERS_AGE = 65;

export function checkInteractions(input: InteractionCheckInput): InteractionAlert[] {
  const alerts: InteractionAlert[] = [];
  const candClasses = input.candidate.classes.map((c) => c.toLowerCase().trim()).filter(Boolean);

  // 1. Drug-drug interactions vs. each active medication.
  for (const med of input.activeMeds) {
    const medClasses = med.classes.map((c) => c.toLowerCase().trim());
    for (const pair of INTERACTION_PAIRS) {
      const hit =
        (candClasses.includes(pair.a) && medClasses.includes(pair.b)) ||
        (candClasses.includes(pair.b) && medClasses.includes(pair.a));
      if (hit) {
        alerts.push({
          type: 'DRUG_INTERACTION',
          severity: pair.severity,
          message: `${input.candidate.drugName} + ${med.drugName}: ${pair.note}.`,
        });
      }
    }

    // 2. Duplicate therapy: shares a therapeutic class with an active med.
    const shared = candClasses.filter((c) => medClasses.includes(c));
    if (shared.length > 0) {
      alerts.push({
        type: 'DUPLICATE_THERAPY',
        severity: 'WARNING',
        message: `${input.candidate.drugName} overlaps with ${med.drugName} (class: ${shared.join(', ')}).`,
      });
    }
  }

  // 3. Allergy conflict.
  const allergyHit = candClasses.filter((c) =>
    input.patientAllergyClasses.map((a) => a.toLowerCase().trim()).includes(c),
  );
  if (allergyHit.length > 0) {
    alerts.push({
      type: 'ALLERGY',
      severity: 'CRITICAL',
      message: `Patient has a recorded allergy matching ${allergyHit.join(', ')}.`,
    });
  }

  // 4. Beers Criteria for elderly patients.
  if (input.patientAgeYears !== null && input.patientAgeYears >= BEERS_AGE) {
    for (const c of candClasses) {
      if (BEERS_CLASSES[c]) {
        alerts.push({
          type: 'BEERS_CRITERIA',
          severity: 'WARNING',
          message: `Beers Criteria (age ${input.patientAgeYears}): ${input.candidate.drugName} — ${BEERS_CLASSES[c]}.`,
        });
      }
    }
  }

  return alerts;
}

/** Parse the comma-separated interactionClasses tag string into a class list. */
export function parseClasses(tags: string | null | undefined): string[] {
  if (!tags) return [];
  return tags
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}
