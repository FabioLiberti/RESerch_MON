import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

// Tipi per la configurazione e i risultati della simulazione
export interface FederationConfig {
  numClients: number;
  distribution: 'iid' | 'non_iid_label' | 'non_iid_quantity';
  privacy: 'differential_privacy' | 'secure_aggregation' | null;
  aggregator: 'fedavg' | 'fedprox' | 'scaffold';
  numRounds?: number;
  clientParticipationRate?: number;
  learningRate?: number;
  batchSize?: number;
  epochs?: number;
  dpNoiseScale?: number;
  secureAggNoise?: number;
  communicationEfficiency?: number;
}

export interface ClientMetrics {
  client_id: string;
  accuracy: number;
  loss: number;
  samples: number;
}

export interface RoundMetrics {
  round: number;
  global_accuracy: number;
  global_loss: number;
  client_metrics: ClientMetrics[];
  communication_cost: number;
  privacy_budget?: number;
  duration: number;
}

export interface SimulationResults {
  config: FederationConfig;
  rounds: RoundMetrics[];
  final_accuracy: number;
  final_loss: number;
  convergence_rate: number;
  communication_efficiency: number;
  privacy_impact?: number;
  heterogeneity_impact?: number;
  total_duration: number;
}

// Hook personalizzato per eseguire e gestire simulazioni FL
export const useFlSimulation = () => {
  const [simulationResults, setSimulationResults] = useState<SimulationResults | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [currentRound, setCurrentRound] = useState<number>(0);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);

  // Simulazione lato client (per sviluppo/demo)
  const simulateLocally = useCallback(async (config: FederationConfig) => {
    setIsLoading(true);
    setError(null);
    setIsSimulating(true);
    setCurrentRound(0);
    
    try {
      // Valore di default
      const numRounds = config.numRounds || 8;
      
      // Generazione dati simulati
      const rounds: RoundMetrics[] = [];
      
      // Generazione dati di convergenza in base alla configurazione
      let baseAccuracy = 0.4;
      let convergenceRate = 0.08;
      
      // Modifica convergenza in base alla distribuzione dei dati
      if (config.distribution === 'non_iid_label') {
        baseAccuracy = 0.35;
        convergenceRate = 0.07;
      } else if (config.distribution === 'non_iid_quantity') {
        baseAccuracy = 0.38;
        convergenceRate = 0.075;
      }
      
      // Modifica convergenza in base all'aggregatore
      if (config.aggregator === 'fedprox') {
        // FedProx è migliore per dati non IID
        if (config.distribution !== 'iid') {
          convergenceRate += 0.01;
        } else {
          // Leggermente peggiore per dati IID a causa dell'overhead
          convergenceRate -= 0.005;
        }
      } else if (config.aggregator === 'scaffold') {
        // SCAFFOLD è migliore per dati non IID
        if (config.distribution !== 'iid') {
          convergenceRate += 0.015;
        } else {
          // Leggermente peggiore per dati IID a causa dell'overhead
          convergenceRate -= 0.008;
        }
      }
      
      // Impatto della privacy sulla convergenza
      if (config.privacy === 'differential_privacy') {
        baseAccuracy -= 0.05;
        convergenceRate -= 0.01;
      } else if (config.privacy === 'secure_aggregation') {
        // Impatto minimo
        convergenceRate -= 0.002;
      }
      
      // Simulazione di ogni round
      for (let round = 0; round < numRounds; round++) {
        // Calcolo dell'accuratezza con una curva realistica di convergenza
        const accuracy = Math.min(0.95, baseAccuracy + (1 - Math.exp(-convergenceRate * (round + 1))));
        
        // Calcolo della loss (inversamente correlata all'accuratezza)
        const loss = Math.max(0.05, 1.5 - accuracy);
        
        // Generazione metriche dei client
        const clientMetrics: ClientMetrics[] = [];
        const numActiveClients = Math.floor(config.numClients * (config.clientParticipationRate || 0.8));
        
        for (let i = 0; i < numActiveClients; i++) {
          // Varia le metriche dei client in base alla distribuzione
          let clientAccuracy = accuracy;
          let clientSamples = 1000;
          
          if (config.distribution === 'non_iid_label') {
            // I client hanno performance diverse a seconda del gruppo di etichette
            clientAccuracy = accuracy * (0.9 + 0.2 * Math.random());
          } else if (config.distribution === 'non_iid_quantity') {
            // I client hanno quantità di dati diverse
            clientSamples = i < config.numClients / 3 ? 2000 : 500;
            // I client con più dati tendono ad avere performance migliori
            if (i < config.numClients / 3) {
              clientAccuracy = accuracy * (1 + 0.05 * Math.random());
            } else {
              clientAccuracy = accuracy * (1 - 0.1 * Math.random());
            }
          }
          
          clientMetrics.push({
            client_id: `client-${i}`,
            accuracy: clientAccuracy,
            loss: Math.max(0.05, 1.5 - clientAccuracy),
            samples: clientSamples
          });
        }
        
        // Calcolo costo comunicazione
        const modelSizeMb = 10; // Dimensione modello ipotetica in MB
        const communicationCost = modelSizeMb * numActiveClients * 2; // Upload e download
        
        // Privacy budget (per DP)
        const privacyBudget = config.privacy === 'differential_privacy' 
          ? 0.5 + round * 0.2 
          : undefined;
        
        rounds.push({
          round,
          global_accuracy: accuracy,
          global_loss: loss,
          client_metrics: clientMetrics,
          communication_cost: communicationCost,
          privacy_budget: privacyBudget,
          duration: 10 + Math.random() * 5 // Durata simulata in secondi
        });
        
        // Aggiorna stato corrente per visualizzazione progressiva
        setCurrentRound(round + 1);
        setSimulationResults({
          config,
          rounds: rounds.slice(0, round + 1),
          final_accuracy: accuracy,
          final_loss: loss,
          convergence_rate: convergenceRate,
          communication_efficiency: config.communicationEfficiency || 1.0,
          privacy_impact: config.privacy ? (config.privacy === 'differential_privacy' ? 0.1 : 0.02) : 0,
          heterogeneity_impact: config.distribution !== 'iid' ? 0.15 : 0,
          total_duration: (10 + Math.random() * 5) * (round + 1)
        });
        
        // Simula un ritardo tra i round
        if (round < numRounds - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      // Risultati finali
      const finalResults: SimulationResults = {
        config,
        rounds,
        final_accuracy: rounds[numRounds - 1].global_accuracy,
        final_loss: rounds[numRounds - 1].global_loss,
        convergence_rate: convergenceRate,
        communication_efficiency: config.communicationEfficiency || 1.0,
        privacy_impact: config.privacy ? (config.privacy === 'differential_privacy' ? 0.1 : 0.02) : 0,
        heterogeneity_impact: config.distribution !== 'iid' ? 0.15 : 0,
        total_duration: rounds.reduce((sum, r) => sum + r.duration, 0)
      };
      
      setSimulationResults(finalResults);
      return finalResults;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Errore durante la simulazione';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsLoading(false);
      setIsSimulating(false);
    }
  }, []);
  
  // Chiamata API al backend per simulazione reale
  const runSimulationApi = useCallback(async (config: FederationConfig) => {
    setIsLoading(true);
    setError(null);
    setIsSimulating(true);
    setCurrentRound(0);
    
    try {
      // Verifica disponibilità API
      const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:3001';
      
      // Chiamata API per avviare la simulazione
      const { data } = await axios.post<{ simulationId: string }>(`${apiUrl}/api/simulations`, config);
      
      const simulationId = data.simulationId;
      let isComplete = false;
      let currentResults: SimulationResults | null = null;
      
      // Polling per aggiornamenti sulla simulazione
      while (!isComplete) {
        const { data: statusData } = await axios.get<{
          status: 'running' | 'completed' | 'failed';
          currentRound: number;
          results: SimulationResults | null;
          error?: string;
        }>(`${apiUrl}/api/simulations/${simulationId}`);
        
        if (statusData.status === 'failed') {
          throw new Error(statusData.error || 'Simulazione fallita');
        }
        
        if (statusData.currentRound > currentRound) {
          setCurrentRound(statusData.currentRound);
        }
        
        if (statusData.results) {
          currentResults = statusData.results;
          setSimulationResults(currentResults);
        }
        
        if (statusData.status === 'completed') {
          isComplete = true;
        } else {
          // Attesa prima del prossimo polling
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      return currentResults;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Errore durante la chiamata API';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsLoading(false);
      setIsSimulating(false);
    }
  }, []);
  
  // Funzione principale di esecuzione simulazione
  const runSimulation = useCallback(async (config?: FederationConfig) => {
    // Configurazione di default se non specificata
    const simulationConfig: FederationConfig = config || {
      numClients: 10,
      distribution: 'iid',
      privacy: null,
      aggregator: 'fedavg',
      numRounds: 8,
      clientParticipationRate: 0.8
    };
    
    try {
      // Verifica se utilizzare l'API o la simulazione locale
      // Utilizza l'env per determinare quale metodo utilizzare
      const useApi = process.env.REACT_APP_USE_API === 'true';
      
      if (useApi) {
        return await runSimulationApi(simulationConfig);
      } else {
        return await simulateLocally(simulationConfig);
      }
    } catch (err) {
      console.error('Errore durante la simulazione:', err);
      throw err;
    }
  }, [simulateLocally, runSimulationApi]);
  
  // Ottieni dati di convergenza per visualizzazioni
  const getConvergenceData = useCallback(() => {
    if (!simulationResults || !simulationResults.rounds) {
      return [];
    }
    
    return simulationResults.rounds.map(round => ({
      round: round.round,
      accuracy: round.global_accuracy,
      loss: round.global_loss
    }));
  }, [simulationResults]);
  
  // Ottieni confronto tra algoritmi per visualizzazioni
  const getAlgorithmComparisonData = useCallback(() => {
    if (!simulationResults || !simulationResults.rounds) {
      return [];
    }
    
    const realData = simulationResults.rounds.map(round => ({
      round: round.round,
      [simulationResults.config.aggregator]: round.global_accuracy
    }));
    
    // Genera dati simulati per altri algoritmi
    const algorithms = ['fedavg', 'fedprox', 'scaffold'] as const;
    const usedAlgorithm = simulationResults.config.aggregator;
    
    // Fattori di scaling basati su caratteristiche della distribuzione
    const getScalingFactor = (algorithm: typeof algorithms[number]) => {
      const distribution = simulationResults?.config.distribution || 'iid';
      
      if (distribution === 'iid') {
        // FedAvg è ottimo per IID, gli altri aggiungono overhead
        if (algorithm === 'fedavg') return 1.0;
        if (algorithm === 'fedprox') return 0.98;
        if (algorithm === 'scaffold') return 0.97;
      } else if (distribution === 'non_iid_label') {
        // Scaffold è migliore per non-IID, seguito da FedProx
        if (algorithm === 'fedavg') return 0.92;
        if (algorithm === 'fedprox') return 0.97;
        if (algorithm === 'scaffold') return 1.0;
      } else { // non_iid_quantity
        // FedProx è buono per dati eterogenei
        if (algorithm === 'fedavg') return 0.94;
        if (algorithm === 'fedprox') return 0.99;
        if (algorithm === 'scaffold') return 0.98;
      }
      
      return 1.0;
    };
    
    // Aggiungi dati simulati per gli altri algoritmi
    return realData.map(point => {
      const result = { ...point };
      
      algorithms.forEach(alg => {
        if (alg !== usedAlgorithm) {
          const scalingFactor = getScalingFactor(alg);
          // Aggiungi un po' di variazione casuale
          const variation = (Math.random() * 0.04) - 0.02;
          const accuracy = point[usedAlgorithm] * (scalingFactor + variation);
          // Assicurati che l'accuratezza stia nell'intervallo [0,1]
          result[alg] = Math.max(0, Math.min(1, accuracy));
        }
      });
      
      return result;
    });
  }, [simulationResults]);
  
  return {
    simulationResults,
    isLoading,
    error,
    currentRound,
    isSimulating,
    runSimulation,
    getConvergenceData,
    getAlgorithmComparisonData
  };
};

export default useFlSimulation;