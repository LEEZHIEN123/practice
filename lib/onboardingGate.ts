/** Synchronous gate so auth listeners cannot race React state during registration. */
let onboardingInProgress = false;

export function setOnboardingGate(active: boolean): void {
  onboardingInProgress = active;
}

export function isOnboardingGate(): boolean {
  return onboardingInProgress;
}
