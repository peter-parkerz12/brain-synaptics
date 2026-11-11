import { createFileRoute } from "@tanstack/react-router";
import { Simulator } from "@/components/simulator/Simulator.jsx";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Neuroplasticity Simulator | Dynamic Weighted Graph Model" },
      { name: "description", content: "Explore a reproducible synthetic neural-network graph model with interactive damage, graph algorithms, and activity-dependent plasticity." },
      { property: "og:title", content: "Neuroplasticity Simulator" },
      { property: "og:description", content: "An interactive computational model of neural network reorganisation through graph theory." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Index() {
  return <Simulator />;
}