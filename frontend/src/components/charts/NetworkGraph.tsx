"use client";

import { useEffect, useRef } from "react";
import * as d3 from "d3";
import { SOURCE_COLORS } from "@/lib/utils";

interface NetworkNode extends d3.SimulationNodeDatum {
  id: number | string;
  paper_id?: number | null;
  title: string;
  source: string;
  citations: number;
  doi: string | null;
  in_db?: boolean;
  is_center?: boolean;
}

interface NetworkLink {
  source: number | string;
  target: number | string;
  weight?: number;
  shared?: string[];
  type?: string;
}

interface NetworkGraphProps {
  nodes: NetworkNode[];
  links: NetworkLink[];
  type: "co-keywords" | "co-authors" | "citations";
  onNodeClick?: (id: number) => void;
  onImport?: (doi: string) => void;
}

export default function NetworkGraph({ nodes, links, type, onNodeClick, onImport }: NetworkGraphProps) {
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

    const maxWeight = Math.max(1, ...simLinks.map((l) => l.weight || 1));
    const isCitations = type === "citations";

    const simulation = d3
      .forceSimulation(simNodes)
      .force(
        "link",
        d3
          .forceLink(simLinks)
          .id((d: any) => d.id)
          .distance((d: any) => Math.max(40, 100 - (d.weight || 1) * 10))
      )
      .force("charge", d3.forceManyBody().strength(isCitations ? -80 : -150))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius(isCitations ? 12 : 20));

    // Arrow markers for citation direction
    if (isCitations) {
      const defs = g.append("defs");
      defs.append("marker")
        .attr("id", "arrow-cites")
        .attr("viewBox", "0 -5 10 10").attr("refX", 15).attr("refY", 0)
        .attr("markerWidth", 6).attr("markerHeight", 6).attr("orient", "auto")
        .append("path").attr("d", "M0,-5L10,0L0,5").attr("fill", "#6366f1");
      defs.append("marker")
        .attr("id", "arrow-cited")
        .attr("viewBox", "0 -5 10 10").attr("refX", 15).attr("refY", 0)
        .attr("markerWidth", 6).attr("markerHeight", 6).attr("orient", "auto")
        .append("path").attr("d", "M0,-5L10,0L0,5").attr("fill", "#22c55e");
    }

    // Links
    const link = g
      .append("g")
      .selectAll("line")
      .data(simLinks)
      .join("line")
      .attr("stroke", (d: any) => {
        if (!isCitations) return "var(--border)";
        return d.type === "cites" ? "#6366f180" : "#22c55e80";
      })
      .attr("stroke-opacity", (d: any) => isCitations ? 0.5 : 0.2 + ((d.weight || 1) / maxWeight) * 0.6)
      .attr("stroke-width", (d: any) => isCitations ? 1 : Math.max(1, Math.min(5, d.weight || 1)))
      .attr("marker-end", (d: any) => isCitations ? "url(#arrow-cites)" : null);

    // Nodes
    const node = g
      .append("g")
      .selectAll("circle")
      .data(simNodes)
      .join("circle")
      .attr("r", (d) => {
        if (isCitations && (d as any).is_center) return 18;
        if (isCitations && !(d as any).in_db) return 4;
        if (isCitations && (d as any).in_db) return 8;
        return Math.max(5, Math.min(22, 5 + (d.citations || 0) * 0.4));
      })
      .attr("fill", (d) => {
        if (isCitations && !(d as any).in_db) return "#4b5563"; // gray for external
        if (isCitations && (d as any).is_center) return "#f59e0b"; // amber for center
        return SOURCE_COLORS[d.source] || "#6b7280";
      })
      .attr("stroke", (d) => {
        if (isCitations && (d as any).in_db && !(d as any).is_center) return "#22c55e"; // green ring for in_db
        return "var(--background)";
      })
      .attr("stroke-width", (d) => (isCitations && (d as any).in_db && !(d as any).is_center) ? 2.5 : 1.5)
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

    // Click to navigate or expand
    if (onNodeClick) {
      node.on("click", (_event, d) => {
        const pid = (d as any).paper_id;
        if (pid && typeof pid === "number" && pid > 0) {
          onNodeClick(pid);
        } else if (typeof d.id === "number") {
          onNodeClick(d.id as number);
        }
      });
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
      .style("pointer-events", "auto")
      .style("opacity", 0)
      .style("z-index", "1000")
      .style("max-width", "320px")
      .style("box-shadow", "0 4px 12px rgba(0,0,0,0.3)")
      .style("user-select", "text")
      .on("mouseleave", () => tooltip.style("opacity", 0));

    node
      .on("mouseover", (event, d) => {
        // Find connected links
        const connected = simLinks.filter(
          (l: any) => l.source.id === d.id || l.target.id === d.id
        );
        const sharedInfo = connected
          .slice(0, 3)
          .map((l) => (l.shared || []).join(", "))
          .filter(Boolean);

        let html = `<strong>${d.title}</strong><br/>`;
        const inDb = (d as any).in_db;
        const isCenter = (d as any).is_center;
        if (isCitations) {
          const paperId = (d as any).paper_id;
          html += inDb
            ? `<span style="color:#22c55e">● In database</span>`
            : `<span style="color:#6b7280">○ External</span>`;
          if (isCenter) html += ` <span style="color:#f59e0b">★ Center</span>`;
          html += ` &middot; ${d.citations} citations`;
          if (inDb && paperId) html += `<br/><a href="/papers/${paperId}" style="color:#22c55e;font-size:10px">Open paper detail</a>`;
          if (d.doi) html += `${inDb ? ' &middot; ' : '<br/>'}<a href="https://doi.org/${d.doi}" target="_blank" style="color:#6366f1;font-size:10px">${d.doi}</a>`;
          html += `<br/><span style="color:var(--muted-foreground)">${connected.length} links</span>`;
        } else {
          html += `<span style="color:${SOURCE_COLORS[d.source] || "#6b7280"}">${d.source}</span>`;
          html += ` &middot; ${d.citations} citations`;
          if (connected.length > 0) {
            html += `<br/><span style="color:var(--muted-foreground)">${connected.length} connections</span>`;
            if (sharedInfo.length > 0) {
              const label = type === "co-authors" ? "Authors" : "Keywords";
              html += `<br/><span style="color:var(--muted-foreground)">${label}: ${sharedInfo.join("; ")}</span>`;
            }
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
        // Delay hide so user can hover tooltip to click links
        setTimeout(() => {
          const el = tooltip.node();
          if (el && !el.matches(":hover")) {
            tooltip.style("opacity", 0);
          }
        }, 300);
        node.attr("opacity", 1);
        link.attr("opacity", (d: any) => 0.2 + ((d.weight || 1) / maxWeight) * 0.6);
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
