import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Flex,
  Heading,
  Text,
  Button,
  useDisclosure,
  useColorModeValue,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  Icon,
  IconProps,
  Divider,
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
} from '@chakra-ui/react';
import { FiBarChart2, FiUsers, FiShield, FiActivity } from 'react-icons/fi';
import { IconType } from 'react-icons';

// Import components
import { NetworkTopology } from '../components/visualizations/NetworkTopology';
import { ClientParticipation } from '../components/visualizations/ClientParticipation';
import { ConvergenceChart } from '../components/visualizations/ConvergenceChart';
import { ModelStats } from '../components/visualizations/ModelStats';
import { PrivacyMeter } from '../components/visualizations/PrivacyMeter';
import { FederationSchema } from '../components/visualizations/FederationSchema';
import { ScenarioConfigPanel } from '../components/common/ScenarioConfigPanel';

// Import hooks
import { useFlSimulation } from '../hooks/useFlSimulation';

// Import types
import { FederationConfig, SimulationResults } from '../types';

// Custom icon component to fix TypeScript issues with IconType
const CustomIcon = ({ icon, ...props }: { icon: IconType } & Omit<IconProps, 'as'>) => {
  // Use type assertion to bypass TypeScript's strict checking for react-icons v5+
  return <Icon as={icon as any} {...props} />;
};

const SimulationPage: React.FC = () => {
  // Color mode values
  const bgColor = useColorModeValue('gray.50', 'gray.900');
  const cardBgColor = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const textColor = useColorModeValue('gray.800', 'white');
  const subTextColor = useColorModeValue('gray.600', 'gray.400');
  
  // Initial configuration
  const initialConfig: FederationConfig = {
    numClients: 10,
    distribution: 'iid',
    privacy: null,
    aggregator: 'fedavg'
  };
  
  // Simulation states
  const { 
    runSimulation, 
    stopSimulation, 
    simulationResults, 
    isRunning, 
    error 
  } = useFlSimulation();
  
  const [activeConfig, setActiveConfig] = useState<FederationConfig>(initialConfig);
  const [isSimulationActive, setIsSimulationActive] = useState(false);
  const [simulationRound, setSimulationRound] = useState(0);
  
  // Start simulation
  const handleStartSimulation = async (config: FederationConfig) => {
    setActiveConfig(config);
    setIsSimulationActive(true);
    
    try {
      await runSimulation(config);
    } catch (error) {
      console.error("Simulation error:", error);
      setIsSimulationActive(false);
    }
  };
  
  // Reset simulation
  const handleResetSimulation = () => {
    stopSimulation();
    setIsSimulationActive(false);
    setSimulationRound(0);
  };
  
  // Simulate rounds progression
  useEffect(() => {
    if (isSimulationActive && simulationResults) {
      const totalRounds = simulationResults.totalRounds;
      let currentRound = 0;
      
      const interval = setInterval(() => {
        if (currentRound < totalRounds) {
          currentRound++;
          setSimulationRound(currentRound);
        } else {
          clearInterval(interval);
        }
      }, 1000);
      
      return () => clearInterval(interval);
    }
  }, [isSimulationActive, simulationResults]);
  
  // Sample convergence data for visualization
  const generateConvergenceData = () => {
    if (!simulationResults) {
      // Default data if no simulation results yet
      return Array.from({ length: 8 }, (_, i) => ({
        round: i + 1,
        fedavg: 0.5 + (0.4 * (1 - Math.exp(-0.4 * (i + 1)))),
        fedprox: 0.5 + (0.45 * (1 - Math.exp(-0.45 * (i + 1)))),
        scaffold: 0.5 + (0.46 * (1 - Math.exp(-0.5 * (i + 1))))
      }));
    }
    
    // Create data based on simulation results
    return simulationResults.modelSnapshots.map(snapshot => ({
      round: snapshot.round,
      [activeConfig.aggregator]: snapshot.globalAccuracy,
      // Add predicted values for other aggregators for comparison
      ...(activeConfig.aggregator !== 'fedavg' 
        ? { fedavg: snapshot.globalAccuracy * 0.92 } 
        : {}),
      ...(activeConfig.aggregator !== 'fedprox' 
        ? { fedprox: snapshot.globalAccuracy * 1.03 } 
        : {}),
      ...(activeConfig.aggregator !== 'scaffold' 
        ? { scaffold: snapshot.globalAccuracy * 1.05 } 
        : {})
    }));
  };
  
  // Data for charts
  const convergenceData = generateConvergenceData();
  
  return (
    <Box minH="100vh" bg={bgColor} py={8} px={{ base: 4, md: 8 }}>
      <Heading as="h1" size="xl" mb={2} color={textColor}>
        Federated Learning Simulation
      </Heading>
      <Text mb={8} color={subTextColor}>
        Configure and run federated learning simulations with different parameters
      </Text>
      
      <Grid 
        templateColumns={{ base: "1fr", lg: "300px 1fr" }}
        gap={6}
      >
        {/* Configuration Panel */}
        <Box>
          <ScenarioConfigPanel
            initialConfig={initialConfig}
            onStartSimulation={handleStartSimulation}
            onReset={handleResetSimulation}
            isLoading={isRunning}
          />
          
          {simulationResults && (
            <Box mt={6}>
              <FederationSchema
                aggregator={activeConfig.aggregator}
                privacy={activeConfig.privacy}
                isActive={isSimulationActive}
              />
            </Box>
          )}
        </Box>
        
        {/* Main Visualization Area */}
        <Box>
          {error && (
            <Alert status="error" mb={6} borderRadius="md">
              <AlertIcon />
              <AlertTitle>Simulation Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          
          {!simulationResults ? (
            <Box
              p={8}
              bg={cardBgColor}
              borderRadius="lg"
              borderWidth="1px"
              borderColor={borderColor}
              textAlign="center"
            >
              <Box color="blue.500" mb={4} display="flex" justifyContent="center">
                <CustomIcon icon={FiActivity} boxSize={12} />
              </Box>
              <Heading size="md" mb={2}>
                Configure Your Simulation
              </Heading>
              <Text color={subTextColor} mb={4}>
                Set your parameters and click "Start Simulation" to begin
              </Text>
            </Box>
          ) : (
            <Box>
              {/* Network Visualization */}
              <Box
                p={4}
                mb={6}
                bg={cardBgColor}
                borderRadius="lg"
                borderWidth="1px"
                borderColor={borderColor}
              >
                <Heading size="sm" mb={4} color={textColor}>
                  Network Topology
                </Heading>
                <Box h="300px">
                  <NetworkTopology
                    numClients={activeConfig.numClients}
                    distribution={activeConfig.distribution}
                    isActive={isSimulationActive}
                    width={800}
                    height={300}
                  />
                </Box>
              </Box>
              
              {/* Performance Metrics */}
              <Grid templateColumns={{ base: "1fr", md: "repeat(2, 1fr)" }} gap={6} mb={6}>
                <ModelStats
                  accuracy={simulationResults?.finalAccuracy ?? 0.75}
                  previousAccuracy={0.65}
                  loss={simulationResults?.finalLoss ?? 0.25}
                  previousLoss={0.35}
                  convergenceRate={simulationResults?.convergenceRate ?? 0.1}
                  roundsCompleted={simulationRound}
                  totalRounds={simulationResults?.totalRounds ?? 8}
                  communicationCost={simulationResults?.communicationCost}
                />
                
                <ClientParticipation
                  totalClients={activeConfig.numClients}
                  activeClients={Math.floor(activeConfig.numClients * 0.8)}
                  roundNumber={simulationRound}
                  distribution={activeConfig.distribution}
                />
              </Grid>
              
              <Tabs variant="enclosed" borderColor={borderColor}>
                <TabList>
                  <Tab>Convergence</Tab>
                  <Tab>Privacy</Tab>
                </TabList>
                
                <TabPanels>
                  <TabPanel p={0} pt={4}>
                    <Box
                      p={4}
                      bg={cardBgColor}
                      borderRadius="lg"
                      borderWidth="1px"
                      borderColor={borderColor}
                    >
                      <ConvergenceChart 
                        data={convergenceData}
                        height={300}
                      />
                    </Box>
                  </TabPanel>
                  
                  <TabPanel p={0} pt={4}>
                    <Grid templateColumns={{ base: "1fr", md: "repeat(2, 1fr)" }} gap={6}>
                      <PrivacyMeter
                        epsilon={activeConfig.privacy === 'differential_privacy' ? 2.1 : undefined}
                        privacyMechanism={activeConfig.privacy ?? null}
                      />
                      
                      <Box
                        p={4}
                        borderRadius="lg"
                        bg={cardBgColor}
                        borderWidth="1px"
                        borderColor={borderColor}
                      >
                        <Heading size="sm" mb={4}>
                          Privacy-Utility Tradeoff
                        </Heading>
                        <Text fontSize="sm" color={subTextColor}>
                          Enhancing privacy typically comes at the cost of model utility. 
                          {activeConfig.privacy === 'differential_privacy' && 
                            " With ε = 2.1, we're balancing reasonable privacy with good model performance."}
                          {activeConfig.privacy === 'secure_aggregation' && 
                            " Secure Aggregation preserves model utility while providing cryptographic privacy guarantees."}
                          {activeConfig.privacy === null && 
                            " No privacy mechanism is currently enabled, offering maximum utility but no formal privacy guarantees."}
                        </Text>
                      </Box>
                    </Grid>
                  </TabPanel>
                </TabPanels>
              </Tabs>
            </Box>
          )}
        </Box>
      </Grid>
    </Box>
  );
};

export default SimulationPage;