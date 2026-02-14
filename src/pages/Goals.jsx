import GoalManager from "../components/GoalManager";
import { useAuth } from "../hooks/useAuth";

export default function GoalsPage() {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <div className="page-section">
      <GoalManager userId={user.id} />
    </div>
  );
}
