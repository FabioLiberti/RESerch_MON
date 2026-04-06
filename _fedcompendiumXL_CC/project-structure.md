# Struttura del Progetto FedLearn Compendium

```
fedlearn-compendium/
├── README.md                           # Documentazione del progetto
├── package.json                        # Configurazione principale del progetto
├── tsconfig.json                       # Configurazione TypeScript
├── lerna.json                          # Configurazione per gestione monorepo
├── .eslintrc.js                        # Configurazione linting
├── .prettierrc                         # Configurazione formattazione codice
├── docker-compose.yml                  # Configurazione Docker per sviluppo
├── packages/                           # Struttura monorepo
│   ├── core/                           # Libreria core per federated learning
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── models/                 # Implementazioni modelli FL
│   │   │   ├── aggregators/            # Algoritmi di aggregazione
│   │   │   ├── client/                 # Client FL
│   │   │   ├── server/                 # Server FL
│   │   │   ├── privacy/                # Meccanismi di privacy
│   │   │   └── metrics/                # Funzioni per metriche di valutazione
│   │   └── tests/
│   │
│   ├── simulation/                     # Engine di simulazione
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── engine/                 # Core del simulatore
│   │   │   ├── scenarios/              # Scenari predefiniti
│   │   │   ├── distributions/          # Distribuzioni dati
│   │   │   └── visualizations/         # Generatore visualizzazioni
│   │   └── tests/
│   │
│   ├── webapp/                         # Frontend React dell'applicazione
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── public/                     # Asset statici
│   │   ├── src/
│   │   │   ├── pages/                  # Pagine principali
│   │   │   │   ├── Home.tsx
│   │   │   │   ├── Compendium/         # Pagine del compendium
│   │   │   │   ├── Playground/         # Area interattiva
│   │   │   │   ├── Papers/             # Sezione paper scientifici
│   │   │   │   └── Experiments/        # Area esperimenti
│   │   │   ├── components/             # Componenti riutilizzabili
│   │   │   │   ├── common/             # Componenti UI generici
│   │   │   │   ├── visualizations/     # Componenti di visualizzazione
│   │   │   │   ├── inputs/             # Form e controlli input
│   │   │   │   └── layout/             # Componenti di layout
│   │   │   ├── hooks/                  # Custom hooks
│   │   │   ├── context/                # Context provider
│   │   │   ├── styles/                 # Stili globali
│   │   │   ├── utils/                  # Utility
│   │   │   ├── types/                  # Type definitions
│   │   │   ├── App.tsx                 # Componente root
│   │   │   └── index.tsx               # Entry point
│   │   └── tests/
│   │
│   ├── api/                            # Backend API
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── controllers/            # Controller API
│   │   │   ├── services/               # Business logic
│   │   │   ├── models/                 # Data models
│   │   │   ├── routes/                 # Definizione routes
│   │   │   ├── middleware/             # Middleware
│   │   │   ├── utils/                  # Utility functions
│   │   │   └── index.ts                # Entry point
│   │   └── tests/
│   │
│   └── shared/                         # Codice condiviso
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── types/                  # Type definitions condivise
│           ├── constants/              # Costanti condivise
│           └── utils/                  # Utility condivise
│
├── content/                            # Contenuti educativi
│   ├── introduction/                   # Introduzione al FL
│   ├── theory/                         # Fondamenti teorici
│   ├── applications/                   # Applicazioni reali
│   ├── techniques/                     # Tecniche avanzate
│   ├── privacy/                        # Privacy nel FL
│   └── research/                       # Stato dell'arte della ricerca
│
├── papers/                             # Template e risorse per paper
│   ├── templates/                      # Template LaTeX
│   ├── figures/                        # Figure generate
│   ├── experiments/                    # Configurazioni esperimenti
│   └── results/                        # Risultati salvati
│
└── scripts/                            # Script di automazione
    ├── setup.sh                        # Script di setup
    ├── build.sh                        # Script di build
    └── deploy.sh                       # Script di deployment
```

## Struttura per Setup Rapido

Per iniziare velocemente con una demo visuale, è possibile usare una struttura più semplice:

```
fedlearn-compendium/
├── public/
│   ├── images/                         # Immagini e asset statici
│   └── index.html                      # HTML root
├── src/
│   ├── components/
│   │   ├── common/                     # Componenti UI comuni
│   │   │   ├── SimulationCard.tsx      # Card per scenari predefiniti
│   │   │   ├── MetricCard.tsx          # Card per metriche
│   │   │   └── PaperCard.tsx           # Card per paper
│   │   └── visualizations/             # Visualizzazioni
│   │       └── NetworkTopology.tsx     # Visualizzazione topologia di rete
│   ├── hooks/
│   │   └── useFlSimulation.ts          # Hook per simulazioni FL
│   ├── pages/
│   │   └── Dashboard.tsx               # Dashboard principale
│   ├── styles/
│   │   └── theme.ts                    # Configurazione tema
│   ├── types/
│   │   └── simulation.ts               # Type definitions per simulazioni
│   ├── App.tsx                         # Componente App principale
│   └── index.tsx                       # Entry point
├── package.json                        # Dipendenze del progetto
└── tsconfig.json                       # Configurazione TypeScript
```