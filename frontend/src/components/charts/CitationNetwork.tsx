"use client";

import { useEffect, useRef } from "react";
import * as d3 from "d3";
import { SOURCE_COLORS } from "@/lib/utils";
import type { Paper } from "@/lib/types";

interface CitationNetworkProps {
  papers: Paper[];
}

interface Node extends d3.SimulationNodeDatum {
  id: number;
  title: string;
  source: string;
  citations: number;
  topics: string[];
}

export default function CitationNetwork({ papers }: CitationNetworkProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || papers.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;

    // Create nodes from papers
    const nodes: Node[] = papers.map((p) => ({
      id: p.id,
      title: p.title.length > 50 ? p.title.slice(0, 50) + "..." : p.title,
      source: p.sources[0] || "unknown",
      citations: p.citation_count,
      topics: p.topics,
    }));

    // Create links based on shared topics (co-topic network)
    const links: { source: number; target: number }[] = [];
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const shared = nodes[i].topics.filter((t) => nodes[j].topics.includes(t));
        if (shared.length > 0) {
          links.push({ source: nodes[i].id, target: nodes[j].id });
        }
      }
    }

    const simulation = d3
      .forceSimulation(nodes)
      .force(
        "link",
        d3
          .forceLink(links)
          .id((d: any) => d.id)
          .distance(80)
      )
      .force("charge", d3.forceManyBody().strength(-120))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius(25));

    // Links
    const link = svg
      .append("g")
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke", "var(--border)")
      .attr("stroke-opacity", 0.4)
      .attr("stroke-width", 1);

    // Nodes
    const node = svg
      .append("g")
      .selectAll("circle")
      .data(nodes)
      .join("circle")
      .attr("r", (d) => Math.max(6, Math.min(20, 6 + d.citations * 0.5)))
      .attr("fill", (d) => SOURCE_COLORS[d.source] || "#6b7280")
      .attr("stroke", "var(--background)")
      .attr("stroke-width", 1.5)
      .attr("cursor", "pointer")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .call(
        d3
          .drag<any, Node>()
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

    // Tooltips
    const tooltip = d3
      .select("body")
      .append("div")
      .style("position", "absolute")
      .style("background", "var(--card)")
      .style("border", "1px solid var(--border)")
      .style("border-radius", "8px")
      .style("padding", "8px 12px")
      .style("font-size", "11px")
      .style("color", "var(--foreground)")
      .style("pointer-events", "none")
      .style("opacity", 0)
      .style("z-index", "1000")
      .style("max-width", "300px");

    node
      .on("mouseover", (event, d) => {
        tooltip
          .style("opacity", 1)
          .html(`<strong>${d.title}</strong><br/>Citations: ${d.citations}<br/>Source: ${d.source}`)
          .style("left", event.pageX + 12 + "px")
          .style("top", event.pageY - 12 + "px");
      })
      .on("mouseout", () => tooltip.style("opacity", 0));

    // Labels for high-citation papers
    const label = svg
      .append("g")
      .selectAll("text")
      .data(nodes.filter((n) => n.citations > 5))
      .join("text")
      .text((d) => d.title.slice(0, 25) + "...")
      .attr("font-size", 9)
      .attr("fill", "var(--muted-foreground)")
      .attr("dx", 15)
      .attr("dy", 4);

    simulation.on("tick", () => {
      link
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);

      node.attr("cx", (d) => d.x!).attr("cy", (d) => d.y!);
      label.attr("x", (d) => d.x!).attr("y", (d) => d.y!);
    });

    return () => {
      simulation.stop();
      tooltip.remove();
    };
  }, [papers]);

  return <svg ref={svgRef} className="w-full h-full" />;
}
