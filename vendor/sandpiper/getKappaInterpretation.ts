// Copied from NTO Sandpiper (MIT). See NOTICE.
// Upstream: https://github.com/National-Tutoring-Observatory/sandpiper
// Path:     app/modules/evaluations/helpers/getKappaInterpretation.ts
// Commit:   b437988 (2026-09-08). Content below this header is unchanged.
// [SOURCE: bands follow Landis & Koch (1977), Biometrics 33(1):159-174]
// [OURS (upstream): the "Perfect" return at exactly 1 is not a Landis & Koch band; see docs/DEVIATIONS.md D-010]

export default function getKappaInterpretation(kappa: number): string {
  if (kappa < 0) return "Poor";
  if (kappa <= 0.2) return "Slight";
  if (kappa <= 0.4) return "Fair";
  if (kappa <= 0.6) return "Moderate";
  if (kappa <= 0.8) return "Substantial";
  if (kappa < 1) return "Almost Perfect";
  return "Perfect";
}
