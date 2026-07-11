import React, { createContext, useContext, useMemo, useState } from "react";
import { isOnboardingGate, setOnboardingGate } from "@/lib/onboardingGate";

type Gender = "male" | "female";
export type ActivityKey = "sedentary" | "light" | "moderate" | "very_active";
export type DietaryPreference = "omnivore" | "vegetarian" | "vegan";

export type PendingAccount = {
  name: string;
  email: string;
  password: string;
};

export type PendingProfileDetails = {
  gender: Gender;
  age: number;
  height: number;
  weight: number;
};

export type PendingActivity = {
  activityLevel: ActivityKey;
  activityMultiplier: number;
};

export type PendingDietary = {
  dietaryPreference: DietaryPreference;
};

type RegistrationContextType = {
  account: PendingAccount | null;
  profile: PendingProfileDetails | null;
  activity: PendingActivity | null;
  dietary: PendingDietary | null;
  onboardingInProgress: boolean;
  setAccount: (next: PendingAccount) => void;
  setProfile: (next: PendingProfileDetails) => void;
  setActivity: (next: PendingActivity) => void;
  setDietary: (next: PendingDietary) => void;
  setOnboardingInProgress: (next: boolean) => void;
  reset: () => void;
};

const RegistrationContext = createContext<RegistrationContextType | undefined>(undefined);

export function RegistrationProvider({ children }: { children: React.ReactNode }) {
  const [account, setAccountState] = useState<PendingAccount | null>(null);
  const [profile, setProfileState] = useState<PendingProfileDetails | null>(null);
  const [activity, setActivityState] = useState<PendingActivity | null>(null);
  const [dietary, setDietaryState] = useState<PendingDietary | null>(null);
  const [onboardingInProgress, setOnboardingInProgressState] = useState(() => isOnboardingGate());

  const setOnboardingInProgress = (next: boolean) => {
    setOnboardingGate(next);
    setOnboardingInProgressState(next);
  };

  const value = useMemo<RegistrationContextType>(
    () => ({
      account,
      profile,
      activity,
      dietary,
      onboardingInProgress,
      setAccount: (next) => setAccountState(next),
      setProfile: (next) => setProfileState(next),
      setActivity: (next) => setActivityState(next),
      setDietary: (next) => setDietaryState(next),
      setOnboardingInProgress,
      reset: () => {
        setOnboardingGate(false);
        setAccountState(null);
        setProfileState(null);
        setActivityState(null);
        setDietaryState(null);
        setOnboardingInProgressState(false);
      },
    }),
    [account, activity, dietary, onboardingInProgress, profile]
  );

  return <RegistrationContext.Provider value={value}>{children}</RegistrationContext.Provider>;
}

export function useRegistration() {
  const ctx = useContext(RegistrationContext);
  if (!ctx) throw new Error("useRegistration must be used within RegistrationProvider");
  return ctx;
}
