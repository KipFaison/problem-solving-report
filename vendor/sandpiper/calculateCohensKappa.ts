// Copied from NTO Sandpiper (MIT). See NOTICE.
// Upstream: https://github.com/National-Tutoring-Observatory/sandpiper
// Path:     app/modules/evaluations/helpers/calculateCohensKappa.ts
// Commit:   b437988 (2026-09-08). Content below this header is unchanged.
// [OURS (upstream): upstream line 37 returns 1 when expected agreement is 1, so two runs that annotate nothing score a perfect 1; our wrapper refuses that input; see docs/DEVIATIONS.md]
// [OURS (upstream): upstream line 6 returns 0 on a length mismatch rather than raising; our wrapper refuses that input; see docs/DEVIATIONS.md]
export default function calculateCohensKappa(
  labelsA: string[],
  labelsB: string[],
): number {
  if (labelsA.length === 0 || labelsB.length === 0) return 0;
  if (labelsA.length !== labelsB.length) return 0;

  const totalItems = labelsA.length;

  const categories = [...new Set([...labelsA, ...labelsB])];

  const frequencyA: Record<string, number> = {};
  const frequencyB: Record<string, number> = {};
  let agreementCount = 0;

  for (const category of categories) {
    frequencyA[category] = 0;
    frequencyB[category] = 0;
  }

  for (let index = 0; index < totalItems; index++) {
    frequencyA[labelsA[index]]++;
    frequencyB[labelsB[index]]++;
    if (labelsA[index] === labelsB[index]) {
      agreementCount++;
    }
  }

  const observedAgreement = agreementCount / totalItems;

  let expectedAgreement = 0;
  for (const category of categories) {
    expectedAgreement +=
      (frequencyA[category] / totalItems) * (frequencyB[category] / totalItems);
  }

  if (expectedAgreement === 1) return 1;

  return (observedAgreement - expectedAgreement) / (1 - expectedAgreement);
}
