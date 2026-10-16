import { createFileRoute, redirect } from "@tanstack/react-router";

// Endereço digitado sem o "t" final leva ao aplicativo do checklist.
export const Route = createFileRoute("/checklis")({
  beforeLoad: () => { throw redirect({ to: "/checklist" }); },
});
