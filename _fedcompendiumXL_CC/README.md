# Federated Learning Compendium XL

A comprehensive React-based platform for exploring, visualizing, and simulating Federated Learning concepts and architectures.

## Features

- **Interactive Network Topology Visualization**: Visualize federated learning networks with customizable client configurations
- **Simulation Scenarios**: Pre-configured scenarios for healthcare, IoT, and NLP applications
- **Real-time Metrics**: Monitor model convergence, client participation, and privacy guarantees
- **Research Integration**: Browse and access recent academic papers in federated learning

## Technology Stack

- **Frontend**: React 18 with TypeScript
- **UI Framework**: Chakra UI for responsive and accessible components
- **Visualizations**: D3.js for network topology and Recharts for performance metrics
- **Animations**: Framer Motion for smooth UI transitions

## Getting Started

### Prerequisites

- Node.js 16.x or higher
- npm 8.x or higher

### Installation

1. Clone the repository
```bash
git clone https://github.com/fabioliberti/fedcompendiumxl.git
cd fedcompendiumxl
```

2. Install dependencies
```bash
npm install
```

3. Start the development server
```bash
npm start
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser

## Available Scripts

- `npm start`: Runs the app in development mode
- `npm test`: Launches the test runner
- `npm run build`: Builds the app for production
- `npm run eject`: Ejects from Create React App configuration

## Project Structure

The project follows a feature-based organization:

- `src/components/common`: Reusable UI components
- `src/components/visualizations`: D3.js visualization components
- `src/hooks`: Custom React hooks for simulation logic
- `src/pages`: Main application pages

## Customizing Simulations

The application allows customization of federated learning simulations through the following parameters:

- **Number of Clients**: Adjust the scale of the federation
- **Data Distribution**: Choose between IID, non-IID label skew, or non-IID quantity skew
- **Privacy Mechanism**: Enable differential privacy or secure aggregation
- **Aggregation Method**: Select from FedAvg, FedProx, or SCAFFOLD algorithms

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Federated Learning research community
- React and D3.js maintainers
- Chakra UI team for the excellent component library


# Sintesys

## Core Components

- NetworkTopology: Builds on your existing D3.js visualization for federated learning networks
- Dashboard: Enhances your existing dashboard with interactive elements

## UI Components

- SimulationCard: For displaying different simulation scenarios
- MetricCard: For showing performance metrics
- PaperCard: For displaying research papers
- PrivacyMeter: For visualizing privacy guarantees
- ModelStats: For displaying model performance statistics
- ClientParticipation: For visualizing client activity
- ConvergenceChart: For tracking model convergence
- FederationSchema: For explaining the federated learning process

## Pages

- SimulationPage: For configuring and running federated learning simulations
- CompendiumPage: Educational content about federated learning concepts
- PapersPage: Collection of research papers in federated learning

## Infrastructure

useFlSimulation: Custom hook for managing simulation logic
types.ts: TypeScript type definitions for application entities
theme.ts: Custom Chakra UI theme for the application

The application is structured as a complete platform with:

- Interactive visualizations using D3.js
- Educational content on federated learning
- Simulation capabilities for different scenarios
- Research paper repository

All components use Chakra UI for responsive design and follow best practices for React and TypeScript development. The code is organized in a scalable structure that would allow for future expansion.

------------------------------------------
------------------------------------------

# Piano di Evoluzione per FedCompendiumXL

## Analisi dell'Architettura Attuale

Il progetto FedCompendiumXL è un'applicazione React/TypeScript dedicata alla visualizzazione e simulazione di sistemi di Federated Learning. La struttura attuale include:

- Componenti di visualizzazione (convergence charts, network topology, ecc.)
- Un sistema di simulazione FL (useFlSimulation hook)
- Pagine per dashboard, compendio di ricerca e simulazioni
- Integrazione con librerie di visualizzazione (D3, Three.js, Chart.js, Recharts)

## Piano di Evoluzione Modulare

### Fase 1: Miglioramenti Scientifici Fondamentali

#### 1.1 Modelli FL Avanzati
- Implementare algoritmi FL state-of-the-art
  - FedProx: per gestire l'eterogeneità dei client
  - FedAvg con momentum: per accelerare la convergenza
  - SCAFFOLD: per ridurre il drift del client
  - FedNova: normalizzazione per dati non-IID

#### 1.2 Sistema di Benchmark Scientifico
- Creare un framework di confronto per algoritmi FL
- Implementare metriche standard di valutazione:
  - Accuracy globale/locale
  - Communication efficiency
  - Tempo di convergenza
  - Privacy leakage metrics
  - Robustezza contro attacchi

#### 1.3 Integrazione Dataset Reali
- MNIST, CIFAR-10, Shakespeare per benchmarking testuale
- Dataset medicali (es. MIMIC-III) per scenari healthcare
- Dataset IoT per casi d'uso edge computing

### Fase 2: Visualizzazioni Scientifiche Avanzate

#### 2.1 Visualizzazioni Interattive 3D
- Migliorare NetworkTopology3D con Three.js
- Implementare visualizzazione t-SNE/UMAP degli spazi dei modelli dei client
- Visualizzazione avanzata della convergenza in spazi multidimensionali

#### 2.2 Dashboard Analitica Estesa
- Pannelli interattivi di confronto algoritmi
- Heat maps di performance per client
- Grafici di variazione della privacy in tempo reale

#### 2.3 Visualizzazione Architetturale Neurale
- Visualizzazione interattiva delle architetture dei modelli
- Layer-wise analysis della convergenza
- Gradient flow visualization

### Fase 3: Integrazione Scientifica Avanzata

#### 3.1 Framework di Attacchi e Difese
- Modellazione di attacchi common FL:
  - Model inversion
  - Membership inference
  - Model poisoning
- Implementazione di contromisure:
  - Differential privacy
  - Secure aggregation
  - Robust aggregation

#### 3.2 Scenario Customization Engine
- Sistema avanzato di configurazione per esperimenti
- Personalizzazione topologia di rete
- Simulazione di condizioni realistiche (dropout, latency)

#### 3.3 Integrazione Paper Interattivi
- Espandere ResearchPapersGrid per includere replicazioni interattive
- Funzionalità "one-click reproduce" per esperimenti da paper

## Implementazione Tecnica

### Miglioramenti Architetturali

```typescript
// Struttura proposta per il nuovo sistema di simulazione
interface FLAlgorithm {
  initialize(config: SimulationConfig): void;
  clientUpdate(clientId: string, data: ClientData): ModelUpdate;
  serverAggregate(updates: ModelUpdate[]): GlobalModel;
  evaluate(model: GlobalModel, testData: TestData): Metrics;
}

// Implementazioni concrete
class FedAvg implements FLAlgorithm { /* ... */ }
class FedProx implements FLAlgorithm { /* ... */ }
class SCAFFOLD implements FLAlgorithm { /* ... */ }
```

### Sistema di Plugin Modulare

Implementare un sistema di plugin che permetta di estendere facilmente:
- Nuovi algoritmi FL
- Nuove visualizzazioni
- Nuovi dataset
- Nuovi scenari di attacco/difesa

```typescript
// Sistema di registrazione plugin
class PluginRegistry {
  static registerAlgorithm(name: string, algorithm: FLAlgorithmConstructor): void;
  static registerVisualization(name: string, component: React.ComponentType<any>): void;
  static registerDataset(name: string, loader: DatasetLoader): void;
}
```

### API Layer Migliorato

```typescript
// src/api/federated-learning/index.ts
export interface SimulationAPI {
  runSimulation(config: SimulationConfig): Promise<SimulationResult>;
  getBenchmarkResults(algorithms: string[], dataset: string): Promise<BenchmarkResult>;
  getModelAnalytics(modelId: string): Promise<ModelAnalytics>;
}

// Implementazione con supporto cacheing e parallelizzazione
class SimulationService implements SimulationAPI {
  // ...
}
```

## Miglioramenti UX/UI

### Tema Scientifico Avanzato

```typescript
// src/theme.ts
export const scientificTheme = extendTheme({
  colors: {
    primary: {
      50: '#e3f2fd',
      100: '#bbdefb',
      // ... scala completa
      900: '#0d47a1',
    },
    secondary: {
      // ...
    },
    accent: {
      // ...
    },
    visualization: {
      gradient1: [...],
      gradient2: [...],
      // Palette ottimizzate per visualizzazioni scientifiche
    }
  },
  // Componenti stilizzati per pubblicazioni scientifiche
  components: {
    Button: {
      variants: {
        scientific: {
          // ...
        }
      }
    },
    // ...
  }
});
```

### Layout Responsivo Ottimizzato

- Implementare grid system avanzato per dashboard scientifiche
- Ottimizzare per display ad alta risoluzione e multi-monitor
- Supporto per esportazione di visualizzazioni in formato pubblicazione

## Roadmap di Implementazione

### Versione 0.2.0
- Implementare FedAvg, FedProx
- Migliorare visualizzazioni di base
- Framework di benchmark base

### Versione 0.3.0
- Aggiungere SCAFFOLD, FedNova
- Implementare visualizzazioni t-SNE/UMAP
- Integrare primi dataset reali

### Versione 0.4.0
- Framework attacchi/difese base
- Migliorare sistema plugin
- Espandere dashboard analitica

### Versione 1.0.0
- Sistema completo di simulazione
- Suite visualizzazioni avanzate
- Documentazione scientifica completa
- Casi d'uso replicabili da paper recenti

----------------------------------------------
----------------------------------------------
