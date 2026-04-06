// File: src/types/simulation.ts

/**
 * Tipi base già esistenti nel progetto
 */
export interface SimulationBase {
    id: string;
    name: string;
    createdAt: Date;
  }
  
  /**
   * Configurazione della simulazione
   */
  export interface SimulationConfig {
    // Parametri generali
    rounds: number;
    learningRate: number;
    localEpochs: number;
    batchSize: number;
    
    // Algoritmo di aggregazione
    aggregationAlgorithm: 'fedavg' | 'fedprox' | 'fednova' | 'scaffold';
    fedProxMu?: number; // Parametro μ per FedProx
    
    // Architettura del modello
    modelArchitecture: {
      type: 'linear' | 'cnn' | 'lstm' | 'transformer';
      layers: number;
      parameterCount: number;
      activationFunction: string;
    };
    
    // Topologia di rete
    networkTopology: NetworkTopology;
    
    // Strategia di selezione dei client
    clientSelectionStrategy: {
      type: 'random' | 'weighted' | 'fair';
      participationRate: number; // Percentuale di client selezionati per round
    };
    
    // Distribuzione dei dati
    dataDistribution: {
      type: 'iid' | 'non-iid';
      samplesPerClient: number;
      classCount: number;
      dirichletAlpha?: number; // Parametro per distribuzione non-IID
    };
    
    // Parametri di privacy
    privacySettings?: {
      enabled: boolean;
      epsilon: number;
      delta: number;
      clipNorm?: number;
      noiseMechanism?: 'gaussian' | 'laplacian';
    };
  }
  
  /**
   * Topologia della rete
   */
  export interface NetworkTopology {
    clientCount: number;
    topology: 'star' | 'ring' | 'mesh' | 'hierarchical';
    connectionDistribution?: 'uniform' | 'normal' | 'pareto';
    latencyRange?: [number, number]; // ms
    bandwidthRange?: [number, number]; // Mbps
    dropoutProbability?: number;
  }
  
  /**
   * Modello client
   */
  export interface ClientModel {
    id: string;
    dataDistribution: {
      samples: number;
      distribution: number[];
    };
    computationalCapability: number; // Fattore relativo (1.0 = standard)
    connectionQuality: {
      bandwidth: number; // Mbps
      latency: number; // ms
      dropProbability: number; // 0-1
    };
    localModel: {
      weights: Float32Array;
      version: number;
      performance: {
        accuracy: number;
        loss: number;
      };
    };
  }
  
  /**
   * Modello globale
   */
  export interface GlobalModel {
    weights: Float32Array;
    architecture: SimulationConfig['modelArchitecture'];
    version: number;
    performance: {
      accuracy: number;
      loss: number;
    };
  }
  
  /**
   * Risultato della simulazione
   */
  export interface SimulationResult {
    id: string;
    config: SimulationConfig;
    metrics: MetricsResult;
    finalModel: GlobalModel;
    duration: number; // ms
    completedAt: Date;
  }
  
  /**
   * Metriche della simulazione
   */
  export interface MetricsResult {
    convergence: {
      round: number;
      loss: number;
      accuracy: number;
      timestamp: number;
    }[];
    privacy: {
      epsilon: number;
      delta: number;
    };
    communication: {
      rounds: number;
      totalBytes: number;
    };
    clientParticipation: string[][]; // Array di clientId per ogni round
  }
  
  /**
   * Algoritmo di Federated Learning
   */
  export interface FedAlgorithm {
    id: string;
    name: string;
    description: string;
    paperUrl?: string;
    year: number;
    authors: string[];
    parameters: {
      name: string;
      description: string;
      defaultValue: any;
      range?: [number, number];
    }[];
  }
  
  /**
   * Metadati di un dataset
   */
  export interface DatasetMetadata {
    id: string;
    name: string;
    description: string;
    samples: number;
    features: number;
    classes: number;
    format: string;
    domain: string;
    createdAt: Date;
    source?: string;
    citation?: string;
    license?: string;
    tags: string[];
  }
  
  /**
   * Riferimento a un paper scientifico
   */
  export interface PaperReference {
    id: string;
    title: string;
    authors: string[];
    year: number;
    venue: string;
    doi?: string;
    url?: string;
    abstract?: string;
    citations?: number;
    algorithms?: string[]; // IDs degli algoritmi correlati
    tags: string[];
  }
  
  /**
   * Parametri per una simulazione
   */
  export interface SimulationParameters {
    global: {
      rounds: number;
      clientFraction: number;
      aggregationStrategy: string;
    };
    client: {
      batchSize: number;
      localEpochs: number;
      optimizer: {
        type: 'sgd' | 'adam' | 'adagrad';
        learningRate: number;
        beta1?: number;
        beta2?: number;
      };
    };
    model: {
      type: string;
      initializer: string;
      layers: {
        name: string;
        type: string;
        units?: number;
        activation?: string;
        kernelSize?: number;
        filters?: number;
        dropout?: number;
      }[];
    };
    privacy: {
      enabled: boolean;
      epsilon: number;
      delta: number;
      clipNorm: number;
    };
  }
  
  /**
   * Risultati di benchmark di simulazione
   */
  export interface BenchmarkResult {
    id: string;
    name: string;
    description: string;
    createdAt: Date;
    simulations: string[]; // Array di ID di simulazione
    comparisonMetrics: {
      name: string;
      description: string;
      values: {
        simulationId: string;
        value: number;
      }[];
    }[];
    statisticalAnalysis?: {
      testType: string;
      pValue: number;
      isSignificant: boolean;
      effectSize?: number;
    };
  }
  
  /**
   * Configurazione di una visualizzazione
   */
  export interface VisualizationConfig {
    id: string;
    type: 'chart' | 'graph' | 'heatmap' | '3d' | 'custom';
    title: string;
    description?: string;
    dataSource: {
      type: 'simulation' | 'benchmark' | 'custom';
      id: string;
      metrics: string[];
    };
    options: {
      dimensions?: { width: number; height: number };
      colors?: string[];
      showLegend?: boolean;
      axisLabels?: { x: string; y: string; z?: string };
      [key: string]: any;
    };
  }
  
  /**
   * Progress tracking di una simulazione
   */
  export interface SimulationProgress {
    simulationId: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    currentRound: number;
    totalRounds: number;
    currentAccuracy?: number;
    currentLoss?: number;
    eta?: number; // Tempo stimato per il completamento (ms)
    startedAt: Date;
    lastUpdated: Date;
    error?: string;
  }
  
  /**
   * Configurazione di un esperimento (serie di simulazioni correlate)
   */
  export interface ExperimentConfig {
    id: string;
    name: string;
    description?: string;
    createdAt: Date;
    baseSimulation: SimulationConfig;
    variations: {
      name: string;
      description?: string;
      parameterPath: string[]; // Path al parametro da variare, es. ['clientSelectionStrategy', 'participationRate']
      values: any[];
    }[];
    status: 'draft' | 'running' | 'completed';
    results?: {
      simulationId: string;
      variationName: string;
      parameterValue: any;
      metrics: {
        name: string;
        value: number;
      }[];
    }[];
  }
  
  /**
   * Modello di annotazione per risultati di simulazione
   */
  export interface Annotation {
    id: string;
    simulationId: string;
    userId: string;
    createdAt: Date;
    type: 'comment' | 'highlight' | 'comparison';
    content: string;
    position?: {
      // Per annotazioni collegate a punti specifici
      round?: number;
      metric?: string;
      x?: number;
      y?: number;
    };
    references?: {
      // Per annotazioni che si riferiscono ad altri elementi
      type: 'paper' | 'simulation' | 'annotation';
      id: string;
    }[];
  }
  
  /**
   * Templates di simulazione predefiniti
   */
  export interface SimulationTemplate {
    id: string;
    name: string;
    description: string;
    category: 'basic' | 'advanced' | 'research' | 'educational';
    config: SimulationConfig;
    previewImage?: string;
    difficulty: 'beginner' | 'intermediate' | 'advanced';
    tags: string[];
    author?: {
      name: string;
      institution?: string;
      email?: string;
    };
    publications?: {
      title: string;
      url: string;
      citation: string;
    }[];
  }
  
  /**
   * Tipi di evento in una simulazione
   */
  export enum SimulationEventType {
    ROUND_COMPLETED = 'round_completed',
    CLIENT_SELECTED = 'client_selected',
    MODEL_UPDATED = 'model_updated',
    CONVERGENCE_REACHED = 'convergence_reached',
    PRIVACY_THRESHOLD_REACHED = 'privacy_threshold_reached',
    ERROR_OCCURRED = 'error_occurred'
  }
  
  /**
   * Evento in una simulazione
   */
  export interface SimulationEvent {
    type: SimulationEventType;
    round: number;
    timestamp: number;
    data: any;
  }
  
  /**
   * Modello utente
   */
  export interface User {
    id: string;
    username: string;
    email: string;
    role: 'user' | 'researcher' | 'educator' | 'admin';
    institution?: string;
    simulations: string[]; // IDs delle simulazioni create
    savedExperiments: string[]; // IDs degli esperimenti salvati
    preferences: {
      theme: 'light' | 'dark' | 'system';
      visualizationDefaults: {
        colorScheme: string;
        dimensions: { width: number; height: number };
      };
    };
  }
  
  /**
   * Esportazione dei risultati
   */
  export interface ExportOptions {
    format: 'csv' | 'json' | 'latex' | 'pdf' | 'jupyter';
    sections: ('configuration' | 'metrics' | 'visualization' | 'analysis')[];
    includeRawData: boolean;
    customizationOptions?: {
      template?: string;
      style?: string;
      includeBibliography?: boolean;
    };
  }
  
  /**
   * Informazioni su un algoritmo di federated learning
   */
  export interface AlgorithmInfo {
    id: string;
    name: string;
    fullName: string;
    description: string;
    yearPublished: number;
    authors: string[];
    paper: {
      title: string;
      url: string;
      venueAbbreviation: string;
      venueFull: string;
      citations?: number;
    };
    characteristics: {
      convergenceSpeed: 'slow' | 'medium' | 'fast';
      communicationEfficiency: 'low' | 'medium' | 'high';
      robustness: 'low' | 'medium' | 'high';
      privacyPreservation: 'low' | 'medium' | 'high';
      heterogeneityHandling: 'poor' | 'fair' | 'good' | 'excellent';
    };
    parameters: {
      name: string;
      description: string;
      defaultValue: any;
      range?: [number, number];
      impact: string;
    }[];
    implementations: {
      language: string;
      url: string;
      stars?: number;
      lastUpdated?: Date;
    }[];
    relatedAlgorithms: string[]; // IDs di algoritmi correlati
    tags: string[];
  }
  
  /**
   * Utils per la simulazione
   */
  export class SimulationUtils {
    /**
     * Calcola epsilon per la privacy differenziale
     */
    static calculateEpsilon(
      samplingRate: number,
      noiseScale: number,
      iterations: number
    ): number {
      // Implementazione semplificata del calcolo di epsilon
      // Nella realtà questo dovrebbe implementare un calcolo più complesso
      return (Math.sqrt(2 * Math.log(1.25 / 0.0001)) * iterations * samplingRate) / noiseScale;
    }
  
    /**
     * Calcola il numero di round necessari per raggiungere una data accuratezza
     */
    static estimateRoundsToAccuracy(
      currentAccuracy: number,
      targetAccuracy: number,
      currentRound: number,
      convergenceRate: number
    ): number {
      if (currentAccuracy >= targetAccuracy) return currentRound;
      
      // Modello logaritmico di convergenza
      const remainingAccuracy = targetAccuracy - currentAccuracy;
      const estimatedRounds = Math.ceil(
        Math.log(0.01 / remainingAccuracy) / Math.log(1 - convergenceRate)
      );
      
      return currentRound + Math.max(1, estimatedRounds);
    }
  
    /**
     * Converte un modello tra diversi formati
     */
    static convertModelFormat(
      weights: Float32Array,
      sourceFormat: 'flat' | 'layered' | 'sparse',
      targetFormat: 'flat' | 'layered' | 'sparse',
      modelArchitecture: SimulationConfig['modelArchitecture']
    ): any {
      // Implementazione di conversione tra formati
      // Questa è solo una struttura, l'implementazione effettiva dipenderebbe dai formati specifici
      if (sourceFormat === targetFormat) return weights;
      
      // Esempio di conversione da flat a layered per un modello semplice
      if (sourceFormat === 'flat' && targetFormat === 'layered') {
        const layeredModel: { [key: string]: Float32Array } = {};
        let offset = 0;
        
        // Esempio per un modello semplice con 2 layer
        // In un'implementazione reale, usare le informazioni da modelArchitecture
        const layer1Size = 784 * 128; // Esempio: input 784, hidden 128
        const layer2Size = 128 * 10;  // Esempio: hidden 128, output 10
        
        layeredModel['layer1'] = weights.slice(0, layer1Size);
        layeredModel['layer2'] = weights.slice(layer1Size, layer1Size + layer2Size);
        
        return layeredModel;
      }
      
      // Altre conversioni sarebbero implementate qui
      return weights;
    }
  }