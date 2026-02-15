import { createContext, useCallback, useContext, useMemo, useState } from "react";

const OnboardingContext = createContext(null);

export function OnboardingProvider({ children }) {
  const [data, setData] = useState({
    becoming: "",
    focus: "",
    commitment: "",
    age: "",
    location: "",
  });

  const update = useCallback((field, value) => {
    setData((prev) => ({ ...prev, [field]: value }));
  }, []);

  const reset = useCallback(() => {
    setData({ becoming: "", focus: "", commitment: "", age: "", location: "" });
  }, []);

  const value = useMemo(() => ({ data, update, reset }), [data, update, reset]);

  return (
    <OnboardingContext.Provider value={value}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error("useOnboarding must be used inside OnboardingProvider");
  return ctx;
}
