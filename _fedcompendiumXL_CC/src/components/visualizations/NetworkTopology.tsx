import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { Box, useColorModeValue } from '@chakra-ui/react';
import { motion } from 'framer-motion';

interface Node extends d3.SimulationNodeDatum {
  id: string;
  type: 'server' | 'client';
  group?: number;
  size?: number;
  active?: boolean;
}

interface Link extends d3.SimulationLinkDatum<Node> {
  source: string | Node;
  target: string | Node;
  strength?: number;
  active?: boolean;
}

interface NetworkTopologyProps {
  numClients: number;
  distribution: 'iid' | 'non_iid_label' | 'non_iid_quantity';
  isActive: boolean;
  width?: number;
  height?: number;
  onNodeClick?: (nodeId: string) => void;
}

export const NetworkTopology: React.FC<NetworkTopologyProps> = ({
  numClients = 10,
  distribution = 'iid',
  isActive = false,
  width = 600,
  height = 300,
  onNodeClick
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [links, setLinks] = useState<Link[]>([]);
  const [simulationStep, setSimulationStep] = useState<number>(0);
  
  // Color modes for light/dark theme - definite FUORI dai callback
  const nodeColorServer = useColorModeValue('#3182CE', '#63B3ED');
  const nodeColorClientPrimary = useColorModeValue('#38A169', '#68D391');
  const nodeColorClientSecondary = useColorModeValue('#DD6B20', '#F6AD55');
  const nodeColorClientInactive = useColorModeValue('#A0AEC0', '#4A5568');
  const linkColorActive = useColorModeValue('rgba(66, 153, 225, 0.6)', 'rgba(99, 179, 237, 0.6)');
  const linkColorInactive = useColorModeValue('rgba(160, 174, 192, 0.3)', 'rgba(74, 85, 104, 0.3)');
  const backgroundColor = useColorModeValue('transparent', 'transparent');
  const nodeStrokeColor = useColorModeValue('#ffffff', '#1A202C');
  const labelColor = useColorModeValue('#2D3748', '#CBD5E0');
  
  // Generazione dei dati della topologia
  useEffect(() => {
    generateNetworkData();
  }, [numClients, distribution]);
  
  const generateNetworkData = () => {
    // Creazione del server centrale
    const newNodes: Node[] = [{ id: 'server', type: 'server', size: 20 }];
    const newLinks: Link[] = [];
    
    // Creazione dei client
    for (let i = 0; i < numClients; i++) {
      let group = 0;
      
      // Assegnazione gruppi in base alla distribuzione
      if (distribution === 'non_iid_label') {
        // Divisione in 3 gruppi per non_iid_label
        group = i % 3;
      } else if (distribution === 'non_iid_quantity') {
        // Divisione in 2 gruppi per non_iid_quantity (grande/piccolo)
        group = i < numClients / 3 ? 0 : 1;
      }
      
      // Dimensioni diverse per simulare quantità dati
      let size = 6;
      if (distribution === 'non_iid_quantity') {
        // Client con più o meno dati
        size = i < numClients / 3 ? 10 : 5;
      }
      
      newNodes.push({ 
        id: `client-${i}`, 
        type: 'client', 
        group, 
        size,
        active: Math.random() > 0.2 // Alcuni client potrebbero essere inattivi
      });
      
      // Collegamento al server
      newLinks.push({ 
        source: `client-${i}`, 
        target: 'server',
        strength: distribution === 'non_iid_quantity' ? (i < numClients / 3 ? 0.8 : 0.4) : 0.6,
        active: Math.random() > 0.3
      });
    }
    
    // Aggiunta di alcuni collegamenti tra client per simulare reti P2P
    // solo se ci sono abbastanza client
    if (numClients > 5) {
      for (let i = 0; i < numClients / 2; i++) {
        const source = Math.floor(Math.random() * numClients);
        let target = Math.floor(Math.random() * numClients);
        
        // Evita auto-collegamenti
        while (target === source) {
          target = Math.floor(Math.random() * numClients);
        }
        
        newLinks.push({
          source: `client-${source}`,
          target: `client-${target}`,
          strength: 0.3,
          active: Math.random() > 0.5
        });
      }
    }
    
    setNodes(newNodes);
    setLinks(newLinks);
  };
  
  // Aggiornamento della simulazione
  useEffect(() => {
    if (!isActive) return;
    
    const timer = setInterval(() => {
      setSimulationStep(prev => (prev + 1) % 4);
      
      // Aggiorna lo stato dei link e dei nodi
      setLinks(prev => prev.map(link => ({
        ...link,
        active: Math.random() > 0.3
      })));
      
      setNodes(prev => prev.map(node => {
        if (node.type === 'server') return node;
        return {
          ...node,
          active: Math.random() > 0.2
        };
      }));
    }, 2000);
    
    return () => clearInterval(timer);
  }, [isActive]);
  
  // Rendering della visualizzazione con D3
  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return;
    
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove(); // Pulisce il grafico
    
    const container = svg.append("g");
    
    // Zoom e pan
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.5, 2])
      .on("zoom", (event) => {
        container.attr("transform", event.transform.toString());
      });
    
    svg.call(zoom);
    
    // Creazione dei link
    const link = container.append("g")
      .selectAll("line")
      .data(links)
      .enter()
      .append("line")
      .attr("stroke", d => d.active ? linkColorActive : linkColorInactive)
      .attr("stroke-width", d => d.strength ? d.strength * 3 : 1.5)
      .attr("stroke-dasharray", d => {
        const source = typeof d.source === 'string' ? d.source : d.source.id;
        const target = typeof d.target === 'string' ? d.target : d.target.id;
        return (source === 'server' || target === 'server') ? "0" : "5,5";
      });
    
    // Creazione dei nodi
    const node = container.append("g")
      .selectAll("circle")
      .data(nodes)
      .enter()
      .append("circle")
      .attr("r", d => d.size || 7)
      .attr("fill", d => {
        if (!d.active) return nodeColorClientInactive;
        if (d.type === 'server') return nodeColorServer;
        if (d.group === 0) return nodeColorClientPrimary;
        return nodeColorClientSecondary;
      })
      .attr("stroke", nodeStrokeColor) // Usa la variabile precompilata
      .attr("stroke-width", 1.5)
      .style("cursor", "pointer")
      .on("click", (event, d) => {
        if (onNodeClick) onNodeClick(d.id);
      });
    
    // Animazione delle comunicazioni
    const animateParticles = () => {
      container.selectAll(".message-particle").remove();
      
      container.selectAll(".message-particle")
        .data(links.filter(l => l.active))
        .enter()
        .append("circle")
        .attr("class", "message-particle")
        .attr("r", 2)
        .attr("fill", nodeColorServer)
        .each(function(d) {
          const direction = simulationStep % 2 === 0;
          const source = typeof d.source === 'string' 
            ? nodes.find(n => n.id === d.source) 
            : d.source as Node;
          const target = typeof d.target === 'string' 
            ? nodes.find(n => n.id === d.target) 
            : d.target as Node;
          
          if (source && target && source.x !== undefined && source.y !== undefined &&
              target.x !== undefined && target.y !== undefined) {
            const startNode = direction ? source : target;
            const endNode = direction ? target : source;
            
            d3.select(this)
              .attr("cx", startNode.x || 0) // Aggiungi || 0 per evitare undefined
              .attr("cy", startNode.y || 0)
              .transition()
              .duration(1500)
              .attr("cx", endNode.x || 0)
              .attr("cy", endNode.y || 0)
              .remove();
          }
        });
    };
    
    // Labels
    container.append("g")
      .selectAll("text")
      .data(nodes)
      .enter()
      .append("text")
      .text(d => d.type === 'server' ? "Server" : "")
      .attr("x", d => (d.x || 0) + 15)
      .attr("y", d => (d.y || 0) + 5)
      .attr("font-size", "10px")
      .attr("fill", labelColor); // Usa la variabile precompilata
    
    // Forza di simulazione
    const simulation = d3.forceSimulation<Node>(nodes)
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("charge", d3.forceManyBody().strength(-100))
      .force("link", d3.forceLink<Node, Link>()
        .id(d => d.id)
        .links(links)
        .distance(d => {
          const source = typeof d.source === 'string' ? d.source : d.source.id;
          const target = typeof d.target === 'string' ? d.target : d.target.id;
          return (source === 'server' || target === 'server') ? 100 : 50;
        })
      )
      // Fix the type issue with the forceCollide force
      .force("collide", d3.forceCollide().radius(function(d) {
        // Use a function approach that correctly casts the type
        return ((d as Node).size || 7) + 2;
      }));
    
    // Aggiornamento delle posizioni in base alla simulazione
    simulation.on("tick", () => {
      link
        .attr("x1", d => {
          const source = typeof d.source === 'object' ? d.source : nodes.find(n => n.id === d.source);
          return source?.x || 0;
        })
        .attr("y1", d => {
          const source = typeof d.source === 'object' ? d.source : nodes.find(n => n.id === d.source);
          return source?.y || 0;
        })
        .attr("x2", d => {
          const target = typeof d.target === 'object' ? d.target : nodes.find(n => n.id === d.target);
          return target?.x || 0;
        })
        .attr("y2", d => {
          const target = typeof d.target === 'object' ? d.target : nodes.find(n => n.id === d.target);
          return target?.y || 0;
        });
      
      node
        .attr("cx", d => {
          d.x = Math.max(d.size || 7, Math.min(width - (d.size || 7), d.x || 0));
          return d.x;
        })
        .attr("cy", d => {
          d.y = Math.max(d.size || 7, Math.min(height - (d.size || 7), d.y || 0));
          return d.y;
        });
      
      // Aggiorna le posizioni delle etichette
      container.selectAll("text")
        .attr("x", d => ((d as Node).x || 0) + ((d as Node).type === 'server' ? -15 : 10))
        .attr("y", d => ((d as Node).y || 0) + 5);
    });
    
    // Avvia l'animazione delle particelle dopo che la simulazione si è stabilizzata
    simulation.on("end", () => {
      if (isActive) {
        animateParticles();
        const particleInterval = setInterval(animateParticles, 2000);
        return () => clearInterval(particleInterval);
      }
    });
    
    return () => {
      simulation.stop();
    };
  }, [nodes, links, simulationStep, width, height, nodeColorServer, nodeColorClientPrimary, 
      nodeColorClientSecondary, nodeColorClientInactive, linkColorActive, linkColorInactive, 
      isActive, nodeStrokeColor, labelColor]); // Aggiungi le nuove dipendenze
  
  return (
    <Box 
      position="relative" 
      width={width} 
      height={height} 
      backgroundColor={backgroundColor}
      borderRadius="md"
      overflow="hidden"
    >
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        <svg ref={svgRef} width="100%" height="100%"></svg>
      </motion.div>
    </Box>
  );
};

export default NetworkTopology;