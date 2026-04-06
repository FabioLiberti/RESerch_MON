"use client";

import { useEffect, useRef } from "react";
import * as d3 from "d3";
import { SOURCE_COLORS } from "@/lib/utils";

interface NetworkNode extends d3.SimulationNodeDatum {
  id: number;
  title: string;
  source: string;
  citations: number;
  doi: string | null;
}

interface NetworkLink {
  source: number;
  target: number;
  weight: number;
  shared: string[];
}

interface NetworkGraphProps {
  nodes: NetworkNode[];
  links: NetworkLink[];
  type: "co-keywords" | "co-authors" | "citations";
  onNodeClick?: (id: number) => void;
}

export default function NetworkGraph({ nodes, links, type, onNodeClick }: NetworkGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;

    // Zoom container
    const g = svg.append("g");

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 4])
      .on("zoom", (event) => g.attr("transform", event.transform));

    svg.call(zoom);

    // Deep clone nodes/links so D3 can mutate them
    const simNodes: NetworkNode[] = nodes.map((n) => ({ ...n }));
    const simLinks = links.map((l) => ({ ...l }));

    const maxWeight = Math.max(1, ...simLinks.map((l) => l.weight));

    const simulation = d3
      .forceSimulation(simNodes)
      .force(
        "link",
        d3
          .forceLink(simLinks)
          .id((d: any) => d.id)
          .distance((d: any) => Math.max(40, 100 - d.weight * 10))
      )
      .force("charge", d3.forceManyBody().strength(-150))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius(20));

    // Links
    const link = g
      .append("g")
      .selectAll("line")
      .data(simLinks)
      .join("line")
      .attr("stroke", "var(--border)")
      .attr("stroke-opacity", (d: any) => 0.2 + (d.weight / maxWeight) * 0.6)
      .attr("stroke-width", (d: any) => Math.max(1, Math.min(5, d.weight)));

    // Nodes
    const node = g
      .append("g")
      .selectAll("circle")
      .data(simNodes)
      .join("circle")
      .attr("r", (d) => Math.max(5, Math.min(22, 5 + (d.citations || 0) * 0.4)))
      .attr("fill", (d) => SOURCE_COLORS[d.source] || "#6b7280")
      .attr("stroke", "var(--background)")
      .attr("stroke-width", 1.5)
      .attr("cursor", "pointer")
      .call(
        d3
          .drag<any, NetworkNode>()
          .on("start", (event: any, d: any) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on("drag", (event: any, d: any) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on("end", (event: any, d: any) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          })
      );

    // Click to navigate
    if (onNodeClick) {
      node.on("click", (_event, d) => onNodeClick(d.id));
    }

    // Tooltip
    const tooltip = d3
      .select("body")
      .append("div")
      .style("position", "absolute")
      .style("background", "var(--card)")
      .style("border", "1px solid var(--border)")
      .style("border-radius", "8px")
      .style("padding", "10px 14px")
      .style("font-size", "11px")
      .style("color", "var(--foreground)")
      .style("pointer-events", "none")
      .style("opacity", 0)
      .style("z-index", "1000")
      .style("max-width", "320px")
      .style("box-shadow", "0 4px 12px rgba(0,0,0,0.3)");

    node
      .on("mouseover", (event, d) => {
        // Find connected links
        const connected = simLinks.filter(
          (l: any) => l.source.id === d.id || l.target.id === d.id
        );
        const sharedInfo = connected
          .slice(0, 3)
          .map((l) => l.shared.join(", "))
          .filter(Boolean);

        let html = `<strong>${d.title}</strong><br/>`;
        html += `<span style="color:${SOURCE_COLORS[d.source] || "#6b7280"}">${d.source}</span>`;
        html += ` &middot; ${d.citations} citations`;
        if (connected.length > 0) {
          html += `<br/><span style="color:var(--muted-foreground)">${connected.length} connections</span>`;
          if (sharedInfo.length > 0) {
            const label = type === "co-authors" ? "Authors" : "Keywords";
            html += `<br/><span style="color:var(--muted-foreground)">${label}: ${sharedInfo.join("; ")}</span>`;
          }
        }

        tooltip
          .style("opacity", 1)
          .html(html)
          .style("left", event.pageX + 14 + "px")
          .style("top", event.pageY - 14 + "px");

        // Highlight connected nodes
        node.attr("opacity", (n: any) => {
          if (n.id === d.id) return 1;
          const isConnected = connected.some(
            (l: any) => l.source.id === n.id || l.target.id === n.id
          );
          return isConnected ? 1 : 0.15;
        });
        link.attr("opacity", (l: any) =>
          l.source.id === d.id || l.target.id === d.id ? 1 : 0.05
        );
      })
      .on("mouseout", () => {
        tooltip.style("opacity", 0);
        node.attr("opacity", 1);
        link.attr("opacity", (d: any) => 0.2 + (d.weight / maxWeight) * 0.6);
      });

    // Labels for high-citation papers
    g.append("g")
      .selectAll("text")
      .data(simNodes.filter((n) => n.citations > 5))
      .join("text")
      .text((d) => d.title.slice(0, 30) + (d.title.length > 30 ? "..." : ""))
      .attr("font-size", 8)
      .attr("fill", "var(--muted-foreground)")
      .attr("dx", 14)
      .attr("dy", 4)
      .attr("pointer-events", "none");

    simulation.on("tick", () => {
      link
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);

      node.attr("cx", (d) => d.x!).attr("cy", (d) => d.y!);

      g.selectAll("text")
        .attr("x", (d: any) => d.x)
        .attr("y", (d: any) => d.y);
    });

    return () => {
      simulation.stop();
      tooltip.remove();
    };
  }, [nodes, links, type, onNodeClick]);

  return <svg ref={svgRef} className="w-full h-full" />;
}
