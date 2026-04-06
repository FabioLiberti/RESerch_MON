import { useState, useCallback } from 'react';

// Define types for federated learning simulation
interface FederationConfig {
  numClients: number;
  distribution: 'iid' | 'non_iid_label' | 'non_iid_quantity';
  privacy: 'differential_privacy' | 'secure_aggregation' | null;
  aggregator: 'fedavg' | 'fedprox' | 'scaffold';
}

interface ClientData {
  id: string;
  dataSize: number;
  accuracy: number;
  loss: number;
  trainingTime: number;
  lastActive: Date;
}

interface ModelSnapshot {
  round: number;
  globalAccuracy: number;
  globalLoss: number;
  clientsParticipated: number;
  timestamp: Date;
}

interface SimulationResults {
  modelSnapshots: ModelSnapshot[];
  clientsData: ClientData[];
  finalAccuracy: number;
  finalLoss: number;
  totalRounds: number;
  convergenceRate: number;
  privacyEpsilon?: number;
  communicationCost: number;
}

/**
 * Custom hook for managing Federated Learning simulations
 */
export const useFlSimulation = () => {
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [simulationResults, setSimulationResults] = useState<SimulationResults | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * Simulates federated learning with given configuration
   */
  const runSimulation = useCallback(async (config: FederationConfig): Promise<SimulationResults> => {
    setIsRunning(true);
    setError(null);

    try {
      // In a real implementation, this would call an API or run actual simulation
      // For now, we'll create mock data based on the configuration
      
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Generate model snapshots based on configuration
      const modelSnapshots: ModelSnapshot[] = [];
      const totalRounds = 8;
      
      for (let round = 1; round <= totalRounds; round++) {
        // Different aggregators have different convergence patterns
        let baseAccuracy = 0;
        switch (config.aggregator) {
          case 'fedavg':
            baseAccuracy = 0.5 + (0.4 * (1 - Math.exp(-0.4 * round)));
            break;
          case 'fedprox':
            baseAccuracy = 0.5 + (0.45 * (1 - Math.exp(-0.45 * round)));
            break;
          case 'scaffold':
            baseAccuracy = 0.5 + (0.46 * (1 - Math.exp(-0.5 * round)));
            break;
        }
        
        // Data distribution affects convergence
        let distributionFactor = 1.0;
        if (config.distribution === 'non_iid_label') {
          distributionFactor = 0.95;
        } else if (config.distribution === 'non_iid_quantity') {
          distributionFactor = 0.9;
        }
        
        // Number of clients affects how many participate
        const participationRate = Math.min(1.0, 5 / config.numClients + 0.5);
        const clientsParticipated = Math.floor(config.numClients * participationRate);
        
        modelSnapshots.push({
          round,
          globalAccuracy: baseAccuracy * distributionFactor,
          globalLoss: 1 - (baseAccuracy * distributionFactor) + 0.1,
          clientsParticipated,
          timestamp: new Date(Date.now() - (totalRounds - round) * 3600000)
        });
      }
      
      // Generate client data
      const clientsData: ClientData[] = [];
      for (let i = 0; i < config.numClients; i++) {
        // Create variation in client performance
        const varianceFactor = 0.9 + Math.random() * 0.2;
        
        // Data size varies by distribution type
        let dataSize = 1000;
        if (config.distribution === 'non_iid_quantity') {
          dataSize = i < config.numClients / 3 ? 2000 : 500;
        }
        
        const lastModelSnapshot = modelSnapshots[modelSnapshots.length - 1];
        
        clientsData.push({
          id: `client-${i}`,
          dataSize,
          accuracy: lastModelSnapshot.globalAccuracy * varianceFactor,
          loss: lastModelSnapshot.globalLoss * (2 - varianceFactor),
          trainingTime: dataSize * 0.01,
          lastActive: new Date(Date.now() - Math.floor(Math.random() * 86400000))
        });
      }
      
      // Create final simulation results
      const finalSnapshot = modelSnapshots[modelSnapshots.length - 1];
      const results: SimulationResults = {
        modelSnapshots,
        clientsData,
        finalAccuracy: finalSnapshot.globalAccuracy,
        finalLoss: finalSnapshot.globalLoss,
        totalRounds,
        convergenceRate: finalSnapshot.globalAccuracy / totalRounds,
        communicationCost: totalRounds * finalSnapshot.clientsParticipated * 2 // up and down communication
      };
      
      // Add privacy parameter if applicable
      if (config.privacy === 'differential_privacy') {
        results.privacyEpsilon = 2.1 + Math.random() * 0.5;
      }
      
      setSimulationResults(results);
      return results;
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      throw err;
    } finally {
      setIsRunning(false);
    }
  }, []);

  /**
   * Stops the current simulation if running
   */
  const stopSimulation = useCallback(() => {
    if (isRunning) {
      setIsRunning(false);
      setError('Simulation was stopped by user');
    }
  }, [isRunning]);

  return {
    runSimulation,
    stopSimulation,
    simulationResults,
    isRunning,
    error
  };
};

export default useFlSimulation;