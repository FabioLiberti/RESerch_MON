// File: src/components/visualizations/NetworkTopology3D.tsx
import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer';
import { SimulationConfig, ClientModel, NetworkTopology } from '../../types/simulation';

interface NetworkTopology3DProps {
  config: SimulationConfig;
  clients?: ClientModel[];
  activeClients?: string[];
  onClientClick?: (clientId: string) => void;
  width?: number;
  height?: number;
}

/**
 * Visualizzazione 3D interattiva della topologia di rete
 * Implementa una rappresentazione scientificamente accurata con:
 * - Visualizzazione delle connessioni di rete
 * - Indicazione della qualità della connessione
 * - Animazione dei trasferimenti di dati
 * - Stato attivo/inattivo dei client
 */
const NetworkTopology3D: React.FC<NetworkTopology3DProps> = ({
  config,
  clients = [],
  activeClients = [],
  onClientClick,
  width = 800,
  height = 600
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const labelRendererRef = useRef<CSS2DRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const frameIdRef = useRef<number>(0);
  
  const [hoveredClient, setHoveredClient] = useState<string | null>(null);
  
  // Inizializza la scena 3D
  useEffect(() => {
    if (!containerRef.current) return;
    
    // Creazione della scena
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);
    sceneRef.current = scene;
    
    // Creazione della camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 20, 40);
    cameraRef.current = camera;
    
    // Creazione del renderer WebGL
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;
    
    // Creazione del renderer per le etichette
    const labelRenderer = new CSS2DRenderer();
    labelRenderer.setSize(width, height);
    labelRenderer.domElement.style.position = 'absolute';
    labelRenderer.domElement.style.top = '0';
    labelRenderer.domElement.style.pointerEvents = 'none';
    containerRef.current.appendChild(labelRenderer.domElement);
    labelRendererRef.current = labelRenderer;
    
    // Aggiunta dei controlli orbitali
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controlsRef.current = controls;
    
    // Aggiunta dell'illuminazione
    const ambientLight = new THREE.AmbientLight(0xcccccc, 0.5);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(0, 20, 10);
    scene.add(directionalLight);
    
    // Aggiunta di un piano di base
    const gridHelper = new THREE.GridHelper(50, 50, 0x555555, 0x888888);
    scene.add(gridHelper);
    
    // Funzione di animazione
    const animate = () => {
      frameIdRef.current = requestAnimationFrame(animate);
      
      if (controlsRef.current) {
        controlsRef.current.update();
      }
      
      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
      
      if (labelRendererRef.current && sceneRef.current && cameraRef.current) {
        labelRendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    };
    
    animate();
    
    // Pulizia delle risorse
    return () => {
      cancelAnimationFrame(frameIdRef.current);
      
      if (rendererRef.current && containerRef.current) {
        containerRef.current.removeChild(rendererRef.current.domElement);
      }
      
      if (labelRendererRef.current && containerRef.current) {
        containerRef.current.removeChild(labelRendererRef.current.domElement);
      }
      
      // Rimuovi tutti gli oggetti dalla scena per evitare memory leak
      if (sceneRef.current) {
        sceneRef.current.clear();
      }
    };
  }, [width, height]);
  
  // Aggiorna la visualizzazione quando cambiano i client o la configurazione
  useEffect(() => {
    if (!sceneRef.current) return;
    
    // Rimuovi i nodi e le connessioni esistenti
    const scene = sceneRef.current;
    scene.children = scene.children.filter(child => 
      child instanceof THREE.GridHelper || 
      child instanceof THREE.AmbientLight || 
      child instanceof THREE.DirectionalLight
    );
    
    // Aggiungi il server centrale
    const serverGeometry = new THREE.SphereGeometry(2, 32, 32);
    const serverMaterial = new THREE.MeshPhongMaterial({ color: 0x2196f3 });
    const server = new THREE.Mesh(serverGeometry, serverMaterial);
    server.position.set(0, 2, 0);
    scene.add(server);
    
    // Crea un'etichetta per il server
    const serverDiv = document.createElement('div');
    serverDiv.className = 'label';
    serverDiv.textContent = 'Server Centrale';
    serverDiv.style.backgroundColor = 'rgba(33, 150, 243, 0.8)';
    serverDiv.style.color = 'white';
    serverDiv.style.padding = '2px 6px';
    serverDiv.style.borderRadius = '4px';
    serverDiv.style.fontSize = '12px';
    
    const serverLabel = new CSS2DObject(serverDiv);
    serverLabel.position.set(0, 4, 0);
    server.add(serverLabel);
    
    // Posiziona i client in base alla topologia di rete
    const clientObjects: { [id: string]: THREE.Mesh } = {};
    const radius = 15;
    
    clients.forEach((client, index) => {
      const angle = (index / clients.length) * Math.PI * 2;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      
      // La dimensione del client dipende dalla sua capacità computazionale
      const size = 0.5 + client.computationalCapability * 0.5;
      const clientGeometry = new THREE.BoxGeometry(size, size, size);
      
      // Il colore dipende dallo stato attivo/inattivo
      const isActive = activeClients.includes(client.id);
      const clientMaterial = new THREE.MeshPhongMaterial({ 
        color: isActive ? 0x4caf50 : 0x9e9e9e,
        emissive: isActive ? 0x2e7d32 : 0x000000,
        emissiveIntensity: isActive ? 0.3 : 0,
        transparent: !isActive,
        opacity: isActive ? 1.0 : 0.7,
        wireframe: false
      });
      
      const clientMesh = new THREE.Mesh(clientGeometry, clientMaterial);
      clientMesh.position.set(x, 2, z);
      clientMesh.userData = { id: client.id };
      scene.add(clientMesh);
      
      clientObjects[client.id] = clientMesh;
      
      // Crea un'etichetta per il client
      const clientDiv = document.createElement('div');
      clientDiv.className = 'label';
      clientDiv.textContent = client.id;
      clientDiv.style.backgroundColor = isActive ? 'rgba(76, 175, 80, 0.8)' : 'rgba(158, 158, 158, 0.8)';
      clientDiv.style.color = 'white';
      clientDiv.style.padding = '1px 4px';
      clientDiv.style.borderRadius = '3px';
      clientDiv.style.fontSize = '10px';
      
      const clientLabel = new CSS2DObject(clientDiv);
      clientLabel.position.set(0, size + 0.5, 0);
      clientMesh.add(clientLabel);
      
      // Crea una linea di connessione tra il client e il server
      const bandwidthQuality = Math.min(1, client.connectionQuality.bandwidth / 50);
      const latencyQuality = Math.min(1, 1 - client.connectionQuality.latency / 1000);
      const connectionQuality = (bandwidthQuality + latencyQuality) / 2;
      
      // La qualità della connessione determina lo spessore e il colore della linea
      const lineGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 2, 0),
        new THREE.Vector3(x, 2, z)
      ]);
      
      // Colore che varia dal rosso (peggiore) al verde (migliore)
      const connectionColor = new THREE.Color(
        1 - connectionQuality,
        connectionQuality,
        0
      );
      
      const lineMaterial = new THREE.LineBasicMaterial({ 
        color: connectionColor,
        linewidth: 1 + connectionQuality * 2,
        opacity: isActive ? 0.7 : 0.3,
        transparent: true
      });
      
      const line = new THREE.Line(lineGeometry, lineMaterial);
      scene.add(line);
      
      // Aggiunta di particelle animate per rappresentare il flusso di dati
      if (isActive) {
        addDataFlowParticles(scene, server.position, clientMesh.position, connectionQuality);
      }
    });
    
    // Gestione degli eventi di interazione
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    
    const onMouseMove = (event: MouseEvent) => {
      if (!containerRef.current || !cameraRef.current || !sceneRef.current) return;
      
      const rect = containerRef.current.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / height) * 2 + 1;
      
      raycaster.setFromCamera(mouse, cameraRef.current);
      const intersects = raycaster.intersectObjects(Object.values(clientObjects));
      
      if (intersects.length > 0) {
        const clientId = intersects[0].object.userData.id as string;
        setHoveredClient(clientId);
        document.body.style.cursor = 'pointer';
      } else {
        setHoveredClient(null);
        document.body.style.cursor = 'default';
      }
    };
    
    const onClick = (event: MouseEvent) => {
      if (!containerRef.current || !cameraRef.current || !sceneRef.current || !onClientClick) return;
      
      const rect = containerRef.current.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / height) * 2 + 1;
      
      raycaster.setFromCamera(mouse, cameraRef.current);
      const intersects = raycaster.intersectObjects(Object.values(clientObjects));
      
      if (intersects.length > 0) {
        const clientId = intersects[0].object.userData.id as string;
        onClientClick(clientId);
      }
    };
    
    containerRef.current?.addEventListener('mousemove', onMouseMove);
    containerRef.current?.addEventListener('click', onClick);
    
    return () => {
      containerRef.current?.removeEventListener('mousemove', onMouseMove);
      containerRef.current?.removeEventListener('click', onClick);
    };
  }, [clients, activeClients, width, height, onClientClick]);
  
  // Se il client è evidenziato, mostra un pannello informativo
  useEffect(() => {
    if (!hoveredClient || !sceneRef.current) return;
    
    const client = clients.find(c => c.id === hoveredClient);
    if (!client) return;
    
    // Crea un pannello informativo
    const infoPanel = document.createElement('div');
    infoPanel.className = 'info-panel';
    infoPanel.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    infoPanel.style.color = 'white';
    infoPanel.style.padding = '8px';
    infoPanel.style.borderRadius = '4px';
    infoPanel.style.fontSize = '12px';
    infoPanel.style.width = '200px';
    infoPanel.style.pointerEvents = 'none';
    
    // Popola il pannello con le informazioni sul client
    infoPanel.innerHTML = `
      <div style="font-weight: bold; margin-bottom: 5px;">${client.id}</div>
      <div>Capacità: ${client.computationalCapability.toFixed(1)}x</div>
      <div>Dati: ${client.dataDistribution.samples} campioni</div>
      <div>Banda: ${client.connectionQuality.bandwidth.toFixed(1)} Mbps</div>
      <div>Latenza: ${client.connectionQuality.latency} ms</div>
      <div>Pacchetti persi: ${(client.connectionQuality.dropProbability * 100).toFixed(1)}%</div>
    `;
    
    // Trova il mesh del client
    const clientMesh = Object.values(sceneRef.current.children).find(
      child => child instanceof THREE.Mesh && child.userData?.id === hoveredClient
    ) as THREE.Mesh | undefined;
    
    if (clientMesh) {
      // Aggiungi temporaneamente un effetto di evidenziazione
      const originalMaterial = clientMesh.material as THREE.MeshPhongMaterial;
      const highlightMaterial = originalMaterial.clone();
      highlightMaterial.emissive.set(0xffff00);
      highlightMaterial.emissiveIntensity = 0.5;
      clientMesh.material = highlightMaterial;
      
      // Ripristina il materiale originale quando il mouse esce
      return () => {
        clientMesh.material = originalMaterial;
      };
    }
  }, [hoveredClient, clients]);
  
  // Funzione per aggiungere particelle animate che rappresentano il flusso di dati
  const addDataFlowParticles = (
    scene: THREE.Scene, 
    from: THREE.Vector3, 
    to: THREE.Vector3, 
    quality: number
  ) => {
    const particleCount = Math.round(5 + quality * 10);
    const particleGeometry = new THREE.BufferGeometry();
    
    // Crea punti distribuiti uniformemente lungo la linea
    const positions = new Float32Array(particleCount * 3);
    const velocities: { x: number, y: number, z: number }[] = [];
    const directions: number[] = [];
    
    // Direzione dal server al client e viceversa
    const direction = new THREE.Vector3().subVectors(to, from).normalize();
    
    for (let i = 0; i < particleCount; i++) {
      // Posizione iniziale casuale lungo la linea
      const t = Math.random();
      const pos = new THREE.Vector3().lerpVectors(from, to, t);
      
      positions[i * 3] = pos.x;
      positions[i * 3 + 1] = pos.y;
      positions[i * 3 + 2] = pos.z;
      
      // Velocità basata sulla qualità della connessione
      const speed = 0.05 + quality * 0.15;
      velocities.push({ 
        x: direction.x * speed,
        y: direction.y * speed,
        z: direction.z * speed
      });
      
      // Alcune particelle vanno dal server al client, altre viceversa
      directions.push(Math.random() > 0.5 ? 1 : -1);
    }
    
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    
    // Materiale per le particelle
    const particleMaterial = new THREE.PointsMaterial({
      color: 0x00ffff,
      size: 0.3,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending
    });
    
    const particles = new THREE.Points(particleGeometry, particleMaterial);
    scene.add(particles);
    
    // Animazione delle particelle
    const animateParticles = () => {
      const positions = particles.geometry.attributes.position.array as Float32Array;
      
      for (let i = 0; i < particleCount; i++) {
        const dir = directions[i];
        const vel = velocities[i];
        
        positions[i * 3] += vel.x * dir;
        positions[i * 3 + 1] += vel.y * dir;
        positions[i * 3 + 2] += vel.z * dir;
        
        // Verifica se la particella ha superato i limiti
        const pos = new THREE.Vector3(
          positions[i * 3],
          positions[i * 3 + 1],
          positions[i * 3 + 2]
        );
        
        // Reset della posizione quando raggiunge l'estremità
        if (dir > 0 && pos.distanceTo(from) > from.distanceTo(to)) {
          // Reset alla posizione di partenza (server)
          const newPos = new THREE.Vector3().copy(from);
          positions[i * 3] = newPos.x;
          positions[i * 3 + 1] = newPos.y;
          positions[i * 3 + 2] = newPos.z;
        } else if (dir < 0 && pos.distanceTo(to) > from.distanceTo(to)) {
          // Reset alla posizione di partenza (client)
          const newPos = new THREE.Vector3().copy(to);
          positions[i * 3] = newPos.x;
          positions[i * 3 + 1] = newPos.y;
          positions[i * 3 + 2] = newPos.z;
        }
      }
      
      particles.geometry.attributes.position.needsUpdate = true;
    };
    
    // Aggiungi l'animazione al loop di rendering
    const animate = () => {
      animateParticles();
      requestAnimationFrame(animate);
    };
    
    animate();
  };
  
  return (
    <div 
      ref={containerRef} 
      style={{ 
        width: `${width}px`, 
        height: `${height}px`, 
        position: 'relative',
        overflow: 'hidden',
        borderRadius: '8px',
        boxShadow: '0 4px 8px rgba(0, 0, 0, 0.1)'
      }}
    />
  );
};

export default NetworkTopology3D;