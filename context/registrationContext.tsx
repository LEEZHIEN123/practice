import React, { createContext, useContext, useMemo, useState } from "react";

type Gender = "male" | "female";
type ActivityKey = "sedentary" | "light" | "moderate" | "very_active" | "extra_active";

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

type RegistrationContextType = {
  account: PendingAccount | null;
  profile: PendingProfileDetails | null;
  activity: PendingActivity | null;
  setAccount: (next: PendingAccount) => void;
  setProfile: (next: PendingProfileDetails) => void;
  setActivity: (next: PendingActivity) => void;
  reset: () => void;
};

const RegistrationContext = createContext<RegistrationContextType | undefined>(undefined);

export function RegistrationProvider({ children }: { children: React.ReactNode }) {
  const [account, setAccountState] = useState<PendingAccount | null>(null);
  const [profile, setProfileState] = useState<PendingProfileDetails | null>(null);
  const [activity, setActivityState] = useState<PendingActivity | null>(null);

  const value = useMemo<RegistrationContextType>(
    () => ({
      account,
      profile,
      activity,
      setAccount: (next) => setAccountState(next),
      setProfile: (next) => setProfileState(next),
      setActivity: (next) => setActivityState(next),
      reset: () => {
        setAccountState(null);
        setProfileState(null);
        setActivityState(null);
      },
    }),
    [account, activity, profile]
  );

  return <RegistrationContext.Provider value={value}>{children}</RegistrationContext.Provider>;
}

export function useRegistration() {
  const ctx = useContext(RegistrationContext);
  if (!ctx) throw new Error("useRegistration must be used within RegistrationProvider");
  return ctx;
}

