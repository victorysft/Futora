import { Outlet } from "react-router-dom";
import AppLayout from "../components/AppLayout";

export default function AppShell() {
  return (
    <AppLayout>
      <Outlet />
    </AppLayout>
  );
}
