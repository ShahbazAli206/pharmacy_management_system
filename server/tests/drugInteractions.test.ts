import { describe, it, expect } from 'vitest';
import { checkInteractions, parseClasses } from '../src/services/drugInteractions';

describe('drug interaction engine', () => {
  it('flags a critical drug-drug interaction (anticoagulant + NSAID)', () => {
    const alerts = checkInteractions({
      candidate: { drugName: 'Ibuprofen', classes: ['nsaid'] },
      activeMeds: [{ drugName: 'Warfarin', classes: ['anticoagulant'] }],
      patientAgeYears: 50,
      patientAllergyClasses: [],
    });
    expect(alerts.some((a) => a.type === 'DRUG_INTERACTION' && a.severity === 'CRITICAL')).toBe(true);
  });

  it('flags duplicate therapy when a class overlaps an active med', () => {
    const alerts = checkInteractions({
      candidate: { drugName: 'Naproxen', classes: ['nsaid'] },
      activeMeds: [{ drugName: 'Ibuprofen', classes: ['nsaid'] }],
      patientAgeYears: 40,
      patientAllergyClasses: [],
    });
    expect(alerts.some((a) => a.type === 'DUPLICATE_THERAPY')).toBe(true);
  });

  it('flags an allergy conflict as critical', () => {
    const alerts = checkInteractions({
      candidate: { drugName: 'Amoxicillin', classes: ['penicillin'] },
      activeMeds: [],
      patientAgeYears: 30,
      patientAllergyClasses: ['penicillin'],
    });
    expect(alerts.some((a) => a.type === 'ALLERGY' && a.severity === 'CRITICAL')).toBe(true);
  });

  it('flags Beers Criteria only for elderly patients', () => {
    const young = checkInteractions({
      candidate: { drugName: 'Lorazepam', classes: ['benzodiazepine'] },
      activeMeds: [],
      patientAgeYears: 40,
      patientAllergyClasses: [],
    });
    const elderly = checkInteractions({
      candidate: { drugName: 'Lorazepam', classes: ['benzodiazepine'] },
      activeMeds: [],
      patientAgeYears: 80,
      patientAllergyClasses: [],
    });
    expect(young.some((a) => a.type === 'BEERS_CRITERIA')).toBe(false);
    expect(elderly.some((a) => a.type === 'BEERS_CRITERIA')).toBe(true);
  });

  it('returns no alerts for a clean combination', () => {
    const alerts = checkInteractions({
      candidate: { drugName: 'Acetaminophen', classes: ['analgesic'] },
      activeMeds: [{ drugName: 'Amoxicillin', classes: ['antibiotic'] }],
      patientAgeYears: 45,
      patientAllergyClasses: [],
    });
    expect(alerts).toHaveLength(0);
  });

  it('parses comma-separated interaction class tags', () => {
    expect(parseClasses('nsaid, Anticoagulant ,')).toEqual(['nsaid', 'anticoagulant']);
    expect(parseClasses(null)).toEqual([]);
  });
});
