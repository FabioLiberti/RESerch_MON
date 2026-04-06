// Tipi base per il sistema avanzato - questo file non interferisce con l'esistente
export interface ModelParameters {
    [key: string]: number | number[] | number[][];
  }
  
  export interface GlobalModel {
    parameters: ModelParameters;
    metadata: {
      architecture?: any;
      round: number;
      accuracy?: number;
      loss?: number;
      [key: string]: any;
    };
  }
  
  export interface ModelUpdate {
    clientId: string;
    parameters: ModelParameters;
    metadata: {
      dataSize?: number;
      trainingLoss?: number;
      localEpochs?: number;
      [key: string]: any;
    };
    controlVectors?: ModelParameters;
    isAttacker?: boolean;
    attackType?: string;
  }
  
  export interface ClientData {
    clientId: string;
    size: number;
    distribution: string;
    classes?: number[];
    mean?: number;
    stdDev?: number;
    samples: any[];
  }
  
  export interface TestData {
    size: number;
    distribution: string;
    samples: any[];
  }
  
  export interface SimulationConfig {
    id?: string;
    name?: string;
    algorithmName: string;
    dataset?: string;
    server: { id: string, resources?: any };
    clients: any[];
    clientsPerRound?: number;
    maxRounds: number;
    seed?: number;
    batchSize?: number;
    learningRate?: number;
    localEpochs?: number;
    modelArchitecture?: any;
    topology?: string;
    defense?: string | null;
  }
  
  export interface Metrics {
    globalMetrics: any;
    nodeMetrics: Record<string, any>;
  }
  
  export interface ClientMetrics {
    accuracy: number;
    loss: number;
    parameters?: number;
    communicationCost?: number;
  }
  
  export type MetricType = 'accuracy' | 'loss' | 'communicationCost' | 'parameters' | 'memory';
  export type ChartType = 'line' | 'area' | 'bar' | 'scatter';
  export type DatasetType = 'mnist' | 'cifar10' | 'shakespeare' | 'femnist' | 'custom';
  export type AttackType = 'model_poisoning' | 'free_rider' | 'label_flipping' | null;
  export type DefenseType = 'krum' | 'trimmed_mean' | 'median' | 'differential_privacy' | null;