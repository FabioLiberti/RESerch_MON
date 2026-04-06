import * as math from 'mathjs';
import _ from 'lodash';
import { FLAlgorithm } from './algorithm-interfaces';
import { 
  SimulationConfig, GlobalModel, ModelUpdate, ClientData, 
  TestData, Metrics, ModelParameters, ClientMetrics 
} from './types';

// Classe base per gli algoritmi FL che implementa funzionalità comuni
export abstract class BaseFLAlgorithm implements FLAlgorithm {
  name: string;
  description: string;
  protected config: SimulationConfig | null = null;
  protected globalModel: GlobalModel | null = null;
  protected clientStates: Map<string, any> = new Map();
  protected roundHistory: any[] = [];
  
  constructor(name: string, description: string) {
    this.name = name;
    this.description = description;
  }
  
  initialize(config: SimulationConfig): void {
    this.config = config;
    this.clientStates.clear();
    this.roundHistory = [];
    
    // Inizializzazione del modello globale con parametri casuali
    this.globalModel = this.createInitialModel(config);
    
    // Inizializzazione stati dei client
    config.clients.forEach(client => {
      this.clientStates.set(client.id, this.createInitialClientState(client.id));
    });
  }
  
  // Hook per inizializzazione del modello - personalizzabile dalle sottoclassi
  protected createInitialModel(config: SimulationConfig): GlobalModel {
    // Basata sulla configurazione, crea un modello iniziale
    // Esempio: per una rete di classificazione semplice
    const layers = config.modelArchitecture?.layers || [
      { type: 'input', size: 784 },
      { type: 'dense', size: 128, activation: 'relu' },
      { type: 'dense', size: 64, activation: 'relu' },
      { type: 'dense', size: 10, activation: 'softmax' }
    ];
    
    // Genera parametri casuali per ogni layer
    const parameters: ModelParameters = {};
    
    for (let i = 1; i < layers.length; i++) {
      const inputSize = layers[i-1].size;
      const outputSize = layers[i].size;
      
      // Weights di Xavier/Glorot per una migliore inizializzazione
      const stddev = Math.sqrt(2 / (inputSize + outputSize));
      
      // Matrice dei pesi
      parameters[`layer${i}_weights`] = Array.from({ length: outputSize }, () => 
        Array.from({ length: inputSize }, () => math.random(-stddev, stddev))
      );
      
      // Bias
      parameters[`layer${i}_bias`] = Array.from({ length: outputSize }, () => 0);
    }
    
    return {
      parameters,
      metadata: {
        architecture: config.modelArchitecture,
        round: 0,
        accuracy: 0,
        loss: 0
      }
    };
  }
  
  // Hook per inizializzazione stato client - personalizzabile dalle sottoclassi
  protected createInitialClientState(clientId: string): any {
    return { 
      clientId, 
      localUpdates: 0,
      lastParameters: null
    };
  }
  
  // Implementazioni astratte da fornire nelle classi concrete
  abstract clientUpdate(clientId: string, data: ClientData, round: number): ModelUpdate;
  abstract serverAggregate(updates: ModelUpdate[], round: number): GlobalModel;
  
  // Valutazione del modello su dati di test
  evaluate(model: GlobalModel, testData: TestData): Metrics {
    // Implementazione base per valutazione modello
    
    // Simuliamo alcune metriche per testare il framework
    const globalMetrics = {
      accuracy: this.simulateAccuracy(model, testData),
      loss: this.simulateLoss(model, testData),
      round: model.metadata.round,
      communicationCost: this.calculateCommunicationCost(model)
    };
    
    // Metriche per i singoli client
    const nodeMetrics: Record<string, ClientMetrics> = {};
    
    if (this.config) {
      this.config.clients.forEach(client => {
        // Simulazione di variazioni nelle metriche per client
        const variance = math.random(-0.05, 0.05);
        const clientAccuracy = Math.min(Math.max(globalMetrics.accuracy + variance, 0), 1);
        
        nodeMetrics[client.id] = {
          accuracy: clientAccuracy,
          loss: globalMetrics.loss * (1 + math.random(-0.1, 0.1)),
          parameters: this.estimateParameterCount(model),
          communicationCost: this.estimateClientCommunicationCost(client.id, model)
        };
      });
      
      // Server metrics
      if (this.config.server) {
        nodeMetrics[this.config.server.id] = {
          accuracy: globalMetrics.accuracy,
          loss: globalMetrics.loss,
          parameters: this.estimateParameterCount(model),
          communicationCost: this.calculateServerCommunicationCost(model)
        };
      }
    }
    
    return {
      globalMetrics,
      nodeMetrics
    };
  }
  
  // Helper: simulate accuracy based on round progression
  private simulateAccuracy(model: GlobalModel, testData: TestData): number {
    // Logistic curve simulation from 0.4 to 0.95
    const round = model.metadata.round;
    const maxRounds = this.config?.maxRounds || 100;
    const baseAccuracy = 0.4;
    const maxAccuracy = 0.95;
    
    // Add some noise
    const noise = math.random(-0.01, 0.01);
    
    return baseAccuracy + (maxAccuracy - baseAccuracy) * (1 / (1 + Math.exp(-0.07 * (round - maxRounds / 3)))) + noise;
  }
  
  // Helper: simulate loss based on round progression
  private simulateLoss(model: GlobalModel, testData: TestData): number {
    // Exponential decay from 2.0 to 0.1
    const round = model.metadata.round;
    const maxRounds = this.config?.maxRounds || 100;
    const initialLoss = 2.0;
    const finalLoss = 0.1;
    
    // Add some noise
    const noise = math.random(-0.05, 0.05);
    
    return initialLoss * Math.exp(-3 * round / maxRounds) + finalLoss + noise;
  }
  
  // Estimate the parameter count in the model
  private estimateParameterCount(model: GlobalModel): number {
    let totalParams = 0;
    
    // Sum all parameters in the model
    Object.entries(model.parameters).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        if (Array.isArray(value[0])) {
          // 2D array (weights)
          totalParams += value.length * (value[0] as number[]).length;
        } else {
          // 1D array (bias)
          totalParams += value.length;
        }
      }
    });
    
    return totalParams;
  }
  
  // Calculate communication cost in MB
  private calculateCommunicationCost(model: GlobalModel): number {
    // Assume 4 bytes per parameter (float32)
    const paramCount = this.estimateParameterCount(model);
    return (paramCount * 4) / (1024 * 1024); // Convert bytes to MB
  }
  
  // Estimate client communication cost
  private estimateClientCommunicationCost(clientId: string, model: GlobalModel): number {
    // Base communication cost
    const baseCost = this.calculateCommunicationCost(model);
    
    // Add some variance per client
    return baseCost * (0.8 + math.random(0, 0.4));
  }
  
  // Calculate server communication cost (usually higher due to aggregation)
  private calculateServerCommunicationCost(model: GlobalModel): number {
    const baseCost = this.calculateCommunicationCost(model);
    const clientCount = this.config?.clients.length || 1;
    
    // Server communicates with all clients
    return baseCost * clientCount * 0.8; // Assuming some compression
  }
  
  // Return hyperparameters for UI configuration
  getHyperparameters(): Record<string, any> {
    return {}; // Default implementation returns empty object
  }
  
  // Set hyperparameters from UI
  setHyperparameters(hyperparams: Record<string, any>): void {
    // Default implementation does nothing
  }
}

/**
 * FedAvg: Algoritmo standard di Federated Averaging
 */
export class FedAvg extends BaseFLAlgorithm {
  private learningRate: number = 0.01;
  private localEpochs: number = 1;
  
  constructor() {
    super(
      "FedAvg", 
      "Federated Averaging - L'algoritmo base di aggregazione federata che calcola la media dei parametri dei modelli client ponderata per la dimensione del loro dataset."
    );
  }
  
  clientUpdate(clientId: string, data: ClientData, round: number): ModelUpdate {
    if (!this.globalModel) throw new Error("Model not initialized");
    
    // Simuliamo l'aggiornamento locale addestrandoci sui dati client
    
    // Clone global parameters
    const localParameters = _.cloneDeep(this.globalModel.parameters);
    
    // Simulate local training effect with random updates
    Object.keys(localParameters).forEach(key => {
      const param = localParameters[key];
      
      if (Array.isArray(param)) {
        if (Array.isArray(param[0])) {
          // 2D array (weights)
          for (let i = 0; i < param.length; i++) {
            const row = param[i] as number[];
            for (let j = 0; j < row.length; j++) {
              // Simulate gradient update
              row[j] -= this.learningRate * math.random(-0.1, 0.1);
            }
          }
        } else {
          // 1D array (bias)
          for (let i = 0; i < param.length; i++) {
            // Simulate gradient update
            const paramValue = param[i];
            if (typeof paramValue === 'number') {
              param[i] = paramValue - this.learningRate * math.random(-0.1, 0.1);
            }
          }
        }
      }
    });
    
    // Store client state for potential use in future rounds
    const clientState = this.clientStates.get(clientId) || {};
    this.clientStates.set(clientId, {
      ...clientState,
      lastParameters: localParameters,
      localUpdates: (clientState.localUpdates || 0) + 1
    });
    
    // Return client update
    return {
      clientId,
      parameters: localParameters,
      metadata: {
        dataSize: data.size,
        trainingLoss: 1.0 - (round / (this.config?.maxRounds || 100)) * 0.9,
        localEpochs: this.localEpochs
      }
    };
  }
  
  serverAggregate(updates: ModelUpdate[], round: number): GlobalModel {
    if (!this.globalModel) throw new Error("Model not initialized");
    
    // Weighted averaging of client updates
    const totalDataSize = updates.reduce((sum, update) => sum + (update.metadata.dataSize || 1), 0);
    const aggregatedParameters: ModelParameters = {};
    
    // Initialize with zeros
    if (this.globalModel && this.globalModel.parameters) {
      const modelParams = this.globalModel.parameters;
      Object.keys(modelParams).forEach(key => {
        const param = modelParams[key];
        
        if (Array.isArray(param)) {
          if (Array.isArray(param[0])) {
            // 2D array (weights)
            const firstRow = param[0] as number[];
            aggregatedParameters[key] = Array.from({ length: param.length }, () => 
              Array.from({ length: firstRow.length }, () => 0)
            );
          } else {
            // 1D array (bias)
            aggregatedParameters[key] = Array.from({ length: param.length }, () => 0);
          }
        }
      });
    }
    
    // Weighted sum of parameters
    updates.forEach(update => {
      const weight = (update.metadata.dataSize || 1) / totalDataSize;
      
      Object.keys(update.parameters).forEach(key => {
        const param = update.parameters[key];
        const aggParam = aggregatedParameters[key];
        
        if (Array.isArray(param) && Array.isArray(aggParam)) {
          if (Array.isArray(param[0]) && Array.isArray(aggParam[0])) {
            // 2D array (weights)
            for (let i = 0; i < param.length; i++) {
              const paramRow = param[i] as number[];
              const aggParamRow = aggParam[i] as number[];
              for (let j = 0; j < paramRow.length; j++) {
                aggParamRow[j] += paramRow[j] * weight;
              }
            }
          } else if (!Array.isArray(param[0]) && !Array.isArray(aggParam[0])) {
            // 1D array (bias)
            for (let i = 0; i < param.length; i++) {
              const paramValue = param[i];
              const aggParamValue = aggParam[i];
              if (typeof paramValue === 'number' && typeof aggParamValue === 'number') {
                aggParam[i] = aggParamValue + paramValue * weight;
              }
            }
          }
        }
      });
    });
    
    // Create new global model
    const newGlobalModel: GlobalModel = {
      parameters: aggregatedParameters,
      metadata: {
        ...this.globalModel.metadata,
        round: round,
        clientsParticipated: updates.length,
        updatedAt: new Date().toISOString()
      }
    };
    
    // Update internal state
    this.globalModel = newGlobalModel;
    
    return newGlobalModel;
  }
  
  getHyperparameters(): Record<string, any> {
    return {
      learningRate: this.learningRate,
      localEpochs: this.localEpochs
    };
  }
  
  setHyperparameters(hyperparams: Record<string, any>): void {
    if (hyperparams.learningRate !== undefined) {
      this.learningRate = hyperparams.learningRate;
    }
    if (hyperparams.localEpochs !== undefined) {
      this.localEpochs = hyperparams.localEpochs;
    }
  }
}