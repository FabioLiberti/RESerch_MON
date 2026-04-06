import React, { useState, useEffect } from 'react';
import {
  Box,
  Flex,
  Grid,
  Heading,
  Text,
  useColorModeValue,
  Icon,
  Stack,
  Button,
  HStack,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
  Divider,
  IconProps,
  As,
} from '@chakra-ui/react';
import { motion } from 'framer-motion';
import { 
  FiUsers, 
  FiLayers, 
  FiCpu, 
  FiShield, 
  FiBarChart2,
  FiArrowRight,
  FiDatabase,
  FiActivity
} from 'react-icons/fi';
import { IconType } from 'react-icons';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

// Importa direttamente il componente NetworkTopology
import { NetworkTopology } from '../components/visualizations/NetworkTopology';
import { SimulationCard } from '../components/common/SimulationCard';
import { MetricCard } from '../components/common/MetricCard';
import { PaperCard } from '../components/common/PaperCard';
import { useFlSimulation } from '../hooks/useFlSimulation';

// Fixed CustomIcon component that properly handles IconType
const CustomIcon = ({ icon, ...props }: { icon: IconType } & Omit<IconProps, 'as'>) => {
  return <Icon as={icon as As} {...props} />;
};

// Interface for FederationConfig
interface FederationConfig {
  numClients: number;
  distribution: 'iid' | 'non_iid_label' | 'non_iid_quantity';
  privacy: 'differential_privacy' | 'secure_aggregation' | null;
  aggregator: 'fedavg' | 'fedprox' | 'scaffold';
}

// Tipi per categorie e difficoltà
type Category = 'basics' | 'algorithms' | 'applications' | 'privacy' | 'systems';
type Difficulty = 'beginner' | 'intermediate' | 'advanced';

// Gradient colors definition
const gradientColors = {
  light: {
    primary: 'blue.400',
    secondary: 'teal.400'
  },
  dark: {
    primary: 'blue.600',
    secondary: 'teal.600'
  }
};

const MotionBox = motion(Box);
const MotionFlex = motion(Flex);

interface DashboardProps {
  onStartSimulation?: (config: FederationConfig) => void;
  onViewCompendium?: () => void;
  onViewPapers?: () => void;
}

// Interface for predefined scenarios to ensure correct typing
interface Scenario {
  id: string;
  title: string;
  description: string;
  icon: IconType;
  config: FederationConfig;
}

// Interface per definire il tipo di paper
interface Paper {
  id: string;
  title: string;
  authors: string;
  conference: string;
  year: string;
  categories: Category[];
  difficulty: Difficulty;
  tags: string[];
  imageUrl: string;
}

export const Dashboard: React.FC<DashboardProps> = ({ 
  onStartSimulation,
  onViewCompendium,
  onViewPapers
}) => {
  const [activeScenario, setActiveScenario] = useState<string>('healthcare');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const { simulationResults, runSimulation } = useFlSimulation();
  
  // Color modes for light/dark theme
  const bgColor = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const textColor = useColorModeValue('gray.800', 'white');
  const headerBgGradient = useColorModeValue(
    `linear(to-r, ${gradientColors.light.primary}, ${gradientColors.light.secondary})`,
    `linear(to-r, ${gradientColors.dark.primary}, ${gradientColors.dark.secondary})`
  );
  
  // Example data for visualization
  const convergenceData = [
    { round: 1, fedavg: 0.45, fedprox: 0.47, scaffold: 0.46 },
    { round: 2, fedavg: 0.65, fedprox: 0.68, scaffold: 0.67 },
    { round: 3, fedavg: 0.72, fedprox: 0.76, scaffold: 0.77 },
    { round: 4, fedavg: 0.78, fedprox: 0.83, scaffold: 0.84 },
    { round: 5, fedavg: 0.82, fedprox: 0.86, scaffold: 0.88 },
    { round: 6, fedavg: 0.85, fedprox: 0.89, scaffold: 0.91 },
    { round: 7, fedavg: 0.87, fedprox: 0.91, scaffold: 0.93 },
    { round: 8, fedavg: 0.89, fedprox: 0.93, scaffold: 0.94 },
  ];
  
  const predefinedScenarios: Scenario[] = [
    {
      id: 'healthcare',
      title: 'Healthcare Federated Learning',
      description: 'Simulazione di FL su dati sanitari eterogenei con integrazione HL7/FHIR',
      icon: FiUsers,
      config: {
        numClients: 10,
        distribution: 'non_iid_label',
        privacy: 'differential_privacy',
        aggregator: 'fedavg'
      }
    },
    {
      id: 'iot',
      title: 'IoT Edge Devices',
      description: 'FL su dispositivi edge con vincoli di comunicazione e risorse limitate',
      icon: FiCpu,
      config: {
        numClients: 50,
        distribution: 'non_iid_quantity',
        privacy: null,
        aggregator: 'fedprox'
      }
    },
    {
      id: 'nlp',
      title: 'Federated Language Models',
      description: 'Personalizzazione federata di modelli linguistici su dati privati',
      icon: FiLayers,
      config: {
        numClients: 5,
        distribution: 'non_iid_label',
        privacy: 'secure_aggregation',
        aggregator: 'scaffold'
      }
    }
  ];
  
  // Dati completi dei paper scientifici recenti con categorie, difficoltà e tag
  const recentPapers: Paper[] = [
    {
      id: 'paper1',
      title: 'FedDynamics: Dynamic Client Participation with HL7/FHIR Integration',
      authors: 'Rossi, M., Bianchi, A.',
      conference: 'IEEE Federated Learning Conference 2024',
      year: '2024',
      categories: ['applications', 'systems'],
      difficulty: 'intermediate',
      tags: ['healthcare', 'FHIR', 'dynamic participation'],
      imageUrl: '/images/papers/feddynamics-thumbnail.jpg'
    },
    {
      id: 'paper2',
      title: 'BlockFed: Incentive Mechanisms for Federated Learning via Blockchain',
      authors: 'Verdi, L., Neri, C.',
      conference: 'ACM Conference on Distributed Computing 2024',
      year: '2024',
      categories: ['systems', 'privacy'],
      difficulty: 'advanced',
      tags: ['blockchain', 'incentive', 'security'],
      imageUrl: '/images/papers/blockfed-thumbnail.jpg'
    }
  ];
  
  const handleStartSimulation = async (scenarioId: string) => {
    setIsLoading(true);
    try {
      const scenario = predefinedScenarios.find(s => s.id === scenarioId);
      if (scenario && onStartSimulation) {
        onStartSimulation(scenario.config);
      } else if (scenario) {
        // Execute simulation without external callback
        await runSimulation(scenario.config);
      }
    } catch (error) {
      console.error("Errore durante l'esecuzione della simulazione:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle paper click
  const handlePaperClick = (paperId: string) => {
    console.log(`Paper clicked: ${paperId}`);
    // Implement logic to display paper details
  };
  
  return (
    <Box>
      {/* Header with gradient */}
      <Box 
        bgGradient={headerBgGradient}
        color="white"
        pt={10}
        pb={20}
        px={8}
        borderRadius="lg"
        mb={-10}
      >
        <MotionBox
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <Heading size="2xl" fontWeight="bold" mb={4}>
            Federated Learning Compendium
          </Heading>
          <Text fontSize="xl" maxW="3xl" opacity={0.9}>
            Piattaforma completa per la ricerca, l'apprendimento e lo sviluppo nel campo del Federated Learning, 
            con strumenti interattivi per simulazioni e supporto alla pubblicazione scientifica.
          </Text>
        </MotionBox>
      </Box>
      
      {/* Main content */}
      <Box px={8} py={6}>
        <Grid 
          templateColumns={{ base: "1fr", md: "repeat(3, 1fr)" }}
          gap={6}
          mt={16}
        >
          {/* Scenarios Section */}
          <Box>
            <Heading size="md" mb={4} color={textColor}>
              Scenari Predefiniti
            </Heading>
            <Stack spacing={4}>
              {predefinedScenarios.map((scenario) => (
                <SimulationCard
                  key={scenario.id}
                  title={scenario.title}
                  description={scenario.description}
                  icon={scenario.icon as any} // Type assertion as any to satisfy TypeScript
                  isActive={activeScenario === scenario.id}
                  isLoading={isLoading && activeScenario === scenario.id}
                  onClick={() => {
                    setActiveScenario(scenario.id);
                    handleStartSimulation(scenario.id);
                  }}
                />
              ))}
            </Stack>
            
            <Box mt={8}>
              <Button 
                rightIcon={<CustomIcon icon={FiArrowRight} />}
                colorScheme="blue"
                variant="outline"
                onClick={onViewCompendium}
                w="full"
              >
                Esplora il Compendium
              </Button>
            </Box>
          </Box>
          
          {/* Central section with visualization */}
          <Box gridColumn={{ md: "span 2" }}>
            <Flex 
              direction="column"
              bg={bgColor}
              p={6}
              borderRadius="lg"
              boxShadow="md"
              border="1px"
              borderColor={borderColor}
              minHeight="900px"
              height="100%"
            >
              <Heading size="md" mb={4} color={textColor}>
                Simulazione Federated Learning
              </Heading>
              
              {/* SOLUZIONE DEFINITIVA PER IL CONTENITORE DEL NETWORKTOPOLOGY */}
              <Box
                position="relative"
                mb={12}
                h="320px"
                w="100%"
                overflow="visible"
                sx={{
                  // Stili custom per assicurare che il contenuto SVG sia completamente visibile
                  '& svg': {
                    overflow: 'visible !important'
                  },
                  // Stili per il contenitore
                  border: '1px solid',
                  borderColor: 'gray.100',
                  borderRadius: 'md',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center'
                }}
              >
                <NetworkTopology
                  numClients={predefinedScenarios.find(s => s.id === activeScenario)?.config.numClients || 10}
                  distribution={predefinedScenarios.find(s => s.id === activeScenario)?.config.distribution || 'iid'}
                  isActive={true}
                  width={550}
                  height={310}
                />
              </Box>
              
              <Divider my={5} />
              
              <Heading size="sm" mb={5} color={textColor}>
                Convergenza del Modello
              </Heading>
              
              {/* GRAFICO DI CONVERGENZA */}
              <Box h="380px" mb={6} overflow="visible">
                <ResponsiveContainer width="100%" height="100%" debounce={1}>
                  <LineChart
                    data={convergenceData}
                    margin={{ top: 10, right: 30, left: 20, bottom: 50 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis 
                      dataKey="round" 
                      padding={{ left: 10, right: 10 }}
                      label={{ 
                        value: 'Numero Round', 
                        position: 'insideBottomRight', 
                        offset: -5,
                        dy: 25
                      }}
                      tick={{ fontSize: 12 }}
                    />
                    <YAxis 
                      domain={[0, 1]}
                      tickFormatter={(tick) => `${(tick * 100).toFixed(0)}%`}
                      label={{ 
                        value: 'Accuratezza', 
                        angle: -90, 
                        position: 'insideLeft',
                        dx: -15
                      }}
                      tick={{ fontSize: 12 }}
                    />
                    <Tooltip 
                      formatter={(value: number) => [`${(value * 100).toFixed(1)}%`, 'Accuratezza']}
                      labelFormatter={(label) => `Round ${label}`}
                      contentStyle={{ fontSize: '12px' }}
                    />
                    <Legend 
                      verticalAlign="bottom" 
                      height={36} 
                      wrapperStyle={{ paddingTop: 15, paddingBottom: 15 }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="fedavg" 
                      name="FedAvg"
                      stroke="#8884d8" 
                      activeDot={{ r: 8 }} 
                      strokeWidth={2}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="fedprox" 
                      name="FedProx"
                      stroke="#82ca9d" 
                      strokeWidth={2}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="scaffold" 
                      name="SCAFFOLD"
                      stroke="#ff7300" 
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </Box>
              
              {/* Metric cards */}
              <Box px={0} mt={3}>
                <Grid templateColumns="repeat(3, 1fr)" gap={4}>
                  <MetricCard
                    title="Accuratezza"
                    value="91.4%"
                    delta="+2.8%"
                    description="vs. centralizzato"
                    icon={FiBarChart2 as As}
                  />
                  <MetricCard
                    title="Client Attivi"
                    value="10"
                    delta="8 rounds"
                    description="completati"
                    icon={FiUsers as As}
                  />
                  <MetricCard
                    title="Privacy ε"
                    value="2.1"
                    delta="sicuro"
                    description="DP guarantee"
                    icon={FiShield as As}
                  />
                </Grid>
              </Box>
            </Flex>
          </Box>
        </Grid>
        
        {/* Recent papers section */}
        <Box mt={12}>
          <Flex justify="space-between" align="center" mb={4}>
            <Heading size="md" color={textColor}>
              Paper Scientifici Recenti
            </Heading>
            <Button 
              variant="ghost" 
              rightIcon={<CustomIcon icon={FiArrowRight} />}
              onClick={onViewPapers}
            >
              Vedi tutti
            </Button>
          </Flex>
          
          <Grid templateColumns={{ base: "1fr", md: "repeat(2, 1fr)" }} gap={6}>
            {recentPapers.map(paper => (
              <PaperCard
                key={paper.id}
                title={paper.title}
                authors={paper.authors}
                conference={paper.conference}
                year={paper.year}
                tags={paper.tags}
                categories={paper.categories}
                difficulty={paper.difficulty}
                imageUrl={paper.imageUrl}
                onClick={() => handlePaperClick(paper.id)}
              />
            ))}
          </Grid>
        </Box>
      </Box>
    </Box>
  );
};

export default Dashboard;