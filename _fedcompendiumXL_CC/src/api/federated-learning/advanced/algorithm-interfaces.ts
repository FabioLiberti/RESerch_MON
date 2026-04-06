import { SimulationConfig, GlobalModel, ModelUpdate, ClientData, TestData, Metrics } from './types';

// Interfaccia base per tutti gli algoritmi FL
export interface FLAlgorithm {
  name: string;
  description: string;
  initialize(config: SimulationConfig): void;
  clientUpdate(clientId: string, data: ClientData, round: number): ModelUpdate;
  serverAggregate(updates: ModelUpdate[], round: number): GlobalModel;
  evaluate(model: GlobalModel, testData: TestData): Metrics;
  getHyperparameters(): Record<string, any>;
  setHyperparameters(hyperparams: Record<string, any>): void;
}

// Registro degli algoritmi FL disponibili
export class FLAlgorithmRegistry {
  private static algorithms: Map<string, new () => FLAlgorithm> = new Map();
  
  static register(algorithmClass: new () => FLAlgorithm): void {
    const instance = new algorithmClass();
    FLAlgorithmRegistry.algorithms.set(instance.name, algorithmClass);
  }
  
  static getAlgorithm(name: string): FLAlgorithm | null {
    const algorithmClass = FLAlgorithmRegistry.algorithms.get(name);
    return algorithmClass ? new algorithmClass() : null;
  }
  
  static getAvailableAlgorithms(): string[] {
    return Array.from(FLAlgorithmRegistry.algorithms.keys());
  }
  
  static getAlgorithmDescription(name: string): string | null {
    const algorithm = FLAlgorithmRegistry.getAlgorithm(name);
    return algorithm ? algorithm.description : null;
  }
}

export default FLAlgorithmRegistry;