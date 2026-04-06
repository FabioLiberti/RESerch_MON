// Federation and simulation types
export interface FederationConfig {
    numClients: number;
    distribution: 'iid' | 'non_iid_label' | 'non_iid_quantity';
    privacy: 'differential_privacy' | 'secure_aggregation' | null;
    aggregator: 'fedavg' | 'fedprox' | 'scaffold';
  }
  
  export interface ClientData {
    id: string;
    dataSize: number;
    accuracy: number;
    loss: number;
    trainingTime: number;
    lastActive: Date;
  }
  
  export interface ModelSnapshot {
    round: number;
    globalAccuracy: number;
    globalLoss: number;
    clientsParticipated: number;
    timestamp: Date;
  }
  
  export interface SimulationResults {
    modelSnapshots: ModelSnapshot[];
    clientsData: ClientData[];
    finalAccuracy: number;
    finalLoss: number;
    totalRounds: number;
    convergenceRate: number;
    privacyEpsilon?: number;
    communicationCost: number;
  }
  
  export interface Node extends d3.SimulationNodeDatum {
    id: string;
    type: 'server' | 'client';
    group?: number;
    size?: number;
    active?: boolean;
  }
  
  export interface Link extends d3.SimulationLinkDatum<Node> {
    source: string | Node;
    target: string | Node;
    strength?: number;
    active?: boolean;
  }
  
  // Scenario types
  export interface Scenario {
    id: string;
    title: string;
    description: string;
    icon: any; // IconType from react-icons
    config: FederationConfig;
  }
  
  // Paper types
  export interface Paper {
    id: string;
    title: string;
    authors: string;
    conference: string;
    abstract?: string;
    publicationDate?: string;
    imageUrl?: string;
    pdfUrl?: string;
    doi?: string;
    tags?: string[];
  }
  
  // User types
  export interface UserProfile {
    id: string;
    name: string;
    email: string;
    organization?: string;
    role?: 'researcher' | 'student' | 'industry' | 'other';
    savedSimulations?: string[];
    favoriteScenarios?: string[];
    favoriteResearch?: string[];
  }
  
  // Application state types
  export interface AppState {
    currentSimulation?: {
      config: FederationConfig;
      results?: SimulationResults;
      status: 'idle' | 'running' | 'completed' | 'error';
      error?: string;
    };
    scenarios: Scenario[];
    papers: Paper[];
    userProfile?: UserProfile;
  }