import { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabaseClient";
import {
  getToday,
  canCheckIn,
  shouldResetStreak,
  calculateNewStreak,
} from "./utils/streak";
import * as store from "./utils/storage";
import Auth from "./components/Auth";
import GoalSetup from "./components/GoalSetup";
import Dashboard from "./components/Dashboard";
import "./App.css";

function App() {
  const [session, setSession] = useState(undefined);
  const [goal, setGoal] = useState("");
  const [streak, setStreak] = useState(0);
  const [lastCheckIn, setLastCheckIn] = useState(null);
  const [checkedInToday, setCheckedInToday] = useState(false);

  // Auth listener
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => setSession(s));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  const sync = useCallback(() => {
    const g = store.getGoal();
    const s = store.getStreak();
    const lci = store.getLastCheckIn();
    const today = getToday();

    let resolved = s;
    if (shouldResetStreak(lci)) {
      resolved = 0;
      store.setStreak(0);
    }

    setGoal(g);
    setStreak(resolved);
    setLastCheckIn(lci);
    setCheckedInToday(lci === today);
  }, []);

  useEffect(() => { sync(); }, [sync]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") sync();
    };
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [sync]);

  const handleCommit = useCallback((newGoal) => {
    store.setGoal(newGoal);
    store.setStreak(0);
    store.setLastCheckIn(null);
    setGoal(newGoal);
    setStreak(0);
    setLastCheckIn(null);
    setCheckedInToday(false);
  }, []);

  const handleCheckIn = useCallback(() => {
    if (!canCheckIn(lastCheckIn)) return;

    const today = getToday();
    const next = calculateNewStreak(streak, lastCheckIn);

    store.setStreak(next);
    store.setLastCheckIn(today);
    setStreak(next);
    setLastCheckIn(today);
    setCheckedInToday(true);
  }, [streak, lastCheckIn]);

  const handleReset = useCallback(() => {
    store.clearAll();
    setGoal("");
    setStreak(0);
    setLastCheckIn(null);
    setCheckedInToday(false);
  }, []);

  const handleSignOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  // Loading state while checking session
  if (session === undefined) {
    return (
      <div className="app">
        <header className="header">
          <h1 className="logo">FUTORA</h1>
        </header>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="header">
        <h1 className="logo">FUTORA</h1>
        <p className="tagline">Your future is built by what you do today.</p>
      </header>

      <main className="main">
        {!session ? (
          <Auth />
        ) : !goal ? (
          <GoalSetup onCommit={handleCommit} />
        ) : (
          <Dashboard
            goal={goal}
            streak={streak}
            lastCheckIn={lastCheckIn}
            checkedInToday={checkedInToday}
            onCheckIn={handleCheckIn}
            onReset={handleReset}
          />
        )}
      </main>

      <footer className="footer">
        {session ? (
          <button className="btn-signout" onClick={handleSignOut}>
            Sign out
          </button>
        ) : (
          <p>You are what you repeatedly do.</p>
        )}
      </footer>
    </div>
  );
}

export default App;
