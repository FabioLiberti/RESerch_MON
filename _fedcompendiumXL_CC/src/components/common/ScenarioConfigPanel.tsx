import React, { useState } from 'react';
import {
  Box,
  Flex,
  Text,
  Heading,
  SimpleGrid,
  Select,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
  FormControl,
  FormLabel,
  Switch,
  Button,
  useColorModeValue,
  Divider,
  Badge,
  Icon,
  Tooltip,
} from '@chakra-ui/react';
import { 
  FiUsers, 
  FiLayers, 
  FiShield, 
  FiCpu, 
  FiInfo,
  FiPlay,
  FiRotateCcw
} from 'react-icons/fi';

interface ScenarioConfigPanelProps {
  initialConfig: {
    numClients: number;
    distribution: 'iid' | 'non_iid_label' | 'non_iid_quantity';
    privacy: 'differential_privacy' | 'secure_aggregation' | null;
    aggregator: 'fedavg' | 'fedprox' | 'scaffold';
  };
  onStartSimulation: (config: any) => void;
  onReset?: () => void;
  isLoading?: boolean;
}

export const ScenarioConfigPanel: React.FC<ScenarioConfigPanelProps> = ({
  initialConfig,
  onStartSimulation,
  onReset,
  isLoading = false,
}) => {
  const [config, setConfig] = useState(initialConfig);
  
  // Chakra UI color mode values
  const bgColor = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const textColor = useColorModeValue('gray.800', 'white');
  const labelColor = useColorModeValue('gray.600', 'gray.400');
  
  // Handle form changes
  const handleNumClientsChange = (valueAsString: string, valueAsNumber: number) => {
    setConfig(prev => ({ ...prev, numClients: valueAsNumber }));
  };
  
  const handleDistributionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setConfig(prev => ({ 
      ...prev, 
      distribution: e.target.value as 'iid' | 'non_iid_label' | 'non_iid_quantity' 
    }));
  };
  
  const handlePrivacyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value === 'none' 
      ? null 
      : e.target.value as 'differential_privacy' | 'secure_aggregation';
    
    setConfig(prev => ({ ...prev, privacy: value }));
  };
  
  const handleAggregatorChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setConfig(prev => ({ 
      ...prev, 
      aggregator: e.target.value as 'fedavg' | 'fedprox' | 'scaffold' 
    }));
  };
  
  const handleSubmit = () => {
    onStartSimulation(config);
  };
  
  const handleReset = () => {
    setConfig(initialConfig);
    if (onReset) onReset();
  };
  
  return (
    <Box
      p={4}
      borderRadius="lg"
      bg={bgColor}
      borderWidth="1px"
      borderColor={borderColor}
    >
      <Heading size="sm" mb={4} color={textColor}>
        Scenario Configuration
      </Heading>
      
      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
        {/* Number of Clients */}
        <FormControl>
          <Flex alignItems="center">
            <Icon as={FiUsers as unknown as React.ElementType} mr={2} color="blue.500" />
            <FormLabel fontSize="sm" color={labelColor} mb={0}>
              Number of Clients
            </FormLabel>
            <Tooltip 
              label="Number of client devices participating in federated learning" 
              placement="top"
            >
              <Box ml={1}>
                <Icon as={FiInfo as unknown as React.ElementType} boxSize={3} color={labelColor} />
              </Box>
            </Tooltip>
          </Flex>
          <NumberInput
            min={3}
            max={100}
            value={config.numClients}
            onChange={handleNumClientsChange}
            size="sm"
            mt={1}
          >
            <NumberInputField />
            <NumberInputStepper>
              <NumberIncrementStepper />
              <NumberDecrementStepper />
            </NumberInputStepper>
          </NumberInput>
        </FormControl>
        
        {/* Data Distribution */}
        <FormControl>
          <Flex alignItems="center">
            <Icon as={FiLayers as unknown as React.ElementType} mr={2} color="purple.500" />
            <FormLabel fontSize="sm" color={labelColor} mb={0}>
              Data Distribution
            </FormLabel>
            <Tooltip 
              label="How data is distributed across client devices" 
              placement="top"
            >
              <Box ml={1}>
                <Icon as={FiInfo as unknown as React.ElementType} boxSize={3} color={labelColor} />
              </Box>
            </Tooltip>
          </Flex>
          <Select
            size="sm"
            value={config.distribution}
            onChange={handleDistributionChange}
            mt={1}
          >
            <option value="iid">IID (Independent & Identically Distributed)</option>
            <option value="non_iid_label">Non-IID (Label Skew)</option>
            <option value="non_iid_quantity">Non-IID (Quantity Skew)</option>
          </Select>
        </FormControl>
        
        {/* Privacy Mechanism */}
        <FormControl>
          <Flex alignItems="center">
            <Icon as={FiShield as unknown as React.ElementType} mr={2} color="green.500" />
            <FormLabel fontSize="sm" color={labelColor} mb={0}>
              Privacy Mechanism
            </FormLabel>
            <Tooltip 
              label="Techniques to protect client data privacy" 
              placement="top"
            >
              <Box ml={1}>
                <Icon as={FiInfo as unknown as React.ElementType} boxSize={3} color={labelColor} />
              </Box>
            </Tooltip>
          </Flex>
          <Select
            size="sm"
            value={config.privacy === null ? 'none' : config.privacy}
            onChange={handlePrivacyChange}
            mt={1}
          >
            <option value="none">None</option>
            <option value="differential_privacy">Differential Privacy</option>
            <option value="secure_aggregation">Secure Aggregation</option>
          </Select>
        </FormControl>
        
        {/* Aggregation Algorithm */}
        <FormControl>
          <Flex alignItems="center">
            <Icon as={FiCpu as unknown as React.ElementType} mr={2} color="orange.500" />
            <FormLabel fontSize="sm" color={labelColor} mb={0}>
              Aggregation Algorithm
            </FormLabel>
            <Tooltip 
              label="Method for combining model updates from clients" 
              placement="top"
            >
              <Box ml={1}>
                <Icon as={FiInfo as unknown as React.ElementType} boxSize={3} color={labelColor} />
              </Box>
            </Tooltip>
          </Flex>
          <Select
            size="sm"
            value={config.aggregator}
            onChange={handleAggregatorChange}
            mt={1}
          >
            <option value="fedavg">FedAvg (Federated Averaging)</option>
            <option value="fedprox">FedProx (Proximal Term)</option>
            <option value="scaffold">SCAFFOLD (Control Variate)</option>
          </Select>
        </FormControl>
      </SimpleGrid>
      
      <Divider my={4} />
      
      {/* Configuration Summary */}
      <Box mb={4}>
        <Text fontSize="sm" fontWeight="medium" mb={2} color={textColor}>
          Configuration Summary:
        </Text>
        <Flex wrap="wrap" gap={2}>
          <Badge colorScheme="blue">
            {config.numClients} Clients
          </Badge>
          <Badge colorScheme={
            config.distribution === 'iid' ? 'green' : 
            config.distribution === 'non_iid_label' ? 'purple' : 
            'orange'
          }>
            {config.distribution === 'iid' ? 'IID' : 
             config.distribution === 'non_iid_label' ? 'Non-IID (Label)' : 
             'Non-IID (Quantity)'}
          </Badge>
          <Badge colorScheme={
            config.privacy === 'differential_privacy' ? 'teal' : 
            config.privacy === 'secure_aggregation' ? 'green' : 
            'gray'
          }>
            {config.privacy === 'differential_privacy' ? 'Diff. Privacy' : 
             config.privacy === 'secure_aggregation' ? 'Secure Agg.' : 
             'No Privacy'}
          </Badge>
          <Badge colorScheme={
            config.aggregator === 'fedavg' ? 'blue' : 
            config.aggregator === 'fedprox' ? 'purple' : 
            'orange'
          }>
            {config.aggregator}
          </Badge>
        </Flex>
      </Box>
      
      {/* Action Buttons */}
      <Flex gap={3} mt={4} justify="flex-end">
        <Button
          leftIcon={<Icon as={FiRotateCcw as unknown as React.ElementType} />}
          variant="outline"
          size="sm"
          onClick={handleReset}
          isDisabled={isLoading}
        >
          Reset
        </Button>
        <Button
          leftIcon={<Icon as={FiPlay as unknown as React.ElementType} />}
          colorScheme="blue"
          size="sm"
          onClick={handleSubmit}
          isLoading={isLoading}
          loadingText="Simulating"
        >
          Start Simulation
        </Button>
      </Flex>
    </Box>
  );
};

export default ScenarioConfigPanel;